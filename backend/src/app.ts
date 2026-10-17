import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MulterModule } from '@nestjs/platform-express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { access, mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { Config, ConfigurationError } from './config';
import { ApiKeyGuard } from './auth';
import { PublicController, SiteController } from './controllers';
import { Jobs } from './jobs';
import { MlClient } from './ml';
import { CapacityInterceptor, uploadOptions } from './upload';
import { Store } from './store';
import { Worker } from './worker';
import { Media } from './media';
import { HealthController } from './health';

export async function createApp() {
  const config = new Config();
  if (config.staticDir) {
    try { await access(join(config.staticDir, 'index.html')); }
    catch { throw new ConfigurationError('STATIC_DIR must contain a readable index.html; build the frontend or leave STATIC_DIR empty for API-only development'); }
  }
  const directory = join(config.dataDir, 'uploads');
  try { await mkdir(directory, { recursive: true }); }
  catch { throw new ConfigurationError('DATA_DIR must be writable so the backend can store uploads'); }
  @Module({
    imports: [MulterModule.register(uploadOptions(directory, config.maxUpload))],
    controllers: [PublicController, SiteController, HealthController],
    providers: [{ provide: Config, useValue: config }, Store, Worker, Media,
      Jobs, MlClient, ApiKeyGuard, CapacityInterceptor],
  })
  class AppModule {}
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], abortOnError: false });
  app.use((_: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'");
    next();
  });
  if (config.staticDir) {
    const root = config.staticDir;
    app.useStaticAssets(join(root, 'assets'), { prefix: '/assets/', index: false, dotfiles: 'deny' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (!['GET', 'HEAD'].includes(req.method) || /^\/(api|health|assets)(\/|$)/i.test(req.path) ||
          extname(req.path) || req.path.split('/').some(segment => segment.startsWith('.')) || !req.accepts('html')) return next();
      res.sendFile(join(root, 'index.html'));
    });
  }
  app.enableCors({
    origin: config.uiOrigin,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
  });
  app.enableShutdownHooks();
  return { app, config };
}

let serverlessApp: Promise<NestExpressApplication> | undefined;

async function initializeServerlessApp(): Promise<NestExpressApplication> {
  const { app } = await createApp();
  try {
    await app.init();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

export default async function handler(req: Request, res: Response): Promise<void> {
  let app: NestExpressApplication;
  try {
    serverlessApp ??= initializeServerlessApp().catch(error => {
      serverlessApp = undefined;
      throw error;
    });
    app = await serverlessApp;
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ message: 'Backend initialization failed' }));
    return;
  }
  app.getHttpAdapter().getInstance()(req, res);
}
