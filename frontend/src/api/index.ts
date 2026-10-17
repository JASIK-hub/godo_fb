/**
 * Единая точка доступа к API для UI.
 *
 * Выбирает реальный клиент (client.ts) или мок (api/mock.ts) по конфигу.
 * UI никогда не импортирует их напрямую — так моки отделены от
 * реального API и отключаются одним флагом VITE_USE_MOCKS.
 */
import { config } from '../config';
import * as client from './client';
import * as mock from './mock';
import type { AnalyzeResponse, Job } from './types';

export type {
  AnalyzeResponse,
  DetectedEvent,
  Job,
  JobResult,
  JobStatus,
  RegulationSource,
} from './types';

/** true, если UI работает на моках (для бейджа в интерфейсе). */
export const isMockMode = config.useMocks;

/** POST /api/v1/analyze — загрузка видео (мок или реальный вызов). */
export function analyzeVideo(file: File): Promise<AnalyzeResponse> {
  return config.useMocks ? mock.mockAnalyze(file) : client.analyzeVideo(file);
}

/** GET /api/v1/jobs/{jobId} — состояние задачи (мок или реальный вызов). */
export function getJob(jobId: string): Promise<Job> {
  return config.useMocks ? mock.mockGetJob(jobId) : client.getJob(jobId);
}
