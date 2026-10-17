import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Store } from './store';
import { Worker } from './worker';
import { Media } from './media';
import { Config } from './config';

@Controller('health')
export class HealthController {
  constructor(private readonly store: Store, private readonly worker: Worker, private readonly media: Media, private readonly config: Config) {}
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') async ready() {
    try {
      this.store.healthy();
      if (!this.worker.healthy) throw new Error();
      await this.media.ready();
      if (!this.config.stub) {
        if (!this.config.mlHealthUrl) throw new Error();
        const response = await fetch(this.config.mlHealthUrl, { signal: AbortSignal.timeout(2000), redirect: 'error' });
        await response.body?.cancel();
        if (!response.ok) throw new Error();
      }
      return { status: 'ready' };
    } catch { throw new ServiceUnavailableException('Dependencies not ready'); }
  }
}
