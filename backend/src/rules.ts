import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { Config } from './config';

@Injectable()
export class Rules {
  private readonly ids: Set<string>;
  constructor(config: Config) {
    const data = JSON.parse(readFileSync(config.rulesPath, 'utf8'));
    if (!Array.isArray(data.rules) || !data.rules.length || data.rules.some((r: any) =>
      typeof r.rule_id !== 'string' || !r.rule_id || typeof r.document !== 'string' || !r.document ||
      typeof r.clause !== 'string' || !r.clause) || (config.production && data.demo === true)) {
      throw new Error('Provide a non-demo local regulatory catalog with rule_id, document and clause');
    }
    this.ids = new Set(data.rules.map((r: any) => r.rule_id));
    if (this.ids.size !== data.rules.length) throw new Error('Duplicate rule_id');
  }
  has(id: string) { return this.ids.has(id); }
}
