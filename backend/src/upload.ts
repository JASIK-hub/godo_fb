import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor, RequestTimeoutException, UnsupportedMediaTypeException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { Jobs } from './jobs';
import type { AuthRequest } from './auth';
import { Config } from './config';
import type { Response } from 'express';

export type UploadRequest = AuthRequest & { submitted?: boolean; started?: number };
export function uploadOptions(directory: string, limit: number) {
  return {
    storage: diskStorage({ destination: directory, filename: (_req, _file, cb) => cb(null, randomUUID()) }),
    limits: { fileSize: limit, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
      const valid = ['video/mp4', 'video/webm', 'video/quicktime'].includes(file.mimetype);
      cb(valid ? null : new UnsupportedMediaTypeException('Unsupported video MIME type'), valid);
    },
  };
}

@Injectable()
export class CapacityInterceptor implements NestInterceptor {
  constructor(private readonly jobs: Jobs, private readonly config: Config) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<UploadRequest>();
    if (!req.is('multipart/form-data')) throw new BadRequestException('Expected multipart/form-data');
    this.jobs.reserve();
    req.started = Date.now();
    const res = context.switchToHttp().getResponse<Response>();
    let timedOut = false;
    const timer = setTimeout(() => {
      // Send a readable error (including the CORS headers already set by
      // middleware) before closing the unfinished upload stream.
      if (!res.headersSent && !res.destroyed) {
        timedOut = true;
        res.once('finish', () => req.destroy());
        res.status(408).json({ statusCode: 408, error: 'Request Timeout', message: 'Video upload timed out' });
      } else {
        req.destroy();
      }
    }, this.config.uploadTimeout).unref();
    return next.handle().pipe(catchError(error => {
      // Multer reports the deliberate stream abort after the 408 was sent.
      if (timedOut) throw new RequestTimeoutException('Video upload timed out');
      throw error;
    }), finalize(() => {
      clearTimeout(timer);
      if (!req.submitted) this.jobs.releaseUpload();
    }));
  }
}
