import { useState } from 'react';
import { config } from '../config';
import type { DetectedEvent, Job } from '../api';

interface ResultScreenProps {
  job: Job;
  /** Вернуться к загрузке нового видео. */
  onReset: () => void;
}

/** URL кадра: абсолютный оставляем, относительный резолвим от apiBaseUrl. */
function frameSrc(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${config.apiBaseUrl}${url}`;
}

/** Галерея кадров события. */
function FrameGallery({ frames, alt }: { frames: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  if (frames.length === 0) return null;
  const url = frames[Math.min(idx, frames.length - 1)];

  return (
    <div className="mb-3">
      <img
        src={frameSrc(url)}
        alt={alt}
        className="max-h-64 w-full rounded-lg border border-outline-variant/40 object-contain bg-surface-container-low"
        loading="lazy"
      />
      {frames.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {frames.map((thumb, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`h-12 w-20 overflow-hidden rounded border ${
                i === idx ? 'border-primary' : 'border-outline-variant/40 opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={frameSrc(thumb)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Карточка одного события. */
function EventCard({ event }: { event: DetectedEvent }) {
  return (
    <article className="bg-surface-container-lowest rounded-xl shadow-sm p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm">
          {event.type}
        </span>
        <code className="px-2 py-0.5 rounded bg-surface-container-high font-body-md-tabular text-body-md-tabular text-on-surface">
          {event.timecode}
</code>
      </div>
      <FrameGallery
        frames={event.frames ?? []}
        alt={`Кадр события ${event.type} на ${event.timecode}`}
      />
      <p className="mb-2 font-body-lg text-body-lg text-on-surface">{event.description}</p>
      {event.source && (
        <div className="flex items-start gap-1 font-body-sm text-body-sm text-secondary">
          <span className="material-symbols-outlined text-[16px] text-primary-container">menu_book</span>
          <span>
            Нормативный источник: {event.source.document}
            {event.source.clause ? `, ${event.source.clause}` : ''}
            {event.source.url && (
              <>
                {' · '}
                <a
                  href={event.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-on-surface"
                >
                  текст норматива
                </a>
              </>
            )}
          </span>
        </div>
      )}
    </article>
  );
}

/** Экран результата в стиле Reference_1. */
export function ResultScreen({ job, onReset }: ResultScreenProps) {
  const verdict = job.result?.verdict ?? '';
  const events = job.result?.events ?? [];
  const noViolations = events.length === 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-secondary font-label-sm text-label-sm uppercase tracking-wider mb-1">
            <span className="material-symbols-outlined text-[16px] text-primary-container">fact_check</span>
            <span>Модуль верификации • Результат</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface">
            {verdict || 'Результат анализа'}
          </h1>
          <p className="font-body-lg text-body-lg text-secondary mt-1">
            {noViolations
              ? 'Событий нарушений не найдено.'
              : `Найдено событий: ${events.length}`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {events.map((event, i) => (
          <EventCard key={i} event={event} />
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-1 text-secondary font-body-sm text-body-sm">
          <span className="material-symbols-outlined text-[16px] text-tertiary-container">verified</span>
          <span>Результат сформирован автоматически, проверьте ключевые кадры</span>
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
  );
}
