const { test } = require('node:test');
const assert = require('node:assert/strict');
const { MlClient } = require('../dist/ml');

const remoteId = 'f6aba276f9134a68818e8ad0edb897be';
const config = {
  stub: false, mlUrl: 'https://ml.example/api/v1/analyze', mlKey: 'test-secret',
  timeout: 10000, deadlineMargin: 100,
};
const completed = { job_id: remoteId, status: 'completed',
  result: { verdict: 'no_violation', violations: [] } };

async function run(t, responses, overrides = {}, signal = new AbortController().signal) {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, init) => {
    calls.push({ url: String(url), ...init });
    assert.ok(responses.length, 'Unexpected extra ML request');
    return Response.json(responses.shift());
  });
  const promise = new MlClient({ ...config, ...overrides }).analyze(
    __filename, 'video/mp4', 10, 'local-job', Date.now() + 15000, signal);
  return { promise, calls };
}

test('polls remote job with API key through processing to nested completed result', async t => {
  const { promise, calls } = await run(t, [
    { job_id: remoteId }, { job_id: remoteId, status: 'processing' }, completed,
  ]);
  assert.deepEqual(await promise, { verdict: 'pass', violations: [], source: 'ml' });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].method, 'POST');
  assert.ok(calls[0].body.get('file') instanceof Blob);
  for (const call of calls.slice(1)) {
    assert.equal(call.url, `https://ml.example/api/v1/jobs/${remoteId}`);
    assert.equal(call.method, 'GET');
    assert.equal(call.headers['X-API-Key'], config.mlKey);
    assert.equal(call.redirect, 'error');
    assert.equal(call.signal, calls[0].signal);
  }
});

test('preserves synchronous ML responses', async t => {
  const { promise, calls } = await run(t, [{ verdict: 'pass', violations: [] }]);
  assert.deepEqual(await promise, { verdict: 'pass', violations: [], source: 'ml' });
  assert.equal(calls.length, 1);
});

test('remote failure is not interpreted as a successful analysis', async t => {
  const { promise } = await run(t, [{ job_id: remoteId, status: 'failed' }]);
  await assert.rejects(promise, { code: 'ML_UNAVAILABLE' });
});

test('polling shares a total timeout instead of resetting it for each request', async t => {
  const { promise, calls } = await run(t, [{ job_id: remoteId, status: 'processing' }], { timeout: 30 });
  await assert.rejects(promise, { code: 'ML_UNAVAILABLE' });
  assert.equal(calls.length, 1);
});

test('rejects a changed remote job ID', async t => {
  const { promise } = await run(t, [
    { job_id: remoteId, status: 'processing' }, { ...completed, job_id: 'other-job' },
  ]);
  await assert.rejects(promise, { code: 'ML_INVALID_RESPONSE' });
});

test('rejects invalid nested results', async t => {
  const { promise } = await run(t, [{ ...completed, result: { verdict: 'pass', violations: 'bad' } }]);
  await assert.rejects(promise, { code: 'ML_INVALID_RESPONSE' });
});
