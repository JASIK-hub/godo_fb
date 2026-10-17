/**
 * Конфигурация приложения.
 *
 * Адрес backend берётся из переменных сборки (см. .env.example).
 * Секретный ключ жюри здесь не хранится и храниться не должен —
 * ключ проверяется только на API жюри; маршруты сайта не требуют авторизации.
 */
const env = import.meta.env;

export const config = {
  /** Базовый адрес backend API, без завершающего слэша. */
  apiBaseUrl: ((env.VITE_API_BASE_URL as string | undefined) ?? '').trim()
    .replace(/\/+$/, '').replace(/\/api(?:\/(?:site|v1))?$/, ''),

  /** true — работать на моковых ответах вместо реального API. */
  useMocks: (env.VITE_USE_MOCKS as string | undefined) === 'true',
};
