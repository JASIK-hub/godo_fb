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

/** Экран обработки в стиле Reference_1. */
export function ProcessingScreen({ job, phase, error, onReset }: ProcessingScreenProps) {
  const progress = job?.progress ?? 0;
  const isFailed = phase === 'failed' || phase === 'error';
  const isDone = phase === 'done';

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-1 text-secondary font-label-sm text-label-sm uppercase tracking-wider mb-1">
          <span className="material-symbols-outlined text-[16px] text-primary-container">pending_actions</span>
          <span>Модуль верификации • Анализ записей</span>
        </div>
        <h1 className="font-headline-xl text-headline-xl text-on-surface">
          {isDone && 'Анализ завершён'}
          {isFailed && 'Не удалось обработать видео'}
          {!isDone && !isFailed && 'Видео обрабатывается'}
        </h1>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-4">
        {/* Прогресс-бар в цветах темы */}
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-container-highest"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isFailed ? 'bg-error' : 'bg-primary-container'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>

        <div className="flex items-center justify-between font-label-md text-label-md">
          <span className="text-on-surface">{job?.status ? STATUS_LABEL[job.status] : 'Подготовка…'}</span>
          <span className="font-body-md-tabular text-body-md-tabular text-secondary">{progress}%</span>
        </div>

        {(phase === 'failed' || phase === 'error') && (
          <div className="bg-error-container text-on-error-container p-3 rounded-lg shadow-sm flex items-start justify-between">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-error">error</span>
              <div>
                <div className="font-body-md text-body-md font-medium">
                  {job?.error ?? error ?? 'Неизвестная ошибка обработки.'}
                </div>
                <div className="font-body-sm text-body-sm opacity-70 mt-1">
                   Видео не удалось обработать.
                </div>
              </div>
            </div>
            <button aria-label="Закрыть" className="text-on-error-container hover:opacity-75" type="button">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1 text-secondary font-body-sm text-body-sm">
            <span className="material-symbols-outlined text-[16px] text-tertiary-container">shield</span>
            <span>Опрос статуса выполняется каждые 2 секунды</span>
          </div>
          <button
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md"
            type="button"
            onClick={onReset}
          >
            <span className="material-symbols-outlined text-[16px]">undo</span>
            <span>Загрузить другое видео</span>
          </button>
        </div>
      </div>
    </div>
  );
}
