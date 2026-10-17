const { test } = require('node:test');
const assert = require('node:assert/strict');
const { request: httpRequest } = require('node:http');
const { mkdtemp, rm, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const request = require('supertest');
const { createApp } = require('../dist/app');

test('browser upload responses retain CORS, including stalled uploads', async t => {
  const previous = { ...process.env };
  const directory = await mkdtemp(join(tmpdir(), 'godo-upload-cors-'));
  const origin = 'https://godo-fb.vercel.app';
  let app;
  try {
    Object.assign(process.env, {
      NODE_ENV: 'test', JURY_API_KEY: 'synthetic-cors-test-key', UI_ORIGIN: origin,
      ML_STUB_ENABLED: 'true', STATIC_DIR: '', DATA_DIR: directory,
      MAX_UPLOAD_BYTES: String(4 * 1024 * 1024), UPLOAD_TIMEOUT_MS: '10000',
    });
    let config;
    ({ app, config } = await createApp());
    await app.listen(0, '127.0.0.1');
    const api = request(app.getHttpServer());
    const path = '/api/site/analyze';
    const cors = response => assert.equal(response.headers['access-control-allow-origin'], origin);

    await t.test('preflight and parser errors', async () => {
      cors(await api.options(path).set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST').expect(204));
      cors(await api.post(path).set('Origin', origin).send({}).expect(400));
      cors(await api.post(path).set('Origin', origin).set('Content-Type', 'application/json')
        .send('{broken').expect(400));
      cors(await api.post(path).set('Origin', origin)
        .attach('file', Buffer.from('text'), { filename: 'test.txt', contentType: 'text/plain' }).expect(415));
      cors(await api.post(path).set('Origin', origin)
        .attach('file', Buffer.alloc(4 * 1024 * 1024 + 1), { filename: 'large.mp4', contentType: 'video/mp4' }).expect(413));
    });

    await t.test('stalled multipart receives JSON 408 and releases capacity and partial files', async () => {
      config.uploadTimeout = 100;
      try {
        const response = await new Promise((resolve, reject) => {
          const req = httpRequest({
            host: '127.0.0.1', port: app.getHttpServer().address().port, path, method: 'POST',
            headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=slow-upload' },
          }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { body += chunk; });
            res.on('error', reject);
            res.on('end', () => { req.destroy(); resolve({ status: res.statusCode, headers: res.headers, body }); });
          });
          req.on('error', reject);
          req.setTimeout(3000, () => { req.destroy(); reject(new Error('Upload timeout response missing')); });
          // Start a file but deliberately never send the final multipart boundary.
          req.write('--slow-upload\r\nContent-Disposition: form-data; name="file"; filename="slow.mp4"\r\nContent-Type: video/mp4\r\n\r\npartial');
        });
        assert.equal(response.status, 408);
        cors(response);
        assert.equal(JSON.parse(response.body).message, 'Video upload timed out');
        // Allow asynchronous Multer abort cleanup to finish.
        for (let attempt = 0; attempt < 100; attempt++) {
          const files = await readdir(join(directory, 'uploads'));
          if (files.length === 0) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.deepEqual(await readdir(join(directory, 'uploads')), []);
      } finally { config.uploadTimeout = 10000; }
    });

    await t.test('3.7 MiB multipart is accepted without credentials after timeout', async () => {
      // Synthetic bytes test transport acceptance, not video decoding or ML.
      const response = await api.post(path).set('Origin', origin)
        .attach('file', Buffer.alloc(Math.floor(3.7 * 1024 * 1024)), { filename: 'test.mp4', contentType: 'video/mp4' })
        .expect(202);
      cors(response);
      assert.equal(typeof response.body.job_id, 'string');
    });
  } finally {
    await app?.close();
    process.env = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
