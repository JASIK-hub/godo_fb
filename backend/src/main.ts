import { createApp } from './app';
import { ConfigurationError } from './config';

async function main() {
  const { app, config } = await createApp();
  await app.listen(config.port, '0.0.0.0');
}
void main().catch((error: unknown) => {
  // Only explicitly safe configuration messages may be logged, never values or arbitrary errors.
  console.error(error instanceof ConfigurationError ? error.message : 'Backend startup failed; check required environment configuration');
  process.exitCode = 1;
});
