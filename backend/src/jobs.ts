import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { Config } from './config';
import { Store } from './store';

@Injectable()
export class Jobs {
  private uploading = 0;
  closing = false;
  constructor(private readonly config: Config, private readonly store: Store) {}
  reserve() {
    this.store.prune();
    const pending = this.store.pending().length + this.uploading;
    const worstCase = Math.ceil((pending + 1) / this.config.concurrency) *
      (this.config.mediaTimeout + this.config.timeout + this.config.deadlineMargin);
    if (this.closing || pending >= this.config.maxPending || this.store.count() + this.uploading >= this.config.maxJobs ||
        worstCase >= this.config.deadline) throw new ServiceUnavailableException('Job capacity or deadline budget exhausted');
    this.uploading++;
  }
  releaseUpload() { this.uploading--; }
  submit(file: Express.Multer.File, owner: string, started: number) {
    const id = randomUUID();
    this.store.insert({ id, owner, file: basename(file.path), mime: file.mimetype, created: started,
      deadline: started + this.config.deadline, expires: Number.MAX_SAFE_INTEGER, job: { job_id: id, status: 'processing' } });
    this.uploading--;
    return { job_id: id };
  }
  get(id: string, owner: string) {
    const row = this.store.get(id);
    if (!row || row.owner !== owner || row.expires <= Date.now()) throw new NotFoundException('Job not found');
    return row.job;
  }
}
