import { Injectable } from '@nestjs/common';
import { openAsBlob } from 'node:fs';
import { Config } from './config';

export interface Violation { code: string; message: string; timestamp_seconds: number }
export interface Analysis { verdict: 'pass' | 'fail'; violations: Violation[]; source: 'ml' | 'stub' }
export class MlError extends Error {
  constructor(readonly code: 'ML_UNAVAILABLE' | 'ML_INVALID_RESPONSE') { super(code); }
}

@Injectable()
export class MlClient {
  constructor(private readonly config: Config) {}

  async analyze(path: string, mime: string): Promise<Analysis> {
    if (this.config.stub) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { verdict: 'fail', violations: [{ code: 'DEMO_ONLY', message: 'Synthetic demo violation; no ML analysis performed', timestamp_seconds: 0 }], source: 'stub' };
    }
    try {
      const form = new FormData();
      form.append('file', await openAsBlob(path, { type: mime }), 'video');
      const response = await fetch(this.config.mlUrl!, {
        method: 'POST', body: form, redirect: 'error',
        headers: this.config.mlKey ? { 'X-API-Key': this.config.mlKey } : {},
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!response.ok) { await response.body?.cancel(); throw new MlError('ML_UNAVAILABLE'); }
      // Bound ML response memory even when Content-Length is missing or incorrect.
      const reader = response.body?.getReader();
      if (!reader) throw new MlError('ML_INVALID_RESPONSE');
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > 1024 * 1024) { await reader.cancel(); throw new MlError('ML_INVALID_RESPONSE'); }
        chunks.push(value);
      }
      let data: any;
      try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { throw new MlError('ML_INVALID_RESPONSE'); }
      if (!data || !['pass', 'fail'].includes(data.verdict) || !Array.isArray(data.violations) ||
          data.violations.length > 1000 || data.violations.some((v: any) =>
            !v || typeof v.code !== 'string' || !v.code.length || v.code.length > 128 ||
            typeof v.message !== 'string' || !v.message.length || v.message.length > 4096 ||
            typeof v.timestamp_seconds !== 'number' || !Number.isFinite(v.timestamp_seconds) || v.timestamp_seconds < 0) ||
          (data.verdict === 'pass' && data.violations.length !== 0) ||
          (data.verdict === 'fail' && data.violations.length === 0)) throw new MlError('ML_INVALID_RESPONSE');
      return { verdict: data.verdict, violations: data.violations.map((v: Violation) => ({ code: v.code, message: v.message, timestamp_seconds: v.timestamp_seconds })), source: 'ml' };
    } catch (error) {
      if (error instanceof MlError) throw error;
      throw new MlError('ML_UNAVAILABLE');
    }
  }
}
