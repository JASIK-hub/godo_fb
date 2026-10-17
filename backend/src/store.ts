import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Config } from './config';
import type { Analysis } from './ml';

export type FailureCode = 'ML_UNAVAILABLE' | 'ML_INVALID_RESPONSE' | 'INVALID_VIDEO' | 'DEADLINE_EXCEEDED' | 'PROCESS_INTERRUPTED';
export type Job = { job_id: string } & ({ status: 'processing' } | ({ status: 'done' } & Analysis) |
  { status: 'failed'; error: { code: FailureCode; message: string } });
export type Record = { id: string; owner: string; file: string; mime: string; created: number; deadline: number; expires: number; job: Job };

@Injectable()
export class Store implements OnApplicationShutdown {
  private readonly db: DatabaseSync;
  constructor(private readonly config: Config) {
    mkdirSync(join(config.dataDir, 'uploads'), { recursive: true });
    this.db = new DatabaseSync(join(config.dataDir, 'jobs.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, file TEXT NOT NULL,
        mime TEXT NOT NULL, created INTEGER NOT NULL, deadline INTEGER NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL,
        status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS job_expiry ON jobs(expires);
      CREATE INDEX IF NOT EXISTS job_status ON jobs(status);`);
    // Never replay expensive inference after a crash: its outcome is unknown.
    for (const row of this.pending()) this.finish(row, {
      job_id: row.id, status: 'failed', error: { code: 'PROCESS_INTERRUPTED', message: 'Processing interrupted by backend restart' },
    });
  }
  all(): Record[] {
    return this.db.prepare('SELECT * FROM jobs').all().map(row => this.decode(row));
  }
  pending(): Record[] { return this.db.prepare("SELECT * FROM jobs WHERE status='processing'").all().map(row => this.decode(row)); }
  get(id: string): Record | undefined {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    return row ? this.decode(row) : undefined;
  }
  private decode(row: any): Record { const { payload, status, ...data } = row; return { ...data, job: JSON.parse(payload) }; }
  insert(row: Record) {
    this.db.prepare('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?)').run(row.id, row.owner, row.file, row.mime,
      row.created, row.deadline, row.expires, JSON.stringify(row.job), row.job.status);
  }
  finish(row: Record, job: Job) {
    this.db.prepare('UPDATE jobs SET payload=?, expires=?, status=? WHERE id=?').run(JSON.stringify(job), Date.now() + this.config.jobTtl, job.status, row.id);
  }
  prune() {
    this.db.prepare('DELETE FROM jobs WHERE expires < ?').run(Date.now());
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
  count(): number { return Number(this.db.prepare('SELECT count(*) n FROM jobs').get()!.n); }
  sessionPut(id: string, expires: number) { this.db.prepare('INSERT INTO sessions VALUES (?,?)').run(id, expires); }
  sessionGet(id: string): number { return Number(this.db.prepare('SELECT expires FROM sessions WHERE id=?').get(id)?.expires ?? 0); }
  sessionDelete(id: string) { this.db.prepare('DELETE FROM sessions WHERE id=?').run(id); }
  sessionCount(): number { return Number(this.db.prepare('SELECT count(*) n FROM sessions').get()!.n); }
  healthy() { this.db.prepare('SELECT 1').get(); return true; }
  onApplicationShutdown() { this.db.close(); }
}
