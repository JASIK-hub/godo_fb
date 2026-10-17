import { Controller, Get, HttpCode, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyGuard, AuthRequest } from './auth';
import { Jobs } from './jobs';
import { CapacityInterceptor, UploadRequest } from './upload';

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class PublicController {
  constructor(private readonly jobs: Jobs) {}
  @Post('analyze')
  @HttpCode(202)
  @UseInterceptors(CapacityInterceptor, FileInterceptor('file'))
  analyze(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: UploadRequest) { return this.jobs.acceptUpload(file, req, req.owner); }
  @Get('jobs/:job_id')
  get(@Param('job_id') id: string, @Req() req: AuthRequest) { return this.jobs.get(id, req.owner); }
}

// Same-process browser facade: no HTTP loopback or browser credentials.
@Controller('api/site')
export class SiteController {
  constructor(private readonly jobs: Jobs) {}
  @Post('analyze')
  @HttpCode(202)
  @UseInterceptors(CapacityInterceptor, FileInterceptor('file'))
  analyze(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: UploadRequest) {
    return this.jobs.acceptUpload(file, req, 'site');
  }
  @Get('jobs/:job_id')
  get(@Param('job_id') id: string) { return this.jobs.get(id, 'site'); }
}
