/**
 * Реальный HTTP-клиент API.
 *
 * Источник истины — contracts/public-api.yaml. Пока контракта нет,
 * пути и поля — предположение; после появления контракта сверить и
 * привести в точное соответствие.
 */
import { config } from '../config';
import type { AnalyzeResponse, Job } from './types';

/** Ошибка HTTP-запроса с кодом ответа. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Общая обёртка fetch: cookie сессии backend передаётся с каждым запросом. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    credentials: 'include',
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

/** POST /api/v1/analyze — загрузка видео на анализ, поле file. */
export async function analyzeVideo(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('file', file);
  return request<AnalyzeResponse>('/api/v1/analyze', {
    method: 'POST',
    body: form,
  });
}

/** GET /api/v1/jobs/{jobId} — состояние задачи анализа. */
export async function getJob(jobId: string): Promise<Job> {
  return request<Job>(`/api/v1/jobs/${encodeURIComponent(jobId)}`);
}
