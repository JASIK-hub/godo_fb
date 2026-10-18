const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { Media, MediaError } = require('../dist/media');
const { Worker } = require('../dist/worker');

test('missing FFprobe reports backend configuration instead of corrupt video', async () => {
  const media = new Media({ ffprobe: join(tmpdir(), randomUUID(), 'ffprobe'), mediaTimeout: 3000 });
  await assert.rejects(media.validate('unused.mp4', AbortSignal.timeout(5000)), error =>
    error instanceof MediaError && /FFprobe executable not found; check FFPROBE_PATH/.test(error.message));
});

test('worker preserves actionable media errors and does not send invalid input to ML', async () => {
  let result;
  let mlCalled = false;
  const row = { id: 'test', file: 'video', deadline: Date.now() + 5000 };
  const message = 'FFmpeg executable not found; check FFMPEG_PATH on the backend';
  const worker = new Worker(
    { dataDir: tmpdir(), deadlineMargin: 100 },
    { get: () => ({ job: { status: 'processing' } }), finish: (_, job) => { result = job; } },
    { validate: async () => { throw new MediaError(message); } },
    { analyze: async () => { mlCalled = true; } }, {},
  );
  await worker.run(row, new AbortController().signal);
  assert.equal(result.error.message, message);
  assert.equal(result.error.code, 'INVALID_VIDEO');
  assert.equal(mlCalled, false);
});
