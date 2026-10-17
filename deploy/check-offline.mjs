// Run from repository root after images/weights/catalog are staged and Compose is up.
// Does not print or send video/frame descriptions outside the deployment.
import { execFileSync } from 'node:child_process';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const probe = `const net=require('node:net');
async function blocked(host){return new Promise((resolve,reject)=>{
const s=net.connect({host,port:443});s.setTimeout(2500);
s.once('connect',()=>{s.destroy();reject(new Error('Unexpected internet route: '+host))});
s.once('error',()=>resolve());s.once('timeout',()=>{s.destroy();resolve()});});}
Promise.all(['1.1.1.1','8.8.8.8','example.com'].map(blocked)).then(()=>console.log('Egress probes blocked')).catch(e=>{console.error(e.message);process.exitCode=1});`;

for (const service of ['backend', 'ml']) {
  const id = docker('compose', 'ps', '-q', service);
  if (!id) throw new Error(`${service} is not running`);
  const container = JSON.parse(docker('inspect', id))[0];
  for (const network of Object.keys(container.NetworkSettings.Networks)) {
    if (!JSON.parse(docker('network', 'inspect', network))[0].Internal) throw new Error(`${service} has external network ${network}`);
  }
  // The diagnostic process shares the exact target network namespace.
  console.log(service);
  docker('run', '--rm', '--pull=never', '--network', `container:${id}`, '--entrypoint', 'node', 'godo-backend:local', '-e', probe);
}

docker('compose', 'exec', '-T', 'backend', 'ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i',
  'color=c=blue:s=640x480:r=25', '-frames:v', '33', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '1', '/tmp/offline-synthetic.mov');
const check = `const {openAsBlob}=require('node:fs');
(async()=>{
const health=await fetch('http://127.0.0.1:3000/health/ready');if(!health.ok)throw Error('Readiness failed');
const started=Date.now(), form=new FormData();form.append('file',await openAsBlob('/tmp/offline-synthetic.mov',{type:'video/quicktime'}),'synthetic.mov');
const headers={'X-API-Key':process.env.JURY_API_KEY};
const upload=await fetch('http://127.0.0.1:3000/api/v1/analyze',{method:'POST',headers,body:form});
if(upload.status!==202)throw Error('Upload failed: '+upload.status);
const {job_id}=await upload.json();
while(Date.now()-started<305000){
const r=await fetch('http://127.0.0.1:3000/api/v1/jobs/'+job_id,{headers});if(!r.ok)throw Error('Polling failed');const j=await r.json();
if(j.status!=='processing'){
console.log(JSON.stringify({job_id,status:j.status,verdict:j.verdict,source:j.source,violations_count:j.violations?.length,elapsed_ms:Date.now()-started,error_code:j.error?.code}));
if(j.status!=='done'||j.source!=='ml'||Date.now()-started>300000)throw Error('Real ML acceptance test failed');return;}
await new Promise(r=>setTimeout(r,1000));}
throw Error('Deadline exceeded');})().catch(e=>{console.error(e.message);process.exitCode=1});`;
console.log(docker('compose', 'exec', '-T', 'backend', 'node', '-e', check));
console.log('Completed with internal networking and blocked egress. This tests this synthetic input only.');
