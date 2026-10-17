import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { unlink } from 'node:fs/promises';
import { ApiKeyGuard, AuthRequest, COOKIE, SessionGuard, Sessions } from './auth';
import { Config } from './config';
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

@Controller('api/v1/ui')
export class UiController {
  constructor(private readonly jobs: Jobs, private readonly sessions: Sessions, private readonly config: Config) {}
  @Post('session')
  login(@Body() body: unknown, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.sessions.checkOrigin(req);
    const code = body && typeof body === 'object' ? (body as Record<string, unknown>).access_code : undefined;
    const { token, expires } = this.sessions.create(code);
    res.cookie(COOKIE, token, { httpOnly: true, secure: this.config.production, sameSite: 'strict', path: '/api/v1/ui', maxAge: this.config.sessionTtl });
    return { expires_at: new Date(expires).toISOString() };
  }
  @Delete('session')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    this.sessions.revoke(req.owner);
    res.clearCookie(COOKIE, { httpOnly: true, secure: this.config.production, sameSite: 'strict', path: '/api/v1/ui' });
  }
  @Post('analyze')
  @HttpCode(202)
  @UseGuards(SessionGuard)
  @UseInterceptors(CapacityInterceptor, FileInterceptor('file'))
  analyze(@UploadedFile() file: Express.Multer.File | undefined, @Req() req: UploadRequest) { return submit(this.jobs, file, req); }
  @Get('jobs/:job_id')
  @UseGuards(SessionGuard)
  get(@Param('job_id') id: string, @Req() req: AuthRequest) { return this.jobs.get(id, req.owner); }
}
