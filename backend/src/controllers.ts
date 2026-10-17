import { BadRequestException, Controller, Get, HttpCode, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { unlink } from 'node:fs/promises';
import { ApiKeyGuard, AuthRequest } from './auth';
import { Jobs } from './jobs';
import { CapacityInterceptor, UploadRequest } from './upload';

async function submit(jobs: Jobs, file: Express.Multer.File | undefined, req: UploadRequest) {
  if (!file || file.size === 0) {
    if (file) await unlink(file.path);
    throw new BadRequestException('A nonempty file is required');
  }
  let result;
  try { result = jobs.submit(file, req.owner, req.started!); }
  catch (error) { await unlink(file.path).catch(() => {}); throw error; }
  req.submitted = true;
  return result;
}

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class PublicController {
  constructor(private readonly jobs: Jobs) {}
  @Post('analyze')
  @HttpCode(202)
  @UseInterceptors(CapacityInterceptor, FileInterceptor('file'))
  analyze(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: UploadRequest) { return submit(this.jobs, file, req); }
  @Get('jobs/:job_id')
  get(@Param('job_id') id: string, @Req() req: AuthRequest) { return this.jobs.get(id, req.owner); }
}
