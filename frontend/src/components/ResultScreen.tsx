import { useEffect, useRef, useState } from 'react';
import type { Job } from '../api';
import { config } from '../config';

interface ResultScreenProps {
  job: Job;
  videoFile: File | null;
  onReset: () => void;
}

function seconds(value: string): number {
  const parts = value.split(/[–—]/)[0].split('-')[0].trim().split(':').map(Number);
  return parts.every(Number.isFinite) ? Math.max(0, parts.reduce((sum, n) => sum * 60 + n, 0)) : 0;
}

function time(value: number): string {
  if (!Number.isFinite(value)) return '00:00';
  const total = Math.max(0, Math.floor(value));
  const fraction = Math.floor((Math.max(0, value) - total) * 10 + 0.00001);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}.${fraction}`;
}

const panel = 'bg-surface-container-lowest rounded-xl shadow-sm p-4';

export function ResultScreen({ job, videoFile, onReset }: ResultScreenProps) {
  const events = job.result?.events ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string>();
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackError, setPlaybackError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const frameDialog = useRef<HTMLDialogElement>(null);
  const [framePreview, setFramePreview] = useState<string>();
  const selected = events[selectedIdx];
  const noViolations = events.length === 0;

  useEffect(() => {
    if (!videoFile) return;
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  function selectEvent(index: number) {
    setSelectedIdx(index);
    const target = seconds(events[index].timecode);
    const video = videoRef.current;
    if (video && video.readyState >= 1) {
      video.currentTime = Math.min(target, Number.isFinite(video.duration) ? video.duration : target);
    } else pendingSeek.current = target;
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey ||
          (event.target instanceof HTMLElement && (event.target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(event.target.tagName)))) return;
      const index = Number(event.key) - 1;
      if (/^[1-9]$/.test(event.key) && index < events.length) selectEvent(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="w-full space-y-4">
      <div className={`${panel} flex flex-col xl:flex-row xl:items-center justify-between gap-3`}>
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-high rounded-full text-label-md">
            <span className={`w-2 h-2 rounded-full ${noViolations ? 'bg-tertiary-container' : 'bg-primary-container'}`} />
            {job.result?.verdict}
          </span>
          <span className="px-3 py-1 bg-primary-fixed/50 text-primary-container rounded-full text-label-md">
            {noViolations ? 'Событий для проверки нет' : `Событий для проверки: ${events.length}`}
          </span>
          <span className="text-body-sm text-secondary break-all">{videoFile?.name ?? 'Видео анализа'}</span>
        </div>
        <button type="button" onClick={onReset} className="flex items-center justify-center gap-1 px-3 py-2 rounded-lg hover:bg-surface-container-low text-label-md shrink-0">
          <span className="material-symbols-outlined text-[18px]">file_upload</span>Проверить другое видео
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 min-w-0 flex flex-col gap-4">
          <section className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden" aria-label="Просмотр видео">
            <div className="px-4 py-3 bg-surface-container-low flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-label-md uppercase tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-container text-[20px]">videocam</span>Исходная видеозапись
              </h2>
              <span className="text-body-sm text-secondary">Длительность: {duration > 0 ? time(duration) : '—'}</span>
            </div>
            <div className="relative aspect-video bg-inverse-surface flex items-center justify-center">
              {videoUrl ? <video ref={videoRef} src={videoUrl} controls autoPlay muted playsInline preload="metadata"
                aria-label={`Видеозапись ${videoFile?.name ?? ''}`} className="w-full h-full object-contain"
                onError={() => setPlaybackError(true)}
                onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
                onLoadedMetadata={event => {
                  const video = event.currentTarget;
                  setDuration(Number.isFinite(video.duration) ? video.duration : 0);
                  setPlaybackError(false);
                  if (pendingSeek.current !== null) {
                    video.currentTime = Math.min(pendingSeek.current, video.duration);
                    pendingSeek.current = null;
                  }
                }} /> : <p className="text-inverse-on-surface text-body-md">Исходное видео недоступно. Загрузите запись повторно.</p>}
              {videoUrl && <div className="absolute top-3 left-3 right-3 flex flex-wrap justify-between gap-2 pointer-events-none text-body-sm text-inverse-on-surface">
                <span className="rounded bg-inverse-surface/80 px-2 py-1 font-mono">{time(currentTime)} / {time(duration)}</span>
                {selected && <span className="rounded bg-primary-container/90 px-2 py-1">Выбрано событие {selectedIdx + 1} · {time(seconds(selected.timecode))}</span>}
              </div>}
            </div>
            {playbackError && <p role="alert" className="p-4 text-body-md text-error">Браузер не может воспроизвести кодек этой записи. Для просмотра используйте MP4 с видео H.264.</p>}
            <div className="px-4 pt-3 pb-5">
              <div className="flex justify-between text-body-sm text-secondary mb-3"><span>Метки событий</span><span>{noViolations ? 'Нарушений не обнаружено' : 'Нажмите на метку для перехода'}</span></div>
              <div className="relative h-2 rounded-full bg-surface-container-highest mx-2">
                {duration > 0 && events.map((event, index) => <button key={index} type="button"
                  aria-label={`Событие ${index + 1}, ${time(seconds(event.timecode))}`}
                  title={`${time(seconds(event.timecode))} — ${event.description}`}
                  onClick={() => selectEvent(index)} style={{ left: `${Math.min(100, seconds(event.timecode) / duration * 100)}%` }}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-surface ${selectedIdx === index ? 'bg-primary-container ring-2 ring-primary-fixed' : 'bg-outline'}`} />)}
              </div>
            </div>
          </section>

          <section className={panel}>
            <h3 className="text-headline-md flex items-center gap-2"><span className="material-symbols-outlined text-primary-container">photo_library</span>Кадры-доказательства</h3>
            <p className="mt-2 text-body-md text-secondary">{noViolations
              ? 'Нарушений не обнаружено — кадры событий отсутствуют. Видеозапись доступна для просмотра выше.'
              : 'Просмотрите момент выбранного события в исходной видеозаписи.'}</p>
            {!!selected?.frames.length && <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              {selected.frames.map((frame, index) => {
                const src = /^(https?:\/\/|data:image\/)/.test(frame) ? frame : `${config.apiBaseUrl}${frame}`;
                return <button key={index} type="button" onClick={() => { setFramePreview(src); frameDialog.current?.showModal(); }} className="text-left rounded-lg overflow-hidden bg-surface-container-low hover:bg-surface-container-high">
                  <img src={src} alt={`Кадр ${index + 1} выбранного события`} loading="lazy" className="aspect-video w-full object-cover" />
                  <span className="block p-2 text-body-sm">Кадр {index + 1} · Открыть в полном размере</span>
                </button>;
              })}
            </div>}
          </section>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <section className={panel}>
              <h3 className="text-headline-md flex items-center gap-2"><span className="material-symbols-outlined text-primary-container">visibility</span>Что видно на видео</h3>
              {selected && <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm">
                <span className="text-secondary">Тип: {selected.type}</span>
                <button type="button" onClick={() => selectEvent(selectedIdx)} className="rounded bg-primary-fixed/50 px-2 py-1 text-primary-container">
                  Перейти к {time(seconds(selected.timecode))}
                </button>
              </div>}
              <p className="mt-2 text-body-md leading-relaxed">{selected?.description ?? 'По результатам анализа признаков нарушений не обнаружено. Запись можно просмотреть целиком.'}</p>
            </section>
            <section className={panel}>
              <h3 className="text-headline-md flex items-center gap-2"><span className="material-symbols-outlined text-outline">help_outline</span>{noViolations ? 'Результат проверки' : 'Почему требуется проверка'}</h3>
              <p className="mt-2 text-body-md leading-relaxed">{noViolations ? 'Анализ завершён. События, требующие внимания, не выявлены.' : 'Анализ отметил возможное нарушение. Сопоставьте описание события с указанным моментом видеозаписи.'}</p>
            </section>
          </div>
          <section className={`${panel} flex gap-3 items-start`}>
            <span className="material-symbols-outlined text-primary-container p-2 rounded-lg bg-surface-container-high">gavel</span>
            <div><h3 className="text-headline-md">Нормативный источник</h3>
              <p className="mt-1 text-body-md text-secondary">{noViolations ? 'События, требующие нормативного обоснования, отсутствуют.' : selected?.source?.document || 'Сведения об источнике приведены в описании события, если они переданы анализом.'}</p>
              {selected?.source?.clause && <p className="text-body-sm text-secondary">{selected.source.clause}</p>}
              {selected?.source?.url && /^https?:\/\//.test(selected.source.url) && <a href={selected.source.url} target="_blank" rel="noreferrer" className="text-primary-container underline text-body-md">Открыть источник</a>}
            </div>
          </section>
          <div className="bg-surface-container-low px-4 py-3 rounded-lg flex items-center gap-3 text-secondary text-body-md">
            <span className="material-symbols-outlined">info</span>Результат помогает провести проверку и не является окончательным заключением.
          </div>
        </div>

        <aside className="lg:col-span-4 min-w-0 flex flex-col gap-4">
          <section className={panel}>
            <div className="flex items-center justify-between gap-2"><h2 className="text-headline-md">Журнал событий</h2><span className="text-label-sm bg-surface-container rounded-full px-2 py-1">Всего: {events.length}</span></div>
            <p className="mt-2 mb-4 text-body-sm text-secondary">{noViolations ? 'Анализ завершён. Событий для проверки нет.' : 'Выберите событие для перехода к моменту на видео и просмотра описания.'}</p>
            {noViolations ? <div className="p-6 rounded-lg bg-surface-container-low text-center">
              <span className="material-symbols-outlined text-tertiary-container text-[36px]">task_alt</span>
              <p className="mt-2 text-headline-md">Нарушений не обнаружено</p><p className="mt-1 text-body-sm text-secondary">Вы можете самостоятельно просмотреть запись.</p>
            </div> : <div className="flex flex-col gap-2">{events.map((event, index) => <button key={index} type="button" onClick={() => selectEvent(index)} aria-pressed={selectedIdx === index}
              className={`w-full text-left p-3 rounded-lg border-l-4 ${selectedIdx === index ? 'border-primary-container bg-surface-container-low ring-1 ring-primary-container/20' : 'border-transparent hover:bg-surface-container-low'}`}>
              <div className="flex justify-between gap-2 text-label-sm"><span className="text-outline">Требуется проверка</span><span className="text-primary-container">{time(seconds(event.timecode))}</span></div>
              <p className="mt-2 text-headline-md">Событие {index + 1}</p><p className="text-body-md text-secondary">{event.description}</p>
            </button>)}</div>}
            <div className="mt-4 p-3 rounded-lg bg-surface-container-low"><h3 className="text-label-md">Быстрая навигация</h3>
              {noViolations ? <p className="mt-2 text-body-sm text-secondary">Используйте шкалу плеера для перехода к любому моменту записи.</p> : <>
                <p className="mt-1 text-body-sm text-secondary">Клавиши 1–{Math.min(events.length, 9)}</p>
                <div className="grid grid-cols-3 gap-1 mt-2">{events.slice(0, 9).map((event, index) => <button key={index} type="button" onClick={() => selectEvent(index)}
                  className={`rounded px-2 py-2 text-label-sm ${index === selectedIdx ? 'bg-primary-container text-on-primary' : 'bg-surface-container-lowest hover:bg-surface-container-high'}`}>№{index + 1} ({time(seconds(event.timecode))})</button>)}</div>
              </>}
            </div>
          </section>
          <section className={panel}><h3 className="text-headline-md mb-3">Параметры записи</h3>
            <dl className="text-body-sm space-y-2">
              <div className="bg-surface-container-low rounded p-2"><dt className="text-secondary">Файл</dt><dd className="break-all mt-1">{videoFile?.name ?? '—'}</dd></div>
              <div className="flex justify-between gap-2 px-2"><dt className="text-secondary">Длительность</dt><dd>{duration > 0 ? time(duration) : '—'}</dd></div>
              <div className="bg-surface-container-low rounded p-2 flex justify-between gap-2"><dt className="text-secondary">Событий найдено</dt><dd>{events.length}</dd></div>
              <div className="px-2"><dt className="text-secondary">Вердикт</dt><dd className="mt-1">{job.result?.verdict}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
      <dialog ref={frameDialog} aria-label="Увеличенный просмотр кадра" className="m-auto p-0 rounded-xl bg-surface-container-lowest text-on-surface w-full max-w-3xl max-h-[90vh] overflow-auto backdrop:bg-inverse-surface/70">
        <div className="p-3 flex justify-between items-center gap-3"><h2 className="text-headline-md">Кадр события</h2>
          <button type="button" onClick={() => frameDialog.current?.close()} className="rounded-lg px-3 py-2 hover:bg-surface-container-low">Закрыть</button>
        </div>
        {framePreview && <img src={framePreview} alt="Увеличенный кадр выбранного события" className="w-full object-contain" />}
      </dialog>
    </div>
  );
}
