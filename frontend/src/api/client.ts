/**
 * Реальный HTTP-клиент API.
 *
 * Серверный proxy сохраняет схему contracts/public-api.yaml.
 */
import { config } from '../config';
import type { AnalyzeResponse, Job, PublicJob } from './types';

/** Ошибка HTTP-запроса с кодом ответа. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Браузер обращается к proxy без ключа и пользовательской сессии. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    credentials: 'omit',
    ...init,
  });

  if (!res.ok) {
    let message = `Ошибка API (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown; message?: unknown };
      if (typeof body?.detail === 'string') {
        message = body.detail;
      } else if (typeof body?.message === 'string') {
        message = body.message;
      }
    } catch {
      // тело не JSON — используем дефолтное сообщение
    }
    if (res.status === 413) {
      message = 'Файл слишком большой. Загрузите видео меньшего размера.';
    }
    throw new ApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

/** POST /api/site/analyze — загрузка видео на анализ, поле file. */
export async function analyzeVideo(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('file', file);
  return request<AnalyzeResponse>('/api/site/analyze', {
    method: 'POST',
    body: form,
  });
}

/** GET /api/site/jobs/{jobId} — состояние задачи анализа. */
export async function getJob(jobId: string): Promise<Job> {
  const job = await request<PublicJob>(`/api/site/jobs/${encodeURIComponent(jobId)}`);
  if (job.status === 'failed') return { ...job, error: job.error.message };
  if (job.status === 'processing') return job;
  return {
    job_id: job.job_id, status: job.status, source: job.source,
    result: {
      verdict: job.verdict === 'pass' ? 'Нарушений не обнаружено' : 'Обнаружены нарушения',
      events: job.violations.map(violation => ({
        type: violation.code, description: violation.message,
        timecode: violation.timestamp_seconds === undefined ? '—' : String(violation.timestamp_seconds),
        frames: [], source: { document: '' },
      })),
    },
  };
}
