import { resolve } from 'node:path';

export class ConfigurationError extends Error {}

export class Config {
  readonly env = process.env.NODE_ENV ?? 'production';
  readonly production = this.env !== 'development' && this.env !== 'test';
  readonly apiKey = this.juryKey();
  readonly uiCode = this.secret('UI_ACCESS_CODE');
  readonly uiOrigin = this.origin();
  readonly stub = process.env.ML_STUB_ENABLED === 'true';
  readonly mlUrl = process.env.ML_SERVICE_URL ?? process.env.ML_URL;
  readonly mlHealthUrl = process.env.ML_HEALTH_URL;
  readonly mlKey = process.env.ML_API_KEY;
  readonly port = this.integer('PORT', 3000, 65535);
  readonly timeout = this.integer('ML_TIMEOUT_MS', 180000, 290000);
  readonly deadline = this.integer('JOB_DEADLINE_MS', 300000, 300000);
  readonly deadlineMargin = this.integer('DEADLINE_MARGIN_MS', 5000, 30000);
  readonly mediaTimeout = this.integer('MEDIA_TIMEOUT_MS', 30000, 120000);
  readonly maxDuration = this.integer('MAX_VIDEO_DURATION_SECONDS', 3600, 86400);
  readonly uploadTimeout = this.integer('UPLOAD_TIMEOUT_MS', 60000, 120000);
  readonly fileTtl = this.integer('VIDEO_RETENTION_MS', 3600000, 604800000);
  readonly cleanupInterval = this.integer('CLEANUP_INTERVAL_MS', 60000, 3600000);
  readonly dataDir = resolve(process.env.DATA_DIR ?? './data');
  readonly rulesPath = resolve(process.env.RULES_PATH ?? './config/rules.json');
  readonly ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
  readonly ffprobe = process.env.FFPROBE_PATH ?? 'ffprobe';
  readonly maxUpload = this.integer('MAX_UPLOAD_BYTES', 100 * 1024 * 1024, 1024 * 1024 * 1024);
  readonly maxPending = this.integer('MAX_PENDING_JOBS', 1, 1000);
  readonly concurrency = this.integer('ML_CONCURRENCY', 1, 32);
  readonly maxJobs = this.integer('MAX_STORED_JOBS', 1000, 100000);
  readonly jobTtl = this.integer('JOB_TTL_MS', 3600000, 86400000);
  readonly sessionTtl = this.integer('SESSION_TTL_MS', 3600000, 86400000);

  constructor() {
    if (this.apiKey === this.uiCode) throw new ConfigurationError('JURY_API_KEY and UI_ACCESS_CODE must differ');
    if (process.env.ML_STUB_ENABLED && !['true', 'false'].includes(process.env.ML_STUB_ENABLED)) {
      throw new Error('ML_STUB_ENABLED must be true or false');
    }
    if (this.stub && this.production) throw new Error('ML stub is forbidden outside development/test');
    if (this.timeout + this.mediaTimeout + this.deadlineMargin >= this.deadline) {
      throw new Error('ML and media timeouts must leave room before JOB_DEADLINE_MS');
    }
    if (!this.stub) {
      const url = new URL(this.mlUrl ?? '');
      this.localUrl(url);
      if (this.mlHealthUrl) this.localUrl(new URL(this.mlHealthUrl));
    }
  }

  private localUrl(url: URL) {
    const host = url.hostname;
    const allowed = (process.env.ML_ALLOWED_HOSTS ?? 'ml,localhost,127.0.0.1,[::1]').split(',');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || !allowed.includes(host)) {
      throw new Error('ML URL must use an explicitly allowed internal host');
    }
    // The deployment network enforces egress denial, including DNS rebinding protection.
  }

  private juryKey(): string {
    const value = process.env.JURY_API_KEY;
    if (!value || !value.trim()) throw new ConfigurationError('JURY_API_KEY must be set and non-empty');
    return value;
  }

  private secret(name: string): string {
    const value = process.env[name];
    if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
    return value;
  }

  private origin(): string {
    const url = new URL(process.env.UI_ORIGIN ?? '');
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== process.env.UI_ORIGIN ||
        (this.production && url.protocol !== 'https:')) throw new Error('Invalid UI_ORIGIN');
    return url.origin;
  }

  private integer(name: string, fallback: number, max: number): number {
    const n = process.env[name] === undefined ? fallback : Number(process.env[name]);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error(`Invalid ${name}`);
    return n;
  }
}
