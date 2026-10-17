export class Config {
  readonly env = process.env.NODE_ENV ?? 'production';
  readonly production = this.env !== 'development' && this.env !== 'test';
  readonly apiKey = this.secret('API_KEY');
  readonly uiCode = this.secret('UI_ACCESS_CODE');
  readonly uiOrigin = this.origin();
  readonly stub = process.env.ML_STUB_ENABLED === 'true';
  readonly mlUrl = process.env.ML_URL;
  readonly mlKey = process.env.ML_API_KEY;
  readonly port = this.integer('PORT', 3000, 65535);
  readonly timeout = this.integer('ML_TIMEOUT_MS', 120000, 600000);
  readonly maxUpload = this.integer('MAX_UPLOAD_BYTES', 100 * 1024 * 1024, 1024 * 1024 * 1024);
  readonly maxPending = this.integer('MAX_PENDING_JOBS', 10, 1000);
  readonly concurrency = this.integer('ML_CONCURRENCY', 2, 32);
  readonly maxJobs = this.integer('MAX_STORED_JOBS', 1000, 100000);
  readonly jobTtl = this.integer('JOB_TTL_MS', 3600000, 86400000);
  readonly sessionTtl = this.integer('SESSION_TTL_MS', 3600000, 86400000);

  constructor() {
    if (this.apiKey === this.uiCode) throw new Error('API_KEY and UI_ACCESS_CODE must differ');
    if (process.env.ML_STUB_ENABLED && !['true', 'false'].includes(process.env.ML_STUB_ENABLED)) {
      throw new Error('ML_STUB_ENABLED must be true or false');
    }
    if (this.stub && this.production) throw new Error('ML stub is forbidden outside development/test');
    if (!this.stub) {
      const url = new URL(this.mlUrl ?? '');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
          (this.production && url.protocol !== 'https:')) throw new Error('Invalid ML_URL');
    }
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
