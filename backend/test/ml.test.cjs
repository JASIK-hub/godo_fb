const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { MlClient } = require('../dist/ml');

async function run(responses, options = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    for await (const part of req) {}
    calls.push({ method: req.method, url: req.url, key: req.headers['x-api-key'] });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(responses[Math.min(calls.length - 1, responses.length - 1)]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = new MlClient({ stub: false, mlUrl: 'http://127.0.0.1:' + server.address().port + '/api/v1/analyze',
      mlKey: 'test-secret', timeout: 1000, deadlineMargin: 10, mlPollInterval: 5, ...options });
    const result = await client.analyze(__filename, 'video/quicktime', 20, 'backend-id', Date.now() + 5000, new AbortController().signal);
    return { result, calls };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const done = { job_id: 'a032fa6e19144693b3a436ec9772d462', status: 'completed',
  result: { verdict: 'no_violation', violations: [] }, assessment_file: 'results/assessments/tmpk7lpe4qf.json' };

test('exact completed wrapper is normalized without leaking ML filesystem paths', async () => {
  const { result } = await run([done]);
  assert.deepEqual(result, { verdict: 'pass', violations: [], source: 'ml' });
});
test('async ML is polled on configured origin with its own id and authentication', async () => {
  const { result, calls } = await run([{ job_id: done.job_id }, { job_id: done.job_id, status: 'processing' }, done]);
  assert.equal(result.verdict, 'pass');
  assert.deepEqual(calls.map(c => c.method), ['POST', 'GET', 'GET']);
  assert.equal(calls[1].url, '/api/v1/jobs/' + done.job_id);
  assert.ok(calls.every(c => c.key === 'test-secret'));
});
test('native violations preserve evidence and normative source', async () => {
  const rule = { title: 'Synthetic test source', section: '1', url: 'https://example.test/rules' };
  const frame = { timestamp_sec: 2, image_base64: '/9j/2Q==' };
  const { result } = await run([{ ...done, result: { verdict: 'violation', violations: [
    { type: 'Test event', rule_id: 'TEST', description: 'Synthetic event', timecode_sec: 2, evidence_frames: [frame], rule },
  ] } }]);
  assert.deepEqual(result.violations[0], { code: 'TEST', type: 'Test event', message: 'Synthetic event',
    timestamp_seconds: 2, evidence_frames: [frame], rule });
  assert.equal(result.verdict, 'fail');
});
test('inconclusive remains distinct from no violations and transport errors', async () => {
  await assert.rejects(run([{ status: 'failed', error: { code: 'analysis_inconclusive' } }]),
    { code: 'ML_INCONCLUSIVE' });
});
test('invalid wrapper, inconsistent verdict and substituted job id are rejected', async () => {
  for (const responses of [
    [{ ...done, result: undefined }],
    [{ ...done, result: { verdict: 'violation', violations: [] } }],
    [{ job_id: done.job_id, status: 'queued' }, { ...done, job_id: 'another-id' }],
    [{ job_id: '../../private', status: 'processing' }],
  ]) await assert.rejects(run(responses), { code: 'ML_INVALID_RESPONSE' });
});
test('polling has a total time budget', async () => {
  await assert.rejects(run([{ job_id: done.job_id, status: 'processing' }], { timeout: 40 }),
    { code: 'ML_UNAVAILABLE' });
});
