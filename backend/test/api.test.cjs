const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const request = require('supertest');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { createApp } = require('../dist/app');
const { Config } = require('../dist/config');
const { mkdtemp, rm, readFile, writeFile, readdir, utimes } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const { Store } = require('../dist/store');
const { randomUUID } = require('node:crypto');

const API_KEY = 'test-api-key-'.repeat(4);
const UI_CODE = 'test-ui-code-'.repeat(4);
const origin = 'http://localhost:5173';
let app, api, ml, mlMode = 'success', received, releaseMl;
let video, largeVideo, testDir, mlCalls = 0;

function environment() {
  Object.assign(process.env, {
    NODE_ENV: 'test', JURY_API_KEY: API_KEY, UI_ACCESS_CODE: UI_CODE, UI_ORIGIN: origin,
    ML_STUB_ENABLED: 'false', ML_TIMEOUT_MS: '1000',
    MAX_PENDING_JOBS: '2', ML_CONCURRENCY: '1', JOB_TTL_MS: '3600000',
    MAX_UPLOAD_BYTES: '33554432', MEDIA_TIMEOUT_MS: '3000', JOB_DEADLINE_MS: '10000', DEADLINE_MARGIN_MS: '100',
    RULES_PATH: resolve('config/rules.example.json'),
  });
}

before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'godo-audit-test-'));
  const makeVideo = (name, args) => execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',
    ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=640x480:r=25', ...args, '-threads', '1', join(testDir, name)], { windowsHide: true });
  makeVideo('small.mov', ['-t', '2', '-c:v', 'mpeg4']);
  makeVideo('large.mov', ['-frames:v', '33', '-c:v', 'rawvideo', '-pix_fmt', 'rgb24']);
  video = await readFile(join(testDir, 'small.mov'));
  largeVideo = await readFile(join(testDir, 'large.mov'));
  ml = createServer(async (req, res) => {
    if (req.url === '/health') { res.end('ok'); return; }
    mlCalls++;
    const chunks = [];
    try { for await (const part of req) chunks.push(part); } catch { return; }
    received = { body: Buffer.concat(chunks), headers: req.headers };
    if (mlMode === 'hold') await new Promise(resolve => { releaseMl = resolve; });
    if (mlMode === 'timeout') await new Promise(resolve => setTimeout(resolve, 1400));
    if (mlMode === 'error') { res.writeHead(503).end('private upstream error'); return; }
    if (mlMode === 'json') { res.end('{not-json'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(mlMode === 'invalid' ? { verdict: 'pass', violations: 'wrong' } : mlMode === 'pass' ? { verdict: 'no_violation', violations: [] } : {
      verdict: 'fail', violations: [{ code: mlMode === 'rule' ? 'UNKNOWN' : 'TEST', message: 'Test violation',
        timestamp_seconds: mlMode === 'timestamp' ? 100 : 0.5, ...(mlMode === 'frames' ? { frames: ['https://external.invalid/private.jpg'] } : {}) }],
    }));
  });
  await new Promise(resolve => ml.listen(0, '127.0.0.1', resolve));
  environment();
  process.env.DATA_DIR = join(testDir, 'main');
  process.env.ML_URL = `http://127.0.0.1:${ml.address().port}/analyze`;
  process.env.ML_HEALTH_URL = `http://127.0.0.1:${ml.address().port}/health`;
  process.env.ML_API_KEY = 'separate-ml-key';
  ({ app } = await createApp());
  await app.init();
  api = request(app.getHttpServer());
});

after(async () => {
  releaseMl?.();
  await app?.close();
  await new Promise(resolve => ml.close(resolve));
  await rm(testDir, { recursive: true, force: true });
});

