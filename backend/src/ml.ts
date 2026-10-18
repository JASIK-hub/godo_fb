import { Injectable } from '@nestjs/common';
import { openAsBlob } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Config } from './config';

export interface Violation { code: string; message: string; timestamp_seconds: number }
export interface Analysis { verdict: 'pass' | 'fail'; violations: Violation[]; source: 'ml' | 'stub' }
export class MlError extends Error {
  constructor(readonly code: 'ML_UNAVAILABLE' | 'ML_INVALID_RESPONSE') { super(code); }
}

@Injectable()
export class MlClient {
  constructor(private readonly config: Config) {}

  async analyze(path: string, mime: string, duration: number, jobId: string, deadline: number, signal: AbortSignal): Promise<Analysis> {
    if (this.config.stub) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { verdict: 'fail', violations: [{ code: 'DEMO_ONLY', message: 'Synthetic demo violation; no ML analysis performed', timestamp_seconds: 0 }], source: 'stub' };
    }
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1,
        Math.min(this.config.timeout, deadline - Date.now() - this.config.deadlineMargin)))]);
      const headers = { ...(this.config.mlKey ? { 'X-API-Key': this.config.mlKey } : {}),
        'X-Job-Id': jobId, 'X-Deadline-At': new Date(deadline).toISOString() };
      const form = new FormData();
      form.append('file', await openAsBlob(path, { type: mime }), 'video');
      const response = await fetch(this.config.mlUrl!, {
        method: 'POST', body: form, redirect: 'error',
        headers, signal: requestSignal,
      });
      let data = await this.readResponse(response);
      if (data?.job_id !== undefined) {
        const remoteId = data.job_id;
        if (typeof remoteId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(remoteId)) {
          throw new MlError('ML_INVALID_RESPONSE');
        }
        // Resolve against the configured inference endpoint, never a URL supplied by ML.
        const jobsUrl = new URL(this.config.mlUrl!);
        jobsUrl.pathname = jobsUrl.pathname.replace(/\/[^/]*\/?$/, '') + `/jobs/${remoteId}`;
        jobsUrl.search = '';
        while (true) {
          if (data?.job_id !== remoteId) throw new MlError('ML_INVALID_RESPONSE');
          if (data.status === 'failed') throw new MlError('ML_UNAVAILABLE');
          if (data.status === 'completed' || data.status === 'done') {
            data = data.result ?? data;
            break;
          }
          if (data.status !== undefined && !['queued', 'processing'].includes(data.status)) {
            throw new MlError('ML_INVALID_RESPONSE');
          }
          await delay(2000, undefined, { signal: requestSignal });
          data = await this.readResponse(await fetch(jobsUrl, {
            method: 'GET', headers, redirect: 'error', signal: requestSignal,
          }));
        }
      }
      // Internal ML spelling only; public verdict remains pass/fail.
      if (data?.verdict === 'no_violation') data.verdict = 'pass';
      if (!data || !['pass', 'fail'].includes(data.verdict) || !Array.isArray(data.violations) ||
          data.violations.length > 1000 || data.violations.some((v: any) =>
            !v || typeof v.code !== 'string' || !v.code.length || v.code.length > 128 ||
            typeof v.message !== 'string' || !v.message.length || v.message.length > 4096 ||
            (v.rule_id !== undefined && v.rule_id !== v.code) ||
            (v.frames !== undefined && (!Array.isArray(v.frames) || v.frames.length !== 0)) ||
            typeof v.timestamp_seconds !== 'number' || !Number.isFinite(v.timestamp_seconds) || v.timestamp_seconds < 0 || v.timestamp_seconds > duration) ||
          (data.verdict === 'pass' && data.violations.length !== 0) ||
          (data.verdict === 'fail' && data.violations.length === 0)) throw new MlError('ML_INVALID_RESPONSE');
      return { verdict: data.verdict, violations: data.violations.map((v: Violation) => ({ code: v.code, message: v.message, timestamp_seconds: v.timestamp_seconds })), source: 'ml' };
    } catch (error) {
      if (error instanceof MlError) throw error;
      throw new MlError('ML_UNAVAILABLE');
    }
  }

  private async readResponse(response: Response): Promise<any> {
    if (!response.ok) { await response.body?.cancel(); throw new MlError('ML_UNAVAILABLE'); }
    // Bound every response, including polling responses, to 1 MiB.
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
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new MlError('ML_INVALID_RESPONSE'); }
  }
}
