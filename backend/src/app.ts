import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { Config } from './config';
import { ApiKeyGuard, SessionGuard, Sessions } from './auth';
import { PublicController, UiController } from './controllers';
import { Jobs } from './jobs';
import { MlClient } from './ml';
import { CapacityInterceptor, uploadOptions } from './upload';
import { Store } from './store';
import { Worker } from './worker';
import { Media } from './media';
import { Rules } from './rules';
import { HealthController } from './health';

export async function createApp() {
  const config = new Config();
  const directory = join(config.dataDir, 'uploads');
  await mkdir(directory, { recursive: true });
  @Module({
    imports: [MulterModule.register(uploadOptions(directory, config.maxUpload))],
    controllers: [PublicController, UiController, HealthController],
    providers: [{ provide: Config, useValue: config }, Store, Worker, Media, Rules,
      Jobs, MlClient, Sessions, ApiKeyGuard, SessionGuard, CapacityInterceptor],
  })
  class AppModule {}
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  app.use((_: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.enableCors({ origin: config.uiOrigin, credentials: true, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Content-Type'] });
  app.enableShutdownHooks();
  return { app, config };
}
