import { useEffect, useState } from 'react';
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

/** Начало таймкода в секундах: «00:01:23–…» | «01:23.5» | «83» → число. */
function parseStartSeconds(timecode: string): number {
  const start = timecode.split(/[–—]/)[0].split('-')[0].trim();
  const parts = start.split(':').map((p) => Number.parseFloat(p));
  if (parts.length === 0 || parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

/** Короткая метка для таймлайна: «00:00:12–00:00:19» → «00:12». */
function shortTimecode(timecode: string): string {
  const start = timecode.split(/[–—]/)[0].split('-')[0].trim();
  const parts = start.split(':');
  if (parts.length >= 2) return parts.slice(-2).join(':');
  return start;
}

/** Данные модального просмотра кадра. */
interface FrameModalData {
  src: string;
  timecode: string;
  caption: string;
}

/** Модальное окно увеличенного просмотра кадра (по Reference_2). */
function FramePreviewModal({ frame, onClose }: { frame: FrameModalData; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-inverse-surface/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-container-lowest rounded-xl max-w-3xl w-full shadow-xl overflow-hidden flex flex-col">
        <div className="p-3 bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary-container text-[20px]">
              filter_center_focus
            </span>
            <span className="font-headline-md text-headline-md text-on-surface truncate">
              Увеличенный просмотр кадра
            </span>
            <span className="font-body-md-tabular text-body-sm px-2 py-0.5 rounded bg-primary-fixed/50 text-primary-container font-semibold shrink-0">
              {frame.timecode}
            </span>
          </div>
          <button
            aria-label="Закрыть"
            className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors shrink-0"
            type="button"
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="relative aspect-video w-full bg-inverse-surface">
          <img alt={frame.caption} className="w-full h-full object-contain" src={frame.src} />
        </div>
        <div className="p-4 flex flex-col gap-1 bg-surface-container-lowest">
          <h4 className="font-label-md text-label-md text-on-surface uppercase tracking-wide">
            Аннотация события
          </h4>
          <p className="font-body-md text-body-md text-secondary leading-relaxed">{frame.caption}</p>
        </div>
        <div className="px-4 py-2 bg-surface-container-low flex justify-end">
          <button
            className="px-3 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-high text-on-surface font-label-md text-label-md shadow-sm transition-colors"
            type="button"
            onClick={onClose}
          >
            Закрыть просмотр
          </button>
        </div>
      </div>
    </div>
  );
}

/** Карточка события в журнале (правая колонка). */
function EventListItem({
  event,
  index,
  selected,
  onSelect,
}: {
  event: DetectedEvent;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      aria-current={selected || undefined}
      className={`cursor-pointer p-3 rounded-lg flex flex-col gap-1 transition-all relative overflow-hidden ${
        selected
          ? 'bg-surface-container-lowest border-l-4 border-l-primary-container shadow-sm ring-1 ring-primary-container/20'
          : 'bg-surface-container-lowest hover:bg-surface-container-low shadow-sm'
      }`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 font-label-sm text-label-sm px-2 py-0.5 rounded-full bg-outline-variant/20 text-outline">
          <span className="w-1.5 h-1.5 rounded-full bg-outline" />
          <span>Требуется проверка</span>
        </span>
        <span
          className={`font-body-md-tabular text-body-md-tabular ${
            selected ? 'font-bold text-primary-container' : 'text-secondary font-medium'
          }`}
        >
          {shortTimecode(event.timecode)}
        </span>
      </div>
      <div className="flex flex-col mt-1">
        <span className="font-headline-md text-[14px] text-on-surface font-semibold">
          Событие {index + 1} — {event.type}
        </span>
        <span className="font-body-md text-body-md text-secondary line-clamp-2">
          {event.description}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-secondary">
        <span className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">
            {event.frames.length > 0 ? 'photo_camera' : 'schedule'}
          </span>
          Кадров: {event.frames.length}
        </span>
        <span className="font-body-md-tabular">{shortTimecode(event.timecode)}</span>
      </div>
    </div>
  );
}

/** Экран результата — «рабочий стол контролёра» по Reference_2. */
export function ResultScreen({ job, onReset }: ResultScreenProps) {
  const events = job.result?.events ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [modal, setModal] = useState<FrameModalData | null>(null);

  const selected: DetectedEvent | undefined = events[selectedIdx] ?? events[0];

  // Горячие клавиши: [1..9] — выбор события, Escape — закрыть модал.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModal(null);
        return;
      }
      const n = Number.parseInt(e.key, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= events.length) {
        setSelectedIdx(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [events.length]);

  // Сброс выбора, если список событий изменился.
  useEffect(() => {
    if (selectedIdx >= events.length) setSelectedIdx(0);
  }, [events.length, selectedIdx]);

  const noViolations = events.length === 0;

  /** Позиции маркеров на таймлайне относительно последнего события. */
  const timeline = noViolations
    ? []
    : (() => {
        const seconds = events.map((ev) => parseStartSeconds(ev.timecode));
        const scale = Math.max(...seconds, 1) * 1.1;
        return events.map((ev, i) => ({
          pct: Math.min(96, (seconds[i] / scale) * 100),
          label: shortTimecode(ev.timecode),
          index: i,
        }));
      })();

  if (noViolations) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-surface-container-high text-on-surface rounded-full font-label-md text-label-md">
            <span className="w-2 h-2 rounded-full bg-tertiary-container" />
            <span>Событий нарушений не найдено</span>
          </div>
          <button
            className="inline-flex items-center gap-1 px-3 py-2 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface rounded-lg font-label-md text-label-md transition-colors shadow-sm"
            type="button"
            onClick={onReset}
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">file_upload</span>
            <span>Проверить другое видео</span>
          </button>
        </div>
        <div className="bg-surface-container-low px-4 py-3 rounded-lg flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">info</span>
          <span className="font-body-md text-body-md text-secondary">
            Результат помогает провести проверку и не является окончательным заключением.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4">
      {/* Баннер результата */}
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-surface-container-high text-on-surface rounded-full font-label-md text-label-md">
            <span className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <span className="truncate">{job.result?.verdict || 'Обнаружены события'}</span>
          </div>
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-primary-fixed/50 text-primary-container rounded-full font-label-md text-label-md">
            <span className="material-symbols-outlined text-[15px]">flag</span>
            <span>{events.length} событий требуют внимания</span>
          </div>
          <div className="flex items-center gap-1 text-secondary font-body-sm text-body-sm min-w-0">
            <span className="material-symbols-outlined text-[16px] text-secondary">schedule</span>
            <span className="font-body-md-tabular text-body-md-tabular text-on-surface">
              задача {job.job_id}
            </span>
          </div>
        </div>
        <button
          className="inline-flex items-center gap-1 px-3 py-2 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface rounded-lg font-label-md text-label-md transition-colors shadow-sm shrink-0 self-end md:self-auto"
          type="button"
          onClick={onReset}
        >
          <span className="material-symbols-outlined text-[16px] text-secondary">file_upload</span>
          <span>Проверить другое видео</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ЛЕВАЯ КОЛОНКА */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {/* Просмотр выбранного события */}
          {selected && (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-4 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-error animate-pulse" />
                  <span className="font-label-md text-label-md text-on-surface uppercase tracking-wide truncate">
                    Событие {selectedIdx + 1} — {selected.type}
                  </span>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 font-body-sm text-body-sm text-secondary shrink-0">
                  <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                  Кадров: {selected.frames.length}
                </span>
              </div>

              {/* Основной кадр */}
              <div className="relative w-full aspect-video bg-inverse-surface flex items-center justify-center overflow-hidden">
                {selected.frames.length > 0 ? (
                  <img
                    alt={`Кадр события ${selected.type} на ${selected.timecode}`}
                    className="w-full h-full object-contain select-none"
                    src={frameSrc(selected.frames[0])}
                  />
                ) : (
                  <span className="material-symbols-outlined text-inverse-on-surface/50 text-[48px]">
                    image_not_supported
                  </span>
                )}
                <div className="absolute top-3 left-3 bg-inverse-surface/80 text-inverse-on-surface font-body-md-tabular text-body-sm px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                  <span className="text-primary-fixed-dim font-bold">ФАКТ</span>{' '}
                  {selected.timecode}
                </div>
              </div>

              {/* Таймлайн с маркерами событий */}
              <div className="px-4 pt-3 pb-1">
                <div className="relative w-full h-8 flex items-center select-none">
                  <div className="w-full h-2 rounded-full bg-surface-container-highest relative">
                    <div
                      className="absolute top-0 left-0 h-full bg-primary-container rounded-full transition-all duration-300"
                      style={{
                        width: `${timeline.find((t) => t.index === selectedIdx)?.pct ?? 0}%`,
                      }}
                    />
                    {timeline.map((t) => (
                      <div
                        className="absolute -top-1.5 -ml-2 w-4 h-6 flex flex-col items-center cursor-pointer"
                        key={t.index}
                        style={{ left: `${t.pct}%` }}
                        title={`Событие ${t.index + 1} — ${events[t.index].description}`}
                        onClick={() => setSelectedIdx(t.index)}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full shadow-md flex items-center justify-center ${
                            t.index === selectedIdx
                              ? 'bg-primary-container ring-2 ring-primary-fixed ring-offset-1'
                              : 'bg-outline'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              t.index === selectedIdx ? 'bg-on-primary' : 'bg-surface'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-[9px] font-body-md-tabular mt-0.5 ${
                            t.index === selectedIdx
                              ? 'font-bold text-primary-container'
                              : 'text-secondary'
                          }`}
                        >
                          {t.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Кадры-доказательства выбранного события */}
          {selected && selected.frames.length > 0 && (
            <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">
                    photo_library
                  </span>
                  <h3 className="font-headline-md text-headline-md text-on-surface tracking-tight">
                    Кадры-доказательства ({selected.frames.length})
                  </h3>
                </div>
                <span className="font-body-sm text-body-sm text-secondary flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">touch_app</span>
                  Нажмите на кадр для увеличения
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {selected.frames.map((url, i) => (
                  <div
                    className="group cursor-pointer rounded-lg bg-surface-container-low overflow-hidden hover:bg-surface-container-high transition-all shadow-sm"
                    key={i}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setModal({
                        src: frameSrc(url),
                        timecode: selected.timecode,
                        caption: selected.description,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setModal({
                          src: frameSrc(url),
                          timecode: selected.timecode,
                          caption: selected.description,
                        });
                      }
                    }}
                  >
                    <div className="relative aspect-video w-full overflow-hidden bg-inverse-surface">
                      <img
                        alt={`Кадр ${i + 1} события ${selected.type}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        src={frameSrc(url)}
                      />
                      <div className="absolute top-2 left-2 bg-inverse-surface/80 text-inverse-on-surface font-body-md-tabular text-[11px] px-1.5 py-0.5 rounded backdrop-blur-xs">
                        {shortTimecode(selected.timecode)}
                      </div>
                      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="material-symbols-outlined text-on-primary text-[28px] drop-shadow-md">
                          zoom_in
                        </span>
                      </div>
                    </div>
                    <div className="p-2">
                      <span className="font-label-md text-label-md text-on-surface">
                        Кадр {i + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Описание + нормативный источник */}
          {selected && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-1 text-on-surface font-headline-md text-headline-md">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">
                    visibility
                  </span>
                  <span>Что видно на видео</span>
                </div>
                <p className="font-body-md text-body-md text-on-surface leading-relaxed">
                  {selected.description}
                </p>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0 text-primary-container">
                    <span className="material-symbols-outlined text-[24px]">gavel</span>
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-label-md text-label-md text-on-surface font-semibold">
                        {selected.source?.document || 'Источник указан в описании нарушения'}
                      </span>
                      {selected.source?.clause && (
                        <span className="font-label-sm text-[10px] uppercase tracking-wide bg-surface-container-high text-secondary px-1.5 py-0.5 rounded">
                          {selected.source.clause}
                        </span>
                      )}
                    </div>
                    <p className="font-body-md text-body-md text-secondary">
                      Нормативный источник события {selectedIdx + 1}
                    </p>
                    {selected.source?.url && (
                      <a
                        className="inline-flex items-center gap-1 font-label-md text-label-md text-primary-container hover:text-primary hover:underline transition-colors"
                        href={selected.source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <span>Открыть источник</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Спокойное примечание */}
          <div className="bg-surface-container-low px-4 py-3 rounded-lg flex items-center gap-3">
            <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">info</span>
            <span className="font-body-md text-body-md text-secondary">
              Результат помогает провести проверку и не является окончательным заключением.
            </span>
          </div>
        </div>

        {/* ПРАВАЯ КОЛОНКА */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Журнал событий */}
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="material-symbols-outlined text-primary-container text-[20px]">
                  format_list_bulleted
                </span>
                <h2 className="font-headline-md text-headline-md text-on-surface">Журнал событий</h2>
              </div>
              <span className="font-label-sm text-label-sm text-secondary bg-surface-container px-2 py-0.5 rounded-full font-body-md-tabular">
                Всего: {events.length}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-secondary">
              Выберите событие для синхронизации кадров, описания и нормативной базы.
              Горячие клавиши: [1]…[{Math.min(events.length, 9)}]
            </p>
            <div className="flex flex-col gap-2">
              {events.map((event, i) => (
                <EventListItem
                  event={event}
                  index={i}
                  key={i}
                  selected={i === selectedIdx}
                  onSelect={() => setSelectedIdx(i)}
                />
              ))}
            </div>
          </div>

          {/* Быстрая навигация */}
          <div className="bg-surface-container-low p-3 rounded-lg flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-label-md text-label-md text-on-surface">Быстрая навигация</span>
              <span className="font-label-sm text-[11px] text-secondary font-body-md-tabular">
                Клавиши 1–{Math.min(events.length, 9)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {events.slice(0, 9).map((event, i) => (
                <button
                  className={`py-1.5 px-2 rounded text-center font-label-md text-label-md shadow-sm transition-colors ${
                    i === selectedIdx
                      ? 'bg-primary-container text-on-primary'
                      : 'bg-surface-container-lowest hover:bg-surface-container-high text-on-surface'
                  }`}
                  key={i}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                >
                  №{i + 1} ({shortTimecode(event.timecode)})
                </button>
              ))}
            </div>
          </div>

          {/* Параметры задачи */}
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col gap-2">
            <h3 className="font-headline-md text-headline-md text-on-surface">Параметры задачи</h3>
            <dl className="flex flex-col gap-1 text-body-sm font-body-sm">
              <div className="flex justify-between py-1 bg-surface-container-low px-2 rounded">
                <dt className="text-secondary">Идентификатор:</dt>
                <dd className="font-body-md-tabular text-on-surface truncate max-w-[60%]">
                  {job.job_id}
                </dd>
              </div>
              <div className="flex justify-between py-1 px-2">
                <dt className="text-secondary">Вердикт:</dt>
                <dd className="font-medium text-primary-container text-right">
                  {job.result?.verdict || '—'}
                </dd>
              </div>
              <div className="flex justify-between py-1 bg-surface-container-low px-2 rounded">
                <dt className="text-secondary">Событий найдено:</dt>
                <dd className="font-body-md-tabular text-on-surface">{events.length}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {modal && <FramePreviewModal frame={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
