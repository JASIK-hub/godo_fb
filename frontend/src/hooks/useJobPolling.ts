/**
 * Опрос GET /api/site/jobs/{job_id} раз в 2 секунды.
 *
 * Останавливается при status done|failed и при размонтировании
 * (уход со страницы). Сетевые сбои переживаем: до 3 подряд
 * неудачных опросов, затем показываем ошибку и останавливаемся.
 */
import { useEffect, useRef, useState } from 'react';
import { getJob } from '../api';
import type { Job } from '../api';

/** Интервал опроса задачи, мс. */
const POLL_INTERVAL_MS = 2000;
/** Сколько подряд неудачных опросов переживаем, прежде чем сдаться. */
const MAX_CONSECUTIVE_FAILURES = 3;

export type JobPhase = 'polling' | 'done' | 'failed' | 'error';

export interface UseJobPollingResult {
  job: Job | null;
  phase: JobPhase;
  error: string | null;
}

export function useJobPolling(jobId: string | null): UseJobPollingResult {
  const [job, setJob] = useState<Job | null>(null);
  const [phase, setPhase] = useState<JobPhase>('polling');
  const [error, setError] = useState<string | null>(null);
  const failuresRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!jobId) {
      setPhase('error');
      setError('Нет идентификатора задачи');
      return;
    }

    cancelledRef.current = false;
    failuresRef.current = 0;
    setJob(null);
    setError(null);
    setPhase('polling');

    let timer: number | undefined;

    const poll = async () => {
      if (cancelledRef.current) return;
      try {
        const next = await getJob(jobId);
        if (cancelledRef.current) return;
        failuresRef.current = 0;
        setJob(next);
        if (next.status === 'done' || next.status === 'failed') {
          setPhase(next.status); // опрос остановлен: done или failed
          return;
        }
      } catch (err) {
        if (cancelledRef.current) return;
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          setError(err instanceof Error ? err.message : 'Не удалось получить статус задачи');
          setPhase('error');
          return;
        }
      }
      timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();

    return () => {
      cancelledRef.current = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId]);

  return { job, phase, error };
}
