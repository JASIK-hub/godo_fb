/**
 * Моковая реализация API.
 *
 * Весь UI работает через api/index.ts, который выбирает mock или client
 * по config.useMocks. Ответы соответствуют ПРЕДПОЛОЖЕНОМУ контракту
 * (см. api/types.ts). Когда backend будет готов, переключение делается
 * через VITE_USE_MOCKS=false.
 */
import type { AnalyzeResponse, DetectedEvent, Job } from './types';
import { ApiError } from './client';

/** Длительность имитации обработки, мс. */
const MOCK_PROCESSING_MS = 10_000;

interface MockJob {
  createdAt: number;
  /** Имитация сбоя: job завершится с ошибкой, а не результатом. */
  fail: boolean;
}

const jobs = new Map<string, MockJob>();
let jobCounter = 0;

/** Серый SVG-плейсхолдер вместо реального кадра (data URI — работает офлайн). */
function placeholderFrame(label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">` +
    `<rect width="100%" height="100%" fill="#1f2937"/>` +
    `<text x="50%" y="50%" fill="#9ca3af" font-family="monospace" font-size="16"` +
    ` text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function sampleEvents(): DetectedEvent[] {
  return [
    {
      type: 'no_helmet',
      timecode: '00:00:12–00:00:19',
      description:
        'Работник без защитной каски в зоне монтажа конструкций (мок: пример события).',
      frames: [placeholderFrame('кадр 1 · 00:00:13'), placeholderFrame('кадр 2 · 00:00:17')],
      source: {
        document: 'СНиП РК 1.03.05-2011',
        clause: 'п. 4.8',
      },
    },
    {
      type: 'no_vest',
      timecode: '00:01:04–00:01:11',
      description:
        'Работник без сигнального жилета вблизи движущейся техники (мок: пример события).',
      frames: [placeholderFrame('кадр 1 · 00:01:05')],
      source: {
        document: 'СНиП РК 1.03.05-2011',
        clause: 'п. 4.12',
      },
    },
    {
      type: 'danger_zone',
      timecode: '00:02:37–00:02:44',
      description:
        'Нахождение в опасной зоне вблизи работающей грузоподъёмной техники (мок: пример события).',
      frames: [placeholderFrame('кадр 1 · 00:02:38'), placeholderFrame('кадр 2 · 00:02:41')],
      source: {
        document: 'СНиП РК 1.03.05-2011',
        clause: 'п. 5.3',
      },
    },
  ];
}

function mockJobAt(jobId: string, job: MockJob, now: number): Job {
  const elapsed = now - job.createdAt;
  if (elapsed >= MOCK_PROCESSING_MS && !job.fail) {
    return {
      job_id: jobId,
      status: 'done',
      progress: 100,
      result: {
        verdict: 'Нарушения обнаружены (мок)',
        events: sampleEvents(),
      },
    };
  }
  if (elapsed >= MOCK_PROCESSING_MS && job.fail) {
    return {
      job_id: jobId,
      status: 'failed',
      progress: 100,
      error: 'Не удалось обработать видео (мок: имитация сбоя backend)',
    };
  }
  const progress = Math.min(99, Math.round((elapsed / MOCK_PROCESSING_MS) * 100));
  return {
    job_id: jobId,
    status: elapsed < 2000 ? 'queued' : 'processing',
    progress,
  };
}

export async function mockAnalyze(file: File): Promise<AnalyzeResponse> {
  // Небольшая задержка, чтобы UI показал состояние загрузки.
  await new Promise((r) => setTimeout(r, 800));
  const job_id = `mock-${Date.now()}-${++jobCounter}`;
  jobs.set(job_id, { createdAt: Date.now(), fail: file.size === 0 });
  return { job_id };
}

export async function mockGetJob(jobId: string): Promise<Job> {
  await new Promise((r) => setTimeout(r, 150));
  const job = jobs.get(jobId);
  if (!job) {
    throw new ApiError(404, 'Задача не найдена');
  }
  return mockJobAt(jobId, job, Date.now());
}
