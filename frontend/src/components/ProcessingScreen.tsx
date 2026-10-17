import type { Job } from '../api';

interface ProcessingScreenProps {
  job: Job | null;
  phase: 'polling' | 'done' | 'failed' | 'error';
  error: string | null;
  /** Вернуться на экран загрузки. */
  onReset: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'В очереди',
  processing: 'Обработка',
  done: 'Готово',
  failed: 'Ошибка',
  error: 'Ошибка сети',
};

/** Экран обработки: индикатор прогресса, опрос задачи. */
export function ProcessingScreen({ job, phase, error, onReset }: ProcessingScreenProps) {
  const progress = job?.progress ?? 0;
  const isFailed = phase === 'failed' || phase === 'error';
  const isDone = phase === 'done';

  return (
    <section className="mx-auto w-full max-w-xl text-center">
      <h1 className="mb-6 text-2xl font-semibold text-slate-100">
        {isDone && 'Анализ завершён'}
        {isFailed && 'Не удалось обработать видео'}
        {!isDone && !isFailed && 'Видео обрабатывается'}
      </h1>

      {/* Прогресс-бар: из поля job.progress, если backend отдаёт. */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isFailed ? 'bg-red-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      <p className="mt-3 text-sm text-slate-400">
        {job?.status ? STATUS_LABEL[job.status] : 'Подготовка…'} · {progress}%
      </p>

      {(phase === 'failed' || phase === 'error') && (
        <p className="mt-4 rounded-lg border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200">
          {job?.error ?? error ?? 'Неизвестная ошибка обработки.'}
          <br />
          <span className="text-xs text-red-300/70">
            Это не «нарушений нет» — видео не удалось обработать.
          </span>
        </p>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700/50"
      >
        Загрузить другое видео
      </button>
    </section>
  );
}
