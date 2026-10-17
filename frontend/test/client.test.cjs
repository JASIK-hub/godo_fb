const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Execute the actual TS modules with build-time env and HTTP responses supplied by the test.
function load(file, globals) {
  const source = readFileSync(resolve(__dirname, '../src', file), 'utf8')
    .replace('import.meta.env', 'testEnv');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, FormData, ...globals });
  return exports;
}
function client(base, response) {
  const { config } = load('config.ts', { testEnv: { VITE_API_BASE_URL: base } });
  const calls = [];
  const api = load('api/client.ts', {
    require: name => { assert.equal(name, '../config'); return { config }; },
    fetch: async (url, init) => { calls.push({ url, init }); return response; },
  });
  return { api, calls };
}

test('actual upload and polling URLs contain one /api and never send credentials', async () => {
  for (const base of [undefined, '', '/', '/api', '/api/site/', 'https://backend.test',
    'https://backend.test/', 'https://backend.test/api', 'https://backend.test/api/site/',
    ' https://backend.test/api/v1/ ']) {
    const { api, calls } = client(base, { ok: true, json: async () => ({ job_id: 'id', status: 'processing' }) });
    await api.analyzeVideo(new File(['synthetic'], 'test.mov', { type: 'video/quicktime' }));
    await api.getJob('id');
    const origin = base?.includes('https:') ? 'https://backend.test' : '';
    assert.equal(calls[0].url, `${origin}/api/site/analyze`);
    assert.equal(calls[1].url, `${origin}/api/site/jobs/id`);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual([...calls[0].init.body.keys()], ['file']);
    for (const call of calls) {
      assert.equal(call.init.credentials, 'omit');
      assert.equal(call.init.headers, undefined);
    }
  }
});

test('ML failed response remains failed in the UI; done uses the public verdict and violations', async () => {
  for (const job of [
    { job_id: 'id', status: 'failed', error: { code: 'ML_UNAVAILABLE', message: 'Video analysis failed' } },
    { job_id: 'id', status: 'done', verdict: 'pass', violations: [], source: 'ml' },
    { job_id: 'id', status: 'done', verdict: 'fail', violations: [
      { code: 'TEST', message: 'Synthetic violation', timestamp_seconds: 0.5 },
    ], source: 'ml' },
  ]) {
    const { api } = client('', { ok: true, json: async () => job });
    const result = await api.getJob('id');
    assert.equal(result.status, job.status);
    if (job.status === 'failed') {
      assert.equal(result.error, job.error.message);
      assert.equal(result.result, undefined);
    } else {
      assert.equal(result.result.events.length, job.violations.length);
      assert.equal(result.result.verdict, job.verdict === 'pass' ? 'Нарушений не обнаружено' : 'Обнаружены нарушения');
    }
  }
});
