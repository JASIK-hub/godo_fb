import { useState } from 'react';

interface UploadScreenProps {
  /** Обработчик отправки: получает выбранный файл. */
  onUpload: (file: File) => void;
  uploading: boolean;
  error: string | null;
}

const ACCEPT = 'video/*';
const MAX_SIZE_MB = 500;

export function UploadScreen({ onUpload, uploading, error }: UploadScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (candidate: File): string | null => {
    if (!candidate.type.startsWith('video/')) {
      return 'Нужен видеофайл.';
    }
    if (candidate.size === 0) {
      return 'Файл пустой.';
    }
    if (candidate.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Файл больше ${MAX_SIZE_MB} МБ.`;
    }
    return null;
  };

  const selectFile = (candidate: File | undefined) => {
    if (!candidate) return;
    const problem = validate(candidate);
    if (problem) {
      setLocalError(problem);
      setFile(null);
      return;
    }
    setLocalError(null);
    setFile(candidate);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setLocalError('Сначала выберите видеофайл.');
      return;
    }
    onUpload(file);
  };

  return (
    <section className="mx-auto w-full max-w-xl">
      <h1 className="mb-2 text-2xl font-semibold text-slate-100">
        Анализ видео с производства
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        Загрузите запись для поиска нарушений техники безопасности.
        Результат появится на этой странице автоматически.
      </p>

      <form onSubmit={submit} className="rounded-xl border border-slate-700 bg-slate-800/60 p-6">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            selectFile(e.dataTransfer.files?.[0]);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-600 bg-slate-900/50 px-4 py-10 text-center transition hover:border-blue-500"
        >
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => selectFile(e.target.files?.[0])}
          />
          <span className="text-3xl" aria-hidden="true">📹</span>
          <span className="text-sm font-medium text-slate-200">
            {file ? file.name : 'Перетащите видео сюда или нажмите для выбора'}
          </span>
          {file && (
            <span className="text-xs text-slate-400">
              {Math.max(1, Math.round(file.size / (1024 * 1024)))} МБ
            </span>
          )}
          <span className="text-xs text-slate-500">до {MAX_SIZE_MB} МБ, только видео</span>
        </label>

        <button
          type="submit"
          disabled={!file || uploading}
          className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-400"
        >
          {uploading ? 'Загрузка…' : 'Отправить на анализ'}
        </button>
      </form>

      {(localError ?? error) && (
        <p className="mt-4 rounded-lg border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200">
          {(localError ?? error)}
        </p>
      )}
    </section>
  );
}