const upload = () => api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, { filename: 'clip.mp4', contentType: 'video/mp4' });
async function poll(id) {
  for (let i = 0; i < 500; i++) {
    const result = await api.get(`/api/v1/jobs/${id}`).set('X-API-Key', API_KEY).expect(200);
    if (result.body.status !== 'processing') return result.body;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Job did not finish');
}

test('OpenAPI contract is valid', async () => {
  await SwaggerParser.validate('../contracts/public-api.yaml');
});

test('both public routes require API key, even with UI credentials', async () => {
  await api.post('/api/v1/analyze').expect(401);
  await api.get('/api/v1/jobs/anything').expect(401);
  await api.get('/api/v1/jobs/anything').set('X-API-Key', UI_CODE).expect(401);
  await api.get('/api/v1/jobs/anything').set('X-API-Key', API_KEY).expect(404);
});

test('API key guard rejects missing/empty/wrong keys on both routes before upload or ML', async () => {
  const calls = mlCalls;
  const filesBefore = (await readdir(join(process.env.DATA_DIR, 'uploads'))).sort();
  for (const key of [undefined, '', 'wrong-short', 'x'.repeat(Buffer.byteLength(API_KEY)), UI_CODE]) {
    let post = api.post('/api/v1/analyze');
    if (key !== undefined) post = post.set('X-API-Key', key);
    // Invalid multipart must not reach the parser or produce an upload-validation error.
    await post.set('Content-Type', 'multipart/form-data').send('invalid multipart').expect(401);
    let get = api.get('/api/v1/jobs/missing');
    if (key !== undefined) get = get.set('X-API-Key', key);
    await get.expect(401);
  }
  assert.deepEqual((await readdir(join(process.env.DATA_DIR, 'uploads'))).sort(), filesBefore);
  assert.equal(mlCalls, calls);
  for (const header of ['x-api-key', 'X-API-KEY', 'x-ApI-kEy']) {
    await api.post('/api/v1/analyze').set(header, API_KEY).send({}).expect(400);
    await api.get('/api/v1/jobs/missing').set(header, API_KEY).expect(404);
  }
});

test('process exits with a safe explicit error when JURY_API_KEY is absent or blank; legacy key is not a fallback', () => {
  for (const value of [undefined, '', '   ']) {
    const env = { ...process.env, API_KEY: 'legacy-secret-must-not-be-used-or-logged' };
    if (value === undefined) delete env.JURY_API_KEY;
    else env.JURY_API_KEY = value;
    const result = spawnSync(process.execPath, ['dist/main.js'], { env, encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /JURY_API_KEY must be set and non-empty/);
    assert.equal(result.stderr.includes(env.API_KEY), false);
    assert.equal(result.stderr.includes(UI_CODE), false);
  }
});

test('202 returns before ML finishes; video is forwarded and result is sanitized', async () => {
  mlMode = 'hold';
  const { body } = await upload().expect(202);
  assert.match(body.job_id, /^[a-f0-9-]{36}$/);
  const processing = await api.get(`/api/v1/jobs/${body.job_id}`).set('X-API-Key', API_KEY).expect(200);
  assert.equal(processing.body.status, 'processing');
  while (!releaseMl) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(received.body.includes(video));
  assert.match(received.headers['content-type'], /multipart\/form-data; boundary=/);
  assert.equal(received.headers['x-api-key'], 'separate-ml-key');
  releaseMl(); mlMode = 'success';
  const done = await poll(body.job_id);
  assert.equal(done.status, 'done', JSON.stringify(done));
  assert.equal(done.source, 'ml');
  assert.equal(done.verdict, 'fail');
  assert.equal(done.violations[0].timestamp_seconds, 0.5);
  assert.equal(received.headers['x-job-id'], body.job_id);
  assert.ok(Date.parse(received.headers['x-deadline-at']) > Date.now());
});

test('rejects missing, empty, oversized, unsupported and extra uploads; capacity recovers', async () => {
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).send({}).expect(400);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', Buffer.alloc(0), { filename: 'empty.mp4', contentType: 'video/mp4' }).expect(400);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', Buffer.alloc(33554433), { filename: 'big.mp4', contentType: 'video/mp4' }).expect(413);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, 'x.txt').expect(415);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('other', video, 'x.mp4').expect(400);
  await upload().attach('file', video, 'second.mp4').expect(400);
  const { body } = await upload().expect(202);
  await poll(body.job_id);
});

test('ML errors, invalid responses and timeouts produce failed jobs without upstream details', async () => {
  for (const [mode, code] of [['error', 'ML_UNAVAILABLE'], ['invalid', 'ML_INVALID_RESPONSE'], ['json', 'ML_INVALID_RESPONSE'],
    ['rule', 'ML_INVALID_RESPONSE'], ['timestamp', 'ML_INVALID_RESPONSE'], ['frames', 'ML_INVALID_RESPONSE'], ['timeout', 'ML_UNAVAILABLE']]) {
    mlMode = mode;
    const { body } = await upload().expect(202);
    const failed = await poll(body.job_id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error.code, code);
    assert.equal(failed.error.message, 'Video analysis failed');
  }
  mlMode = 'success';
});

test('queue is bounded and resumes after a failure', async () => {
  mlMode = 'timeout';
  const a = await upload().expect(202);
  const b = await upload().expect(202);
  await upload().expect(503);
  await poll(a.body.job_id);
  await poll(b.body.job_id);
  mlMode = 'success';
  const next = await upload().expect(202);
  assert.equal((await poll(next.body.job_id)).status, 'done');
});

