import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { Config } from './config';

function execute(binary: string, args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { signal, windowsHide: true, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' },
      (error, stdout) => error ? reject(new Error('Media validation failed')) : resolve(stdout));
  });
}

@Injectable()
export class Media {
  constructor(private readonly config: Config) {}
  async ready() {
    const signal = AbortSignal.timeout(3000);
    await Promise.all([execute(this.config.ffmpeg, ['-version'], signal), execute(this.config.ffprobe, ['-version'], signal)]);
  }
  async validate(path: string, signal: AbortSignal): Promise<number> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.config.mediaTimeout)]);
    const input = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm'];
    const probe = JSON.parse(await execute(this.config.ffprobe, ['-v', 'error', ...input, '-show_entries',
      'format=duration:stream=codec_type,width,height', '-of', 'json', path], bounded));
    const duration = Number(probe.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > this.config.maxDuration ||
        !probe.streams?.some((s: any) => s.codec_type === 'video' && s.width > 0 && s.height > 0)) throw new Error('Invalid video');
    // Decode the complete video stream, not merely its container header or extension.
    await execute(this.config.ffmpeg, ['-v', 'error', '-xerror', '-nostdin', ...input, '-threads', '1',
      '-i', path, '-map', '0:v:0', '-an', '-sn', '-threads', '1', '-f', 'null', '-'], bounded);
    return duration;
  }
}
