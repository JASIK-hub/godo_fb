// Vercel's NestJS entrypoint detector requires a direct framework import here.
import '@nestjs/core';
import { createApp } from './app';
import { ConfigurationError } from './config';

async function main() {
  const { app, config } = await createApp();
  try {
    await app.listen(config.port, '0.0.0.0');
    console.log(`Backend listening on port ${config.port}; ML mode: ${config.stub ? 'STUB (demo only)' : 'service'}`);
  } catch (error) {
    await app.close();
    if ((error as NodeJS.ErrnoException)?.code === 'EADDRINUSE') throw new ConfigurationError('PORT is already in use; stop the other process or choose another PORT');
    if ((error as NodeJS.ErrnoException)?.code === 'EACCES') throw new ConfigurationError('Permission denied when binding PORT; choose an available unprivileged port');
    throw error;
  }
}
void main().catch((error: unknown) => {
  // Only explicitly safe configuration messages may be logged, never values or arbitrary errors.
  console.error(error instanceof ConfigurationError ? error.message : 'Backend startup failed; check required environment configuration');
  process.exitCode = 1;
});