test('UI session uses its own credential, requires Origin, isolates jobs and revokes logout', async () => {
  await api.post('/api/v1/ui/session').send({ access_code: UI_CODE }).expect(403);
  await api.post('/api/v1/ui/session').set('Origin', origin).send({ access_code: API_KEY }).expect(401);
  const login = await api.post('/api/v1/ui/session').set('Origin', origin).send({ access_code: UI_CODE }).expect(201);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.match(login.headers['set-cookie'][0], /HttpOnly/);
  assert.match(login.headers['set-cookie'][0], /SameSite=Strict/);
  assert.equal(JSON.stringify(login.body).includes(UI_CODE), false);
  await api.post('/api/v1/analyze').set('Cookie', cookie).expect(401);
  await api.post('/api/v1/ui/analyze').set('Cookie', cookie).set('Origin', 'https://evil.example').expect(403);
  const job = await api.post('/api/v1/ui/analyze').set('Cookie', cookie).set('Origin', origin).attach('file', video, 'x.mp4').expect(202);
  await api.get(`/api/v1/ui/jobs/${job.body.job_id}`).set('Cookie', cookie).expect(200);
  await api.get(`/api/v1/jobs/${job.body.job_id}`).set('X-API-Key', API_KEY).expect(404);
  const second = await api.post('/api/v1/ui/session').set('Origin', origin).send({ access_code: UI_CODE }).expect(201);
  await api.get(`/api/v1/ui/jobs/${job.body.job_id}`).set('Cookie', second.headers['set-cookie'][0].split(';')[0]).expect(404);
  await api.delete('/api/v1/ui/session').set('Cookie', cookie).set('Origin', origin).expect(204);
  await api.get(`/api/v1/ui/jobs/${job.body.job_id}`).set('Cookie', cookie).expect(401);
});

test('stub is explicit and forbidden in final environments; real ML config is required', () => {
  const saved = { ...process.env };
  try {
    for (const env of ['production', 'staging', 'final']) {
      Object.assign(process.env, { NODE_ENV: env, UI_ORIGIN: 'https://ui.example', ML_STUB_ENABLED: 'true' });
      assert.throws(() => new Config(), /stub is forbidden/);
    }
    delete process.env.NODE_ENV;
    assert.throws(() => new Config(), /stub is forbidden/);
    environment();
    delete process.env.ML_URL;
    delete process.env.ML_STUB_ENABLED;
    assert.throws(() => new Config());
    process.env.ML_STUB_ENABLED = 'true';
    assert.equal(new Config().stub, true);
  } finally { process.env = saved; }
});

test('explicit stub returns clearly marked demo results; jobs and sessions expire', async () => {
  const saved = { ...process.env };
  let demo;
  try {
    Object.assign(process.env, { ML_STUB_ENABLED: 'true', JOB_TTL_MS: '200', SESSION_TTL_MS: '200', DATA_DIR: join(testDir, 'demo') });
    ({ app: demo } = await createApp());
    await demo.init();
    const client = request(demo.getHttpServer());
    const job = await client.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, 'x.mp4').expect(202);
    let result;
    for (let i = 0; i < 500; i++) {
      result = await client.get(`/api/v1/jobs/${job.body.job_id}`).set('X-API-Key', API_KEY).expect(200);
      if (result.body.status === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(result.body.source, 'stub');
    const session = await client.post('/api/v1/ui/session').set('Origin', origin).send({ access_code: UI_CODE }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 250));
    await client.get(`/api/v1/jobs/${job.body.job_id}`).set('X-API-Key', API_KEY).expect(404);
    await client.get('/api/v1/ui/jobs/anything').set('Cookie', session.headers['set-cookie'][0].split(';')[0]).expect(401);
  } finally { await demo?.close(); process.env = saved; }
});

test('29 MiB synthetic MOV decodes and no_violation maps to public pass', async () => {
  assert.ok(largeVideo.length > 29 * 1024 * 1024 && largeVideo.length < 30 * 1024 * 1024);
  mlMode = 'pass';
  const result = await api.post('/api/v1/analyze').set('X-API-Key', API_KEY)
    .attach('file', largeVideo, { filename: '../../unsafe.MOV', contentType: 'video/quicktime' }).expect(202);
  const done = await poll(result.body.job_id);
  assert.equal(done.status, 'done');
  assert.equal(done.verdict, 'pass');
  assert.deepEqual(done.violations, []);
  assert.match(app.get(Store).get(result.body.job_id).file, /^[a-f0-9-]{36}$/);
  mlMode = 'success';
});

