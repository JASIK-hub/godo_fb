import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { join } from 'node:path';
import { readdir, stat, unlink } from 'node:fs/promises';
import { Config } from './config';
import { Store, Record, FailureCode } from './store';
import { Media } from './media';
import { MlClient, MlError } from './ml';
import { Jobs } from './jobs';

@Injectable()
export class Worker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Worker.name);
  private readonly running = new Map<string, { abort: AbortController; promise: Promise<void> }>();
  private loop?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private cleaning?: Promise<void>;
  private stopping = false;
  healthy = true;
  constructor(private readonly config: Config, private readonly store: Store, private readonly media: Media,
    private readonly ml: MlClient, private readonly jobs: Jobs) {}

  onModuleInit() {
    this.loop = setInterval(() => this.tick(), 50).unref();
    this.cleanupTimer = setInterval(() => this.cleanup(), this.config.cleanupInterval).unref();
    this.cleanup();
  }
  private fail(row: Record, code: FailureCode, message: string) {
    this.store.finish(row, { job_id: row.id, status: 'failed', error: { code, message } });
  }
  private tick() {
    if (this.stopping || !this.healthy) return;
    try {
      const rows = this.store.pending().sort((a, b) => a.created - b.created);
      for (const row of rows) {
        if (Date.now() >= row.deadline - this.config.deadlineMargin) {
          this.fail(row, 'DEADLINE_EXCEEDED', 'Job deadline exceeded');
          this.running.get(row.id)?.abort.abort();
          continue;
        }
        if (this.running.has(row.id) || this.running.size >= this.config.concurrency) continue;
        const abort = new AbortController();
        const promise = this.run(row, abort.signal).catch(() => {
          this.healthy = false;
          this.jobs.closing = true;
          this.logger.error('Worker storage failure; readiness disabled');
        }).finally(() => this.running.delete(row.id));
        this.running.set(row.id, { abort, promise });
      }
    } catch { this.healthy = false; this.jobs.closing = true; this.logger.error('Worker storage failure; readiness disabled'); }
  }
  private async run(row: Record, stop: AbortSignal) {
    const signal = AbortSignal.any([stop, AbortSignal.timeout(Math.max(1, row.deadline - Date.now() - this.config.deadlineMargin))]);
    const path = join(this.config.dataDir, 'uploads', row.file);
    let decoding = true;
    try {
      const duration = await this.media.validate(path, signal);
      decoding = false;
      signal.throwIfAborted();
      const result = await this.ml.analyze(path, row.mime, duration, row.id, row.deadline, signal);
      signal.throwIfAborted();
      if (this.store.get(row.id)?.job.status === 'processing') this.store.finish(row, { job_id: row.id, status: 'done', ...result });
    } catch (error) {
      if (this.store.get(row.id)?.job.status !== 'processing') return;
      const code: FailureCode = this.stopping ? 'PROCESS_INTERRUPTED' : signal.aborted ? 'DEADLINE_EXCEEDED' :
        decoding ? 'INVALID_VIDEO' : error instanceof MlError ? error.code : 'ML_UNAVAILABLE';
      this.fail(row, code, code === 'INVALID_VIDEO' ? 'Video cannot be decoded or exceeds configured duration' :
        code === 'ML_INCONCLUSIVE' ? 'Visual evidence is insufficient; human review required' : 'Video analysis failed');
    }
  }
  private cleanup() {
    if (this.cleaning) return;
    this.cleaning = this.cleanFiles().catch(() => this.logger.warn('File retention cleanup failed; will retry'))
      .finally(() => { this.cleaning = undefined; });
  }
  private async cleanFiles() {
    this.store.prune();
    const active = new Set(this.store.pending().map(r => r.file));
    for (const id of this.running.keys()) { const row = this.store.get(id); if (row) active.add(row.file); }
    const dir = join(this.config.dataDir, 'uploads');
    for (const name of await readdir(dir)) {
      if (!/^[a-f0-9-]{36}$/.test(name) || active.has(name)) continue;
      const path = join(dir, name);
      const info = await stat(path);
      if (Date.now() - info.mtimeMs >= Math.max(this.config.fileTtl, this.config.uploadTimeout + 1000)) await unlink(path);
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    this.jobs.closing = true;
    clearInterval(this.loop);
    clearInterval(this.cleanupTimer);
    for (const task of this.running.values()) task.abort.abort();
    await Promise.all([...this.running.values()].map(t => t.promise));
    for (const row of this.store.pending()) this.fail(row, 'PROCESS_INTERRUPTED', 'Backend stopped');
    await this.cleaning;
  }
}
