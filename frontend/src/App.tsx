import { useState } from 'react';
import { analyzeVideo, isMockMode } from './api';
import { AppFooter } from './components/AppFooter';
import { AppHeader } from './components/AppHeader';
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
    <div className="min-h-screen flex flex-col bg-surface text-on-surface">
      <AppHeader />
      <main className="w-full flex-1 pt-14 bg-surface">
        <div className="w-full max-w-7xl mx-auto px-6 py-6">
          {screen === 'upload' && (
            <UploadScreen onUpload={handleUpload} uploading={uploading} error={uploadError} />
          )}
          {screen === 'processing' && !showResult && (
            <ProcessingScreen job={job} phase={phase} error={error} onReset={handleReset} />
          )}
          {showResult && <ResultScreen job={job} onReset={handleReset} />}
        </div>
      </main>
      <AppFooter />

      {isMockMode && (
        <div className="fixed bottom-6 left-6 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-lg shadow-xl text-body-md z-50 flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary-fixed text-[18px]">science</span>
          Режим мока: backend недоступен, данные искусственные
        </div>
      )}
    </div>
  );
}