test('corrupt video fails before contacting ML', async () => {
  const calls = mlCalls;
  const result = await api.post('/api/v1/analyze').set('X-API-Key', API_KEY)
    .attach('file', Buffer.from('not a video'), { filename: 'fake.mov', contentType: 'video/quicktime' }).expect(202);
  const failed = await poll(result.body.job_id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error.code, 'INVALID_VIDEO');
  assert.equal(mlCalls, calls);
});

test('queued deadline expires without inference; API remains responsive', async () => {
  mlMode = 'timeout';
  const first = await upload().expect(202);
  const store = app.get(Store);
  const id = randomUUID();
  store.insert({ id, owner: 'api', file: randomUUID(), mime: 'video/quicktime', created: Date.now(),
    deadline: Date.now() + 120, expires: Number.MAX_SAFE_INTEGER, job: { job_id: id, status: 'processing' } });
  await api.get('/health/live').expect(200);
  assert.equal((await poll(id)).error.code, 'DEADLINE_EXCEEDED');
  await poll(first.body.job_id);
  mlMode = 'success';
});

test('readiness checks media tools, local database and ML health', async () => {
  await api.get('/health/ready').expect(200);
});

test('duration limit is enforced before ML and retention deletes old orphan uploads', async () => {
  const config = app.get(Config);
  const previousDuration = config.maxDuration;
  const calls = mlCalls;
  try {
    config.maxDuration = 1;
    const result = await upload().expect(202);
    assert.equal((await poll(result.body.job_id)).error.code, 'INVALID_VIDEO');
    assert.equal(mlCalls, calls);
  } finally { config.maxDuration = previousDuration; }
  const orphan = join(config.dataDir, 'uploads', randomUUID());
  await writeFile(orphan, 'synthetic orphan');
  await utimes(orphan, new Date(0), new Date(0));
  const { Worker } = require('../dist/worker');
  await app.get(Worker).cleanFiles();
  assert.equal((await readdir(join(config.dataDir, 'uploads'))).includes(require('node:path').basename(orphan)), false);
});

test('hard restart preserves completed results, sessions and fails interrupted jobs without replay', async () => {
  const env = { ...process.env, DATA_DIR: join(testDir, 'restart'), ML_TIMEOUT_MS: '2000' };
  const start = () => new Promise((resolveStart, reject) => {
    const child = spawn(process.execPath, ['-e', "require('./dist/app').createApp().then(async({app})=>{await app.listen(0,'127.0.0.1');console.log('URL:'+await app.getUrl())})"],
      { env, cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Child startup timeout')); }, 10000);
    child.once('error', reject);
    child.stdout.on('data', data => { const match = data.toString().match(/URL:(http:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolveStart({ child, client: request(match[1]) }); } });
    child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error(`Child exited ${code}`)); });
  });
  const kill = child => new Promise(resolveExit => { child.once('exit', resolveExit); child.kill('SIGKILL'); });
  let proc = await start();
  try {
    mlMode = 'pass';
    const done = await proc.client.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, 'v.mov').expect(202);
    for (let i = 0; i < 500; i++) {
      const state = await proc.client.get(`/api/v1/jobs/${done.body.job_id}`).set('X-API-Key', API_KEY).expect(200);
      if (state.body.status === 'done') break;
      await new Promise(r => setTimeout(r, 10));
    }
    const login = await proc.client.post('/api/v1/ui/session').set('Origin', origin).send({ access_code: UI_CODE }).expect(201);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    mlMode = 'timeout';
    const pending = await proc.client.post('/api/v1/ui/analyze').set('Origin', origin).set('Cookie', cookie).attach('file', video, 'v.mov').expect(202);
    await kill(proc.child);
    const calls = mlCalls;
    proc = await start();
    const recovered = await proc.client.get(`/api/v1/ui/jobs/${pending.body.job_id}`).set('Cookie', cookie).expect(200);
    assert.equal(recovered.body.status, 'failed');
    assert.equal(recovered.body.error.code, 'PROCESS_INTERRUPTED');
    const persisted = await proc.client.get(`/api/v1/jobs/${done.body.job_id}`).set('X-API-Key', API_KEY).expect(200);
    assert.equal(persisted.body.verdict, 'pass');
    await new Promise(r => setTimeout(r, 100));
    assert.equal(mlCalls, calls);
  } finally { await kill(proc.child); mlMode = 'success'; }
});
