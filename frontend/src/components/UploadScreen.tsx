import { useState } from 'react';

interface UploadScreenProps {
  /** Обработчик отправки: получает выбранный файл. */
  onUpload: (file: File) => void;
  uploading: boolean;
  error: string | null;
}

const MAX_SIZE_MB = 500;

/** Экран загрузки в стиле Reference_1: дропзона ↔ карточка выбранного файла. */
export function UploadScreen({ onUpload, uploading, error }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const problem = (candidate: File): string | null => {
    if (!candidate.type.startsWith('video/')) {
      return 'Нужен видеофайл. Загрузите запись в видеоформате.';
    }
    if (candidate.size === 0) {
      return 'Файл пустой. Выберите корректную запись.';
    }
    if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Файл больше ${MAX_SIZE_MB} МБ. Выберите запись меньшего размера.`;
    }
    return null;
  };

  const selectFile = (candidate: File | undefined) => {
    if (!candidate) return;
    const issue = problem(candidate);
    if (issue) {
      setLocalError(issue);
      return;
    }
    setLocalError(null);
    setFile(candidate);
  };

  const removeFile = () => {
    setFile(null);
    setLocalError(null);
  };

  const submit = () => {
    if (!file) {
      setLocalError('Сначала выберите видеофайл.');
      return;
    }
    onUpload(file);
  };

  const sizeMb = file ? Math.max(0.1, file.size / (1024 * 1024)).toFixed(1) : null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Верхняя строка: контекст модуля + заголовок */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-secondary font-label-sm text-label-sm uppercase tracking-wider mb-1">
            <span className="material-symbols-outlined text-[16px] text-primary-container">videocam</span>
            <span>Модуль верификации • Анализ записей</span>
          </div>
          <h1 className="font-headline-xl text-headline-xl text-on-surface">Проверка видеозаписи</h1>
          <p className="font-body-lg text-body-lg text-secondary mt-1 max-w-2xl">
            Загрузите запись, чтобы выявить нарушения и проверить подтверждающие кадры.
          </p>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-low px-3 py-1.5 rounded-lg shadow-sm">
          <span className="w-2 h-2 rounded-full bg-tertiary-container" />
          <span className="font-label-md text-label-md text-on-surface">Смена #1 • Камера №04</span>
        </div>
      </div>

      {/* Основная карточка */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6 relative overflow-hidden">
        <input
          accept="video/*"
          className="hidden"
          id="video-input"
          type="file"
          onChange={(e) => selectFile(e.target.files?.[0])}
        />

        {/* Состояние А: дропзона (файл не выбран) */}
        {!file && (
          <div
            role="button"
            tabIndex={0}
            aria-label="Выбрать видеофайл"
            onClick={() => document.getElementById('video-input')?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') document.getElementById('video-input')?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              selectFile(e.dataTransfer.files?.[0]);
            }}
            className={`w-full cursor-pointer rounded-xl p-10 sm:p-14 flex flex-col items-center justify-center text-center transition-all duration-200 relative group ${
              dragOver ? 'bg-surface-container-high' : 'bg-surface-container-low hover:bg-surface-container/60'
            }`}
          >
            <div className="absolute inset-0 rounded-xl pointer-events-none opacity-40 group-hover:opacity-80 transition-opacity bg-[radial-gradient(#861b42_1px,transparent_1px)] [background-size:16px_16px]" />
            <div className="relative z-10 w-16 h-16 rounded-full bg-surface-container-lowest shadow-sm flex items-center justify-center text-primary-container mb-4 group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[32px]">upload_file</span>
            </div>
            <div className="relative z-10 font-headline-md text-headline-md text-on-surface mb-1">
              Перетащите видеофайл сюда или нажмите для выбора
            </div>
            <div className="relative z-10 font-body-sm text-body-sm text-secondary mb-4">
              Только видео • До {MAX_SIZE_MB} МБ
            </div>
            <button
              className="relative z-10 inline-flex items-center gap-1 px-5 py-2.5 rounded-lg bg-surface-container-lowest text-on-surface font-label-md text-label-md shadow-sm hover:bg-surface-container-high transition-colors"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                document.getElementById('video-input')?.click();
              }}
            >
              <span className="material-symbols-outlined text-[18px] text-secondary">file_upload</span>
              <span>Выбрать видео</span>
            </button>
          </div>
        )}

        {/* Состояние Б: карточка выбранного файла */}
        {file && (
          <div className="space-y-4">
            <div className="bg-surface-container-low rounded-xl p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-sm">
                    <span className="material-symbols-outlined text-[24px]">movie</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="font-headline-md text-headline-md text-on-surface truncate">
                        {file.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm shrink-0">
                        {file.type.replace('video/', '').toUpperCase() || 'VIDEO'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 font-body-sm text-body-sm text-secondary">
                      <span className="font-body-md-tabular text-body-md-tabular text-on-surface">
                        {sizeMb} МБ
                      </span>
                      <span className="w-1 h-1 rounded-full bg-secondary" />
                      <span className="flex items-center gap-1 text-tertiary-container font-label-sm text-label-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary-container" />
                        Готов к загрузке и анализу
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 self-end sm:self-center">
                  <button
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-secondary hover:text-on-surface hover:bg-surface-container-high transition-colors font-label-md text-label-md"
                    title="Заменить текущий файл"
                    type="button"
                    onClick={() => document.getElementById('video-input')?.click()}
                  >
                    <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                    <span>Заменить файл</span>
                  </button>
                  <button
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-error hover:bg-error-container/40 transition-colors"
                    title="Удалить файл"
                    type="button"
                    onClick={removeFile}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Плитки метаданных */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container text-[20px]">data_object</span>
                <div>
                  <div className="font-label-sm text-label-sm text-secondary">Тип файла</div>
                  <div className="font-body-md-tabular text-body-md-tabular text-on-surface">
                    {file.type || 'видео'}
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container text-[20px]">sd_storage</span>
                <div>
                  <div className="font-label-sm text-label-sm text-secondary">Размер</div>
                  <div className="font-body-md-tabular text-body-md-tabular text-on-surface">
                    {sizeMb} МБ
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-3 rounded-lg shadow-sm flex items-center gap-3">
                <span className="material-symbols-outlined text-primary-container text-[20px]">security</span>
                <div>
                  <div className="font-label-sm text-label-sm text-secondary">Ограничение</div>
                  <div className="font-body-md-tabular text-body-md-tabular text-on-surface">
                    до {MAX_SIZE_MB} МБ
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="pt-1 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1 text-secondary font-body-sm text-body-sm">
                <span className="material-symbols-outlined text-[16px] text-tertiary-container">verified</span>
                <span>Файл будет передан в контур видеоаналитики</span>
              </div>
              <button
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary-container hover:bg-[#701637] text-on-primary font-headline-md text-headline-md px-6 py-3 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={uploading}
                type="button"
                onClick={submit}
              >
                {uploading ? (
                  <>
                    <span className="inline-block w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                    <span>Инициализация проверки...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">play_arrow</span>
                    <span>Начать проверку</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Информационная карточка */}
      <div className="bg-surface-container-low rounded-xl p-4 flex items-start gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-fixed flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-[18px]">info</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-headline-md text-headline-md text-on-surface">
            Требования к видеозаписям
          </div>
          <div className="font-body-md text-body-md text-secondary mt-0.5">
            Поддерживаются видеофайлы любого распространённого формата разрешением от 720p.
            Записи с искажениями таймкодов или обрезанным полем зрения камеры могут быть
            обработаны некорректно.
          </div>
        </div>
      </div>

      {/* Ошибка валидации / загрузки — в стиле error-banner референса */}
      {(localError ?? error) && (
        <div className="bg-error-container text-on-error-container p-3 rounded-lg shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-error">error</span>
            <span className="font-body-md text-body-md font-medium">{localError ?? error}</span>
          </div>
          <button
            aria-label="Закрыть"
            className="text-on-error-container hover:opacity-75"
            type="button"
            onClick={() => {
              setLocalError(null);
            }}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

