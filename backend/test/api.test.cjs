const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const request = require('supertest');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { createApp } = require('../dist/app');
const { Config } = require('../dist/config');

const API_KEY = 'test-api-key-'.repeat(4);
const UI_CODE = 'test-ui-code-'.repeat(4);
const origin = 'http://localhost:5173';
let app, api, ml, mlMode = 'success', received, releaseMl;
const video = Buffer.from('test video payload');

function environment() {
  Object.assign(process.env, {
    NODE_ENV: 'test', API_KEY, UI_ACCESS_CODE: UI_CODE, UI_ORIGIN: origin,
    ML_STUB_ENABLED: 'false', ML_TIMEOUT_MS: '200', MAX_UPLOAD_BYTES: '1024',
    MAX_PENDING_JOBS: '2', ML_CONCURRENCY: '1', JOB_TTL_MS: '3600000',
  });
}

before(async () => {
  ml = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    received = { body: Buffer.concat(chunks), headers: req.headers };
    if (mlMode === 'hold') await new Promise(resolve => { releaseMl = resolve; });
    if (mlMode === 'timeout') await new Promise(resolve => setTimeout(resolve, 400));
    if (mlMode === 'error') { res.writeHead(503).end('private upstream error'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(mlMode === 'invalid' ? { verdict: 'pass', violations: 'wrong' } : {
      verdict: 'fail', violations: [{ code: 'TEST', message: 'Test violation', timestamp_seconds: 1.5 }],
    }));
  });
  await new Promise(resolve => ml.listen(0, '127.0.0.1', resolve));
  environment();
  process.env.ML_URL = `http://127.0.0.1:${ml.address().port}/analyze`;
  process.env.ML_API_KEY = 'separate-ml-key';
  ({ app } = await createApp());
  await app.init();
  api = request(app.getHttpServer());
});

after(async () => {
  releaseMl?.();
  await app?.close();
  await new Promise(resolve => ml.close(resolve));
});

const upload = () => api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, { filename: 'clip.mp4', contentType: 'video/mp4' });
async function poll(id) {
  for (let i = 0; i < 100; i++) {
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
  assert.equal(done.status, 'done');
  assert.equal(done.source, 'ml');
  assert.equal(done.verdict, 'fail');
  assert.equal(done.violations[0].timestamp_seconds, 1.5);
});

test('rejects missing, empty, oversized, unsupported and extra uploads; capacity recovers', async () => {
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).send({}).expect(400);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', Buffer.alloc(0), { filename: 'empty.mp4', contentType: 'video/mp4' }).expect(400);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', Buffer.alloc(1025), { filename: 'big.mp4', contentType: 'video/mp4' }).expect(413);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, 'x.txt').expect(415);
  await api.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('other', video, 'x.mp4').expect(400);
  await upload().attach('file', video, 'second.mp4').expect(400);
  const { body } = await upload().expect(202);
  await poll(body.job_id);
});

test('ML errors, invalid responses and timeouts produce failed jobs without upstream details', async () => {
  for (const [mode, code] of [['error', 'ML_UNAVAILABLE'], ['invalid', 'ML_INVALID_RESPONSE'], ['timeout', 'ML_UNAVAILABLE']]) {
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
    Object.assign(process.env, { ML_STUB_ENABLED: 'true', JOB_TTL_MS: '30', SESSION_TTL_MS: '30' });
    ({ app: demo } = await createApp());
    await demo.init();
    const client = request(demo.getHttpServer());
    const job = await client.post('/api/v1/analyze').set('X-API-Key', API_KEY).attach('file', video, 'x.mp4').expect(202);
    let result;
    for (let i = 0; i < 50; i++) {
      result = await client.get(`/api/v1/jobs/${job.body.job_id}`).set('X-API-Key', API_KEY).expect(200);
      if (result.body.status === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(result.body.source, 'stub');
    const session = await client.post('/api/v1/ui/session').set('Origin', origin).send({ access_code: UI_CODE }).expect(201);
    await new Promise(resolve => setTimeout(resolve, 60));
    await client.get(`/api/v1/jobs/${job.body.job_id}`).set('X-API-Key', API_KEY).expect(404);
    await client.get('/api/v1/ui/jobs/anything').set('Cookie', session.headers['set-cookie'][0].split(';')[0]).expect(401);
  } finally { await demo?.close(); process.env = saved; }
});
