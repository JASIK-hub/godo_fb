// HTTPS deployment smoke test. Only synthetic data; no secrets or response bodies in logs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let directory;
try {
  const api = new URL(process.env.PROXY_ORIGIN);
  const ui = new URL(process.env.UI_ORIGIN);
  const key = process.env.JURY_API_KEY;
  assert.ok(key && api.protocol === 'https:' && ui.protocol === 'https:');
  const call = async (path, init = {}) => {
    const response = await fetch(new URL(path, api), { ...init, redirect: 'error', signal: AbortSignal.timeout(120000) });
    const text = await response.text();
    assert.ok(!text.includes(key) && !JSON.stringify([...response.headers]).includes(key));
    return { status: response.status, headers: response.headers, text };
  };
  for (const [method, path] of [['POST', '/api/v1/analyze'], ['GET', '/api/v1/jobs/missing']]) {
    assert.equal((await call(path, { method })).status, 401);
    assert.equal((await call(path, { method, headers: { 'X-API-Key': 'synthetic-wrong-key' } })).status, 401);
  }
  assert.equal((await call('/api/v1/jobs/missing', { headers: { 'X-API-Key': key } })).status, 404);
  directory = await mkdtemp(join(tmpdir(), 'godo-proxy-smoke-'));
  const file = join(directory, 'synthetic.mov');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
    'color=c=blue:s=640x480:r=25', '-frames:v', '33', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24', '-threads', '1', file],
  { windowsHide: true, stdio: 'ignore' });
  const video = await readFile(file);
  assert.ok(video.length > 29 * 1024 * 1024 && video.length < 30 * 1024 * 1024);
  const form = new FormData();
  form.append('file', new Blob([video], { type: 'video/quicktime' }), 'synthetic.mov');
  const accepted = await call('/api/site/analyze', { method: 'POST', headers: { Origin: ui.origin }, body: form });
  assert.equal(accepted.status, 202);
  assert.equal(accepted.headers.get('access-control-allow-origin'), ui.origin);
  assert.equal(accepted.headers.get('set-cookie'), null);
  const { job_id } = JSON.parse(accepted.text);
  assert.match(job_id, /^[a-f0-9-]{36}$/);
  const deadline = Date.now() + 300000;
  let done;
  while (Date.now() < deadline) {
    const state = await call(`/api/site/jobs/${job_id}`, { headers: { Origin: ui.origin } });
    assert.equal(state.status, 200);
    done = JSON.parse(state.text);
    if (done.status !== 'processing') break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.equal(done.status, 'done');
  assert.equal(done.source, 'ml');
  const direct = await call(`/api/v1/jobs/${job_id}`, { headers: { 'X-API-Key': key } });
  assert.equal(direct.status, 404); // Site and jury jobs have separate owners.
  console.log('PASS: HTTPS upload of synthetic 29 MiB MOV, API auth, CORS, response secrecy and job isolation. Browser UI/assets need a separate browser check.');
} catch {
  console.error('FAIL: check server env, HTTPS origins, ingress limits, FFmpeg and ML readiness. Secrets and response bodies omitted.');
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
