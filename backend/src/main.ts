import { createApp } from './app';

async function main() {
  const { app, config } = await createApp();
  await app.listen(config.port, '0.0.0.0');
}
void main().catch(() => { console.error('Backend startup failed; check required environment configuration'); process.exitCode = 1; });
