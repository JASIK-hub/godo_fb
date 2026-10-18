import { Injectable } from '@nestjs/common';
import { openAsBlob } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { Config } from './config';

export interface EvidenceFrame { timestamp_sec: number; image_base64: string }
export interface Regulation { title: string; section: string; url: string }
export interface Violation {
  code: string; message: string; timestamp_seconds: number;
  type?: string; evidence_frames?: EvidenceFrame[]; rule?: Regulation;
}
export interface Analysis { verdict: 'pass' | 'fail'; violations: Violation[]; source: 'ml' | 'stub' }
export class MlError extends Error {
  constructor(readonly code: 'ML_UNAVAILABLE' | 'ML_INVALID_RESPONSE' | 'ML_INCONCLUSIVE') { super(code); }
}

const invalid = (): never => { throw new MlError('ML_INVALID_RESPONSE'); };
const object = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: any, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const time = (value: any, duration: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= duration;
const jobIdValid = (value: any) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

function normalize(data: any, duration: number): Analysis {
  if (!object(data)) return invalid();
  const verdict = data.verdict === 'no_violation' ? 'pass' : data.verdict === 'violation' ? 'fail' : data.verdict;
  if (!['pass', 'fail'].includes(verdict) || !Array.isArray(data.violations) || data.violations.length > 1000 ||
      (verdict === 'pass') !== (data.violations.length === 0)) return invalid();
  const violations = data.violations.map((v: any): Violation => {
    if (!object(v)) return invalid();
    const native = v.type !== undefined && v.code === undefined;
    const code = native ? (v.rule_id ?? v.type) : v.code;
    const message = native ? v.description : v.message;
    const timestamp = native ? v.timecode_sec : v.timestamp_seconds;
    if (!text(code, native ? 512 : 128) || !text(message, 4096) || !time(timestamp, duration) ||
        (v.rule_id !== undefined && v.rule_id !== code) ||
        (native && !text(v.type, 512)) ||
        (v.frames !== undefined && (!Array.isArray(v.frames) || v.frames.length !== 0))) return invalid();
    const result: Violation = { code, message, timestamp_seconds: timestamp };
    if (native) result.type = v.type;
    if (v.evidence_frames !== undefined) {
      if (!Array.isArray(v.evidence_frames) || v.evidence_frames.length > 3) return invalid();
      result.evidence_frames = v.evidence_frames.map((frame: any) => {
        if (!object(frame) || !time(frame.timestamp_sec, duration) || !text(frame.image_base64, 2 * 1024 * 1024) ||
            (frame.image_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(frame.image_base64))) return invalid();
        const bytes = Buffer.from(frame.image_base64, 'base64');
        if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
            bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return invalid();
        return { timestamp_sec: frame.timestamp_sec, image_base64: frame.image_base64 };
      });
    }
    if (v.rule !== undefined) {
      if (!object(v.rule) || !text(v.rule.title, 4096) || !text(v.rule.section, 1024) || !text(v.rule.url, 2048)) return invalid();
      let url: URL;
      try { url = new URL(v.rule.url); } catch { return invalid(); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return invalid();
      result.rule = { title: v.rule.title, section: v.rule.section, url: v.rule.url };
    }
    return result;
  });
  return { verdict, violations, source: 'ml' };
}

@Injectable()
export class MlClient {
  constructor(private readonly config: Config) {}

  private async json(response: Response): Promise<any> {
    const reader = response.body?.getReader();
    if (!reader) throw new MlError(response.ok ? 'ML_INVALID_RESPONSE' : 'ML_UNAVAILABLE');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      // JPEG evidence is inline; cap the entire body, including responses without Content-Length.
      if (length > 16 * 1024 * 1024) { await reader.cancel(); return invalid(); }
      chunks.push(value);
    }
    let data: any;
    try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new MlError(response.ok ? 'ML_INVALID_RESPONSE' : 'ML_UNAVAILABLE'); }
    if (!response.ok) {
      if (data?.error?.code === 'analysis_inconclusive' || data?.detail?.code === 'analysis_inconclusive') {
        throw new MlError('ML_INCONCLUSIVE');
      }
      throw new MlError('ML_UNAVAILABLE');
    }
    return data;
  }

  async analyze(path: string, mime: string, duration: number, jobId: string, deadline: number, signal: AbortSignal): Promise<Analysis> {
    if (this.config.stub) {
      await delay(100, undefined, { signal });
      return { verdict: 'fail', violations: [{ code: 'DEMO_ONLY', message: 'Synthetic demo violation; no ML analysis performed', timestamp_seconds: 0 }], source: 'stub' };
    }
    try {
<<<<<<< HEAD
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1,
=======
      // One budget covers upload, every poll, response reads and waiting; it never resets per poll.
      const budget = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1,
>>>>>>> d66aa7f091a76c4ea338f953a66a72615e476b57
        Math.min(this.config.timeout, deadline - Date.now() - this.config.deadlineMargin)))]);
      const headers = { ...(this.config.mlKey ? { 'X-API-Key': this.config.mlKey } : {}),
        'X-Job-Id': jobId, 'X-Deadline-At': new Date(deadline).toISOString() };
      const form = new FormData();
      form.append('file', await openAsBlob(path, { type: mime }), 'video');
<<<<<<< HEAD
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
=======
      let data = await this.json(await fetch(this.config.mlUrl!, {
        method: 'POST', body: form, redirect: 'error', headers, signal: budget,
      }));
      let upstreamId: string | undefined;
      while (true) {
        budget.throwIfAborted();
        if (!object(data)) return invalid();
        if (data.job_id !== undefined) {
          if (!jobIdValid(data.job_id) || (upstreamId !== undefined && upstreamId !== data.job_id)) return invalid();
          upstreamId = data.job_id;
        }
        if (data.status === 'failed') {
          throw new MlError(data.error?.code === 'analysis_inconclusive' ? 'ML_INCONCLUSIVE' : 'ML_UNAVAILABLE');
        }
        if (data.status === 'completed' || data.status === 'done') {
          // assessment_file is a path on the ML host, never a URL to fetch or expose to the browser.
          return normalize(data.result, duration);
        }
        if (data.status === undefined && data.verdict !== undefined) return normalize(data, duration);
        if (!upstreamId || (data.status !== undefined && !['queued', 'pending', 'processing', 'running'].includes(data.status))) return invalid();
        const pollUrl = new URL(this.config.mlUrl!);
        if (!/\/analyze\/?$/.test(pollUrl.pathname)) return invalid();
        pollUrl.pathname = pollUrl.pathname.replace(/\/analyze\/?$/, `/jobs/${encodeURIComponent(upstreamId)}`);
        pollUrl.search = '';
        // Only the configured service origin is used. Never follow an upstream-provided polling URL.
        await delay(this.config.mlPollInterval, undefined, { signal: budget });
        data = await this.json(await fetch(pollUrl, { headers, redirect: 'error', signal: budget }));
      }
>>>>>>> d66aa7f091a76c4ea338f953a66a72615e476b57
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
