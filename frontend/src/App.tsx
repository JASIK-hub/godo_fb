import { useState } from 'react';
import { analyzeVideo, isMockMode } from './api';
import { ProcessingScreen } from './components/ProcessingScreen';
import { ResultScreen } from './components/ResultScreen';
import { UploadScreen } from './components/UploadScreen';
import { useJobPolling } from './hooks/useJobPolling';

type Screen = 'upload' | 'processing' | 'result';

export default function App() {
  const [screen, setScreen] = useState<Screen>('upload');
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { job, phase, error } = useJobPolling(jobId);

  /** Начать анализ: POST /api/v1/analyze → переход к опросу задачи. */
  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const { job_id } = await analyzeVideo(file);
      setJobId(job_id);
      setScreen('processing');
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Не удалось отправить видео на анализ.',
      );
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    // Обнуляем jobId — хук прекратит опрос (уход «со страницы» задачи).
    setJobId(null);
    setUploadError(null);
    setScreen('upload');
  };

  /** Экран результата показываем только при реально завершённой задаче. */
  const showResult = screen === 'processing' && phase === 'done' && job?.result;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {isMockMode && (
        <div className="bg-amber-500/10 py-1 text-center text-xs text-amber-300">
          Режим мока: backend недоступен, данные искусственные
        </div>
      )}
      <main className="mx-auto max-w-4xl px-4 py-10">
        {screen === 'upload' && (
          <UploadScreen onUpload={handleUpload} uploading={uploading} error={uploadError} />
        )}
        {screen === 'processing' && !showResult && (
          <ProcessingScreen
            job={job}
            phase={phase}
            error={error}
            onReset={handleReset}
          />
        )}
        {showResult && (
          <ResultScreen job={job} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
