import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { Config } from './config';

export class MediaError extends Error {}

function execute(binary: string, args: string[], signal: AbortSignal, tool: 'FFmpeg' | 'FFprobe'): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { signal, windowsHide: true, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' },
      (error, stdout) => {
        if (!error) return resolve(stdout);
        const code = (error as NodeJS.ErrnoException).code;
        const message = signal.aborted ? 'Video validation timed out; check MEDIA_TIMEOUT_MS and server capacity' :
          code === 'ENOENT' ? `${tool} executable not found; check ${tool === 'FFmpeg' ? 'FFMPEG_PATH' : 'FFPROBE_PATH'} on the backend` :
          code === 'EACCES' || code === 'EPERM' ? `${tool} could not start: access denied on the backend` :
          tool === 'FFprobe' ? 'FFprobe could not read the video container' : 'FFmpeg could not decode the video stream';
        reject(new MediaError(message));
      });
  });
}

@Injectable()
export class Media {
  constructor(private readonly config: Config) {}
  async ready() {
    const signal = AbortSignal.timeout(3000);
    await Promise.all([execute(this.config.ffmpeg, ['-version'], signal, 'FFmpeg'), execute(this.config.ffprobe, ['-version'], signal, 'FFprobe')]);
  }
  async validate(path: string, signal: AbortSignal): Promise<number> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(this.config.mediaTimeout)]);
    const input = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,matroska,webm'];
    const probe = JSON.parse(await execute(this.config.ffprobe, ['-v', 'error', ...input, '-show_entries',
      'format=duration:stream=codec_type,width,height', '-of', 'json', path], bounded, 'FFprobe'));
    const duration = Number(probe.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new MediaError('Video duration is missing or invalid');
    if (duration > this.config.maxDuration) throw new MediaError(`Video exceeds the maximum duration of ${this.config.maxDuration} seconds`);
    if (!probe.streams?.some((s: any) => s.codec_type === 'video' && s.width > 0 && s.height > 0)) {
      throw new MediaError('File does not contain a valid video stream');
    }
    // Decode the complete video stream, not merely its container header or extension.
    await execute(this.config.ffmpeg, ['-v', 'error', '-xerror', '-nostdin', ...input, '-threads', '1',
      '-i', path, '-map', '0:v:0', '-an', '-sn', '-threads', '1', '-f', 'null', '-'], bounded, 'FFmpeg');
    return duration;
  }
}
