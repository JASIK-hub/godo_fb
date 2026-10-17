import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { Config } from './config';
import { ApiKeyGuard, SessionGuard, Sessions } from './auth';
import { PublicController, UiController } from './controllers';
import { Jobs } from './jobs';
import { MlClient } from './ml';
import { CapacityInterceptor, uploadOptions } from './upload';

export async function createApp() {
  const config = new Config();
  const directory = await mkdtemp(join(tmpdir(), 'godo-upload-'));
  @Module({
    imports: [MulterModule.register(uploadOptions(directory, config.maxUpload))],
    controllers: [PublicController, UiController],
    providers: [{ provide: Config, useValue: config }, Jobs, MlClient, Sessions, ApiKeyGuard, SessionGuard, CapacityInterceptor,
      { provide: 'UploadCleanup', useValue: { onApplicationShutdown: () => rm(directory, { recursive: true, force: true }) } }],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.use((_: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.enableCors({ origin: config.uiOrigin, credentials: true, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Content-Type'] });
  app.enableShutdownHooks();
  return { app, config };
}
