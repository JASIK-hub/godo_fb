import { resolve } from 'node:path';

export class ConfigurationError extends Error {}

export class Config {
  readonly env = process.env.NODE_ENV ?? 'production';
  readonly production = this.env !== 'development' && this.env !== 'test';
  readonly apiKey = this.juryKey();
  readonly uiOrigin = this.origin();
  readonly stub = process.env.ML_STUB_ENABLED === 'true';
  readonly mlUrl = process.env.ML_SERVICE_URL ?? process.env.ML_URL;
  readonly mlHealthUrl = process.env.ML_HEALTH_URL;
  readonly mlKey = process.env.ML_API_KEY;
  readonly port = this.integer('PORT', 3000, 65535);
  readonly timeout = this.integer('ML_TIMEOUT_MS', 180000, 290000);
  readonly mlPollInterval = this.integer('ML_POLL_INTERVAL_MS', 1000, 30000);
  readonly deadline = this.integer('JOB_DEADLINE_MS', 300000, 300000);
  readonly deadlineMargin = this.integer('DEADLINE_MARGIN_MS', 5000, 30000);
  readonly mediaTimeout = this.integer('MEDIA_TIMEOUT_MS', 30000, 120000);
  readonly maxDuration = this.integer('MAX_VIDEO_DURATION_SECONDS', 3600, 86400);
  readonly uploadTimeout = this.integer('UPLOAD_TIMEOUT_MS', 60000, 120000);
  readonly fileTtl = this.integer('VIDEO_RETENTION_MS', 3600000, 604800000);
  readonly cleanupInterval = this.integer('CLEANUP_INTERVAL_MS', 60000, 3600000);
  readonly dataDir = resolve(process.env.DATA_DIR ?? './data');
  readonly staticDir = process.env.STATIC_DIR ? resolve(process.env.STATIC_DIR) : undefined;
  readonly ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
  readonly ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
  readonly maxUpload = this.integer('MAX_UPLOAD_BYTES', 100 * 1024 * 1024, 1024 * 1024 * 1024);
  readonly maxPending = this.integer('MAX_PENDING_JOBS', 1, 1000);
  readonly concurrency = this.integer('ML_CONCURRENCY', 1, 32);
  readonly maxJobs = this.integer('MAX_STORED_JOBS', 1000, 100000);
  readonly jobTtl = this.integer('JOB_TTL_MS', 3600000, 86400000);

  constructor() {
    if (process.env.ML_STUB_ENABLED && !['true', 'false'].includes(process.env.ML_STUB_ENABLED)) {
      throw new ConfigurationError('ML_STUB_ENABLED must be true or false');
    }
    if (this.stub && this.production) throw new ConfigurationError('ML stub is forbidden outside development/test');
    if (this.timeout + this.mediaTimeout + this.deadlineMargin >= this.deadline) {
      throw new ConfigurationError('ML and media timeouts must leave room before JOB_DEADLINE_MS');
    }
    if (!this.stub) {
      const url = this.url(this.mlUrl, 'ML_SERVICE_URL (or ML_URL)');
      this.localUrl(url);
      if (this.mlHealthUrl) this.localUrl(this.url(this.mlHealthUrl, 'ML_HEALTH_URL'));
    }
  }

  private localUrl(url: URL) {
    const host = url.hostname;
    const allowed = (process.env.ML_ALLOWED_HOSTS ?? 'ml,localhost,127.0.0.1,[::1]').split(',');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || !allowed.includes(host)) {
      throw new ConfigurationError('ML URL must use an explicitly allowed internal host; check ML_ALLOWED_HOSTS');
    }
    // The deployment network enforces egress denial, including DNS rebinding protection.
  }

  private juryKey(): string {
    const value = process.env.JURY_API_KEY;
    if (!value || !value.trim()) throw new ConfigurationError('JURY_API_KEY must be set and non-empty');
    return value;
  }

  private origin(): string {
    const url = this.url(process.env.UI_ORIGIN, 'UI_ORIGIN');
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== process.env.UI_ORIGIN ||
        (this.production && url.protocol !== 'https:')) throw new ConfigurationError('UI_ORIGIN must be an exact http(s) origin without a trailing slash or path; production requires HTTPS');
    return url.origin;
  }

  private url(value: string | undefined, name: string): URL {
    try { return new URL(value ?? ''); }
    catch { throw new ConfigurationError(`${name} must be set to a valid URL`); }
  }

  private integer(name: string, fallback: number, max: number): number {
    const n = process.env[name] === undefined ? fallback : Number(process.env[name]);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new ConfigurationError(`${name} must be an integer between 1 and ${max}`);
    return n;
  }
}
