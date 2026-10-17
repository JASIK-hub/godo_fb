/**
 * Типы данных API.
 *
 * PublicJob — транспортный контракт; Job — модель представления экрана.
 */

/** Статусы задачи анализа. */
export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

/** Ответ на POST /api/v1/analyze — задача принята в обработку. */
export interface AnalyzeResponse {
  job_id: string;
}

/** Нормативный источник, на который ссылается событие. */
export interface RegulationSource {
  /** Например: «СНиП РК 1.03.05-2011». */
  document: string;
  /** Например: «п. 4.8, табл. 2». */
  clause?: string;
  /** Ссылка на текст норматива, если backend отдаёт. */
  url?: string;
}

/** Событие нарушения, найденное в видео. */
export interface DetectedEvent {
  /** Тип нарушения, например «no_helmet». */
  type: string;
  /** Таймкод, например «00:01:23» или «00:01:23–00:01:45». */
  timecode: string;
  /** Описание нарушения. */
  description: string;
  /** URL-ы кадров события, отдаваемые backend (могут быть относительными к apiBaseUrl). */
  frames: string[];
  /** Нормативный источник. */
  source: RegulationSource;
}

/** Результат анализа внутри job. */
export interface JobResult {
  /** Итоговый вердикт, например «Нарушения обнаружены» / «Нарушений не обнаружено». */
  verdict: string;
  /** Все найденные события. */
  events: DetectedEvent[];
}

/** Состояние задачи анализа (GET /api/v1/jobs/{job_id}). */
export interface Job {
  source?: 'ml' | 'stub';
  job_id: string;
  status: JobStatus;
  /** Прогресс обработки 0..100, если backend отдаёт. */
  progress?: number;
  /** Сообщение об ошибке при status === 'failed'. */
  error?: string;
  /** Результат при status === 'done'. */
  result?: JobResult;
}

export type PublicJob = { job_id: string } & (
  | { status: 'processing' }
  | { status: 'failed'; error: { code: string; message: string } }
  | { status: 'done'; source: 'ml' | 'stub'; verdict: 'pass' | 'fail';
      violations: { code: string; message: string; timestamp_seconds: number }[] }
);
