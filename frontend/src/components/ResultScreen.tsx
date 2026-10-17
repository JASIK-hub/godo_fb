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

/** Галерея кадров события: основной кадр + миниатюры. */
function FrameGallery({ frames, alt }: { frames: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  if (frames.length === 0) return null;
  const url = frames[Math.min(idx, frames.length - 1)];

  return (
    <div className="mb-3">
      <img
        src={frameSrc(url)}
        alt={alt}
        className="max-h-64 w-full rounded-lg border border-slate-700 object-contain"
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
                i === idx ? 'border-blue-500' : 'border-slate-600 opacity-60 hover:opacity-100'
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

/** Карточка одного найденного события. */
function EventCard({ event }: { event: DetectedEvent }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
          {event.type}
        </span>
        <code className="rounded bg-slate-900 px-2 py-0.5 text-xs text-slate-300">
          {event.timecode}
        </code>
      </div>
      <FrameGallery frames={event.frames ?? []} alt={`Кадр события ${event.type} на ${event.timecode}`} />
      <p className="mb-2 text-sm text-slate-300">{event.description}</p>
      {event.source && (
        <p className="text-xs text-slate-500">
          Нормативный источник: {event.source.document}
          {event.source.clause ? `, ${event.source.clause}` : ''}
          {event.source.url && (
            <>
              {' · '}
              <a
                href={event.source.url}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-slate-300"
              >
                текст норматива
              </a>
            </>
          )}
        </p>
      )}
    </article>
  );
}

export function ResultScreen({ job, onReset }: ResultScreenProps) {
  const verdict = job.result?.verdict ?? '';
  const events = job.result?.events ?? [];
  const noViolations = events.length === 0;

  return (
    <section className="mx-auto w-full max-w-3xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-100">
        {verdict || 'Результат анализа'}
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        {noViolations
          ? 'Событий нарушений не найдено.'
          : `Найдено событий: ${events.length}`}
      </p>

      <div className="flex flex-col gap-4">
        {events.map((event, i) => (
          <EventCard key={i} event={event} />
        ))}
      </div>

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
