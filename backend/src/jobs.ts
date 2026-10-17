import { Injectable, Logger, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { Config } from './config';
import { Analysis, MlClient, MlError } from './ml';

type Job = { job_id: string } & ({ status: 'processing' } | ({ status: 'done' } & Analysis) | { status: 'failed'; error: { code: string; message: string } });
type Entry = { owner: string; job: Job; expires: number };
type Task = { id: string; path: string; mime: string };

@Injectable()
export class Jobs implements OnModuleDestroy {
  private readonly logger = new Logger(Jobs.name);
  private readonly entries = new Map<string, Entry>();
  private readonly queue: Task[] = [];
  private readonly running = new Set<Promise<void>>();
  private pending = 0;
  private uploading = 0;
  private closing = false;
  private readonly sweep = setInterval(() => this.prune(), 60000).unref();
  constructor(private readonly config: Config, private readonly ml: MlClient) {}

  // Reserve before reading upload bodies; bounds concurrent uploads and queued files.
  reserve() {
    this.prune();
    if (this.closing || this.pending >= this.config.maxPending || this.entries.size + this.uploading >= this.config.maxJobs) {
      throw new ServiceUnavailableException('Job capacity exhausted');
    }
    this.pending++;
    this.uploading++;
  }
  releaseUpload() { this.pending--; this.uploading--; }

  submit(file: Express.Multer.File, owner: string) {
    const id = randomUUID();
    this.entries.set(id, { owner, job: { job_id: id, status: 'processing' }, expires: Infinity });
    this.uploading--;
    this.queue.push({ id, path: file.path, mime: file.mimetype });
    setImmediate(() => this.pump());
    return { job_id: id };
  }

  get(id: string, owner: string) {
    this.prune();
    const entry = this.entries.get(id);
    if (!entry || entry.owner !== owner) throw new NotFoundException('Job not found');
    return entry.job;
  }

  private prune() {
    for (const [id, entry] of this.entries) if (entry.expires <= Date.now()) this.entries.delete(id);
  }

  private pump() {
    while (!this.closing && this.running.size < this.config.concurrency && this.queue.length) {
      const task = this.queue.shift()!;
      const promise = this.run(task);
      this.running.add(promise);
      void promise.finally(() => { this.running.delete(promise); this.pump(); });
    }
  }

  private async run(task: Task) {
    const entry = this.entries.get(task.id)!;
    try {
      const result = await this.ml.analyze(task.path, task.mime);
      entry.job = { job_id: task.id, status: 'done', ...result };
    } catch (error) {
      const code = error instanceof MlError ? error.code : 'ML_UNAVAILABLE';
      entry.job = { job_id: task.id, status: 'failed', error: { code, message: 'Video analysis failed' } };
      this.logger.warn(`Job ${task.id}: ${code}`);
    } finally {
      entry.expires = Date.now() + this.config.jobTtl;
      await unlink(task.path).catch(() => this.logger.warn(`Could not remove upload for ${task.id}`));
      this.pending--;
    }
  }

  async onModuleDestroy() {
    this.closing = true;
    clearInterval(this.sweep);
    await Promise.all(this.running);
    for (const task of this.queue.splice(0)) { await unlink(task.path).catch(() => {}); this.pending--; }
  }
}
