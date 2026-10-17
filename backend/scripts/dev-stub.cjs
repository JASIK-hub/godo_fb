// Explicit opt-in local demo. Never enable this mode automatically on ML errors.
if (process.env.NODE_ENV && !['development', 'test'].includes(process.env.NODE_ENV)) {
  console.error('dev:stub is forbidden outside development/test. Use the real ML service for deployment.');
  process.exitCode = 1;
} else {
  process.env.NODE_ENV = 'development';
  process.env.ML_STUB_ENABLED = 'true';
  console.warn('Explicit local demo: ML stub. No model inference is performed. JURY_API_KEY is still required.');
  require('../dist/main');
}
