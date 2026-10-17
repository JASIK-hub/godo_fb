const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createServer } = require('node:net');
const { Config, ConfigurationError } = require('../dist/config');

const base = {
  NODE_ENV: 'development', JURY_API_KEY: 'synthetic-startup-test-key', UI_ORIGIN: 'http://localhost:5173',
  ML_STUB_ENABLED: 'true', STATIC_DIR: '',
};

test('Vercel default export is an HTTP handler: initializes once, serves routes and preserves auth', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'godo-vercel-handler-'));
  try {
    const script = `
      const assert = require('node:assert/strict');
      const { createServer } = require('node:http');
      const handler = require('./dist/app').default;
      assert.equal(typeof handler, 'function');
      const server = createServer((req, res) => handler(req, res));
      server.listen(0, '127.0.0.1', async () => {
        try {
          const url = 'http://127.0.0.1:' + server.address().port;
          const key = process.env.JURY_API_KEY;
          delete process.env.JURY_API_KEY;
          const failed = await fetch(url + '/health/live');
          assert.equal(failed.status, 503);
          assert.deepEqual(await failed.json(), { message: 'Backend initialization failed' });
          process.env.JURY_API_KEY = key;
          const cold = await Promise.all(Array.from({ length: 5 }, () => fetch(url + '/health/live')));
          for (const response of cold) assert.equal(response.status, 200);
          for (const [method, path] of [['POST', '/api/v1/analyze'], ['GET', '/api/v1/jobs/missing']]) {
            for (const supplied of [undefined, 'wrong-key']) {
              const r = await fetch(url + path, { method, headers: supplied ? { 'X-API-Key': supplied } : {} });
              assert.equal(r.status, 401);
            }
            const authorized = await fetch(url + path, { method, headers: { 'X-API-Key': key } });
            assert.equal(authorized.status, method === 'POST' ? 400 : 404);
            assert.equal((await authorized.text()).includes(key), false);
          }
          assert.equal((await fetch(url + '/api/site/analyze', { method: 'POST' })).status, 400);
          const missing = await fetch(url + '/api/site/jobs/missing');
          assert.equal(missing.status, 404);
          assert.equal((await missing.json()).message, 'Job not found');
          server.close();
          server.closeAllConnections();
        } catch { process.exit(1); }
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      env: { ...process.env, ...base, DATA_DIR: dir }, encoding: 'utf8', timeout: 15000, windowsHide: true,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, 'Default handler integration check failed');
    assert.equal((result.stdout + result.stderr).includes(base.JURY_API_KEY), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('configuration errors identify the setting without exposing its value', () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, base, { UI_ORIGIN: 'private-invalid-origin' });
    assert.throws(() => new Config(), e => e instanceof ConfigurationError && e.message.includes('UI_ORIGIN') && !e.message.includes('private-invalid-origin'));
    process.env.UI_ORIGIN = 'http://localhost:5173/';
    assert.throws(() => new Config(), /without a trailing slash/);
    Object.assign(process.env, base, { ML_STUB_ENABLED: 'false', ML_SERVICE_URL: '' });
    assert.throws(() => new Config(), /ML_SERVICE_URL.*valid URL/);
  } finally { process.env = previous; }
});

test('production starts without a backend regulatory catalog', async () => {
  const previous = { ...process.env };
  const dir = await mkdtemp(join(tmpdir(), 'godo-no-catalog-'));
  let app;
  try {
    Object.assign(process.env, base, { NODE_ENV: 'production', UI_ORIGIN: 'https://example.test',
      ML_STUB_ENABLED: 'false', ML_SERVICE_URL: 'http://localhost:9999/analyze', DATA_DIR: dir });
    delete process.env.RULES_PATH;
    ({ app } = await require('../dist/app').createApp());
    await app.listen(0, '127.0.0.1');
    const api = require('supertest')(app.getHttpServer());
    await api.get('/health/live').expect(200);
    // Unavailable ML must not remove routes or turn upload validation into Cannot POST.
    for (const scope of ['site', 'v1']) {
      let post = api.post(`/api/${scope}/analyze`);
      let get = api.get(`/api/${scope}/jobs/missing`);
      if (scope === 'v1') {
        post.set('X-API-Key', base.JURY_API_KEY);
        get.set('X-API-Key', base.JURY_API_KEY);
      }
      const invalid = await post.expect(400);
      assert.equal(invalid.body.message, 'Expected multipart/form-data');
      const missing = await get.expect(404);
      assert.equal(missing.body.message, 'Job not found');
    }
  } finally { await app?.close(); process.env = previous; await rm(dir, { recursive: true, force: true }); }
});

test('dev:stub refuses production and still requires a jury key', () => {
  for (const mode of ['production', 'missing-key']) {
    const env = { ...process.env, ...base, NODE_ENV: mode === 'production' ? 'production' : 'development' };
    if (mode === 'missing-key') delete env.JURY_API_KEY;
    const result = spawnSync(process.execPath, ['scripts/dev-stub.cjs'], { env, encoding: 'utf8', timeout: 5000, windowsHide: true });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, mode === 'production' ? /forbidden outside development\/test/ : /JURY_API_KEY must be set/);
    assert.equal(result.stderr.includes(base.JURY_API_KEY), false);
  }
});

test('explicit local demo starts without ML or a real catalog and serves protected API', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'godo-local-start-'));
  const reservation = createServer();
  await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
  const port = reservation.address().port;
  await new Promise(resolveClose => reservation.close(resolveClose));
  const child = spawn(process.execPath, ['scripts/dev-stub.cjs'], {
    env: { ...process.env, ...base, PORT: String(port), DATA_DIR: dir,
      ML_STUB_ENABLED: 'false', ML_SERVICE_URL: '', RULES_PATH: join(dir, 'missing.json') },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  try {
    await new Promise((ready, reject) => {
      const timer = setTimeout(() => reject(Error('Local demo startup timeout')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(Error('Local demo exited before readiness')); });
      child.stdout.on('data', data => {
        if (data.toString().includes('Backend listening on port')) { clearTimeout(timer); ready(); }
      });
    });
    const url = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    assert.equal((await fetch(`${url}/health/ready`)).status, 200);
    assert.equal((await fetch(`${url}/api/v1/jobs/missing`)).status, 401);
    assert.equal((await fetch(`${url}/api/v1/jobs/missing`, { headers: { 'X-API-Key': base.JURY_API_KEY } })).status, 404);
  } finally {
    if (child.exitCode === null) await new Promise(resolveExit => { child.once('exit', resolveExit); child.kill('SIGKILL'); });
    await rm(dir, { recursive: true, force: true });
  }
});
