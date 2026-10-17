import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor, UnsupportedMediaTypeException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Jobs } from './jobs';
import type { AuthRequest } from './auth';

export type UploadRequest = AuthRequest & { submitted?: boolean };
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
  constructor(private readonly jobs: Jobs) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<UploadRequest>();
    if (!req.is('multipart/form-data')) throw new BadRequestException('Expected multipart/form-data');
    this.jobs.reserve();
    return next.handle().pipe(finalize(() => { if (!req.submitted) this.jobs.releaseUpload(); }));
  }
}
