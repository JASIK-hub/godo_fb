# Подключение frontend к серверным маршрутам сайта

Frontend — React/Vite. Backend — NestJS с отдельными точками входа для Node/Docker и HTTP Function.

По [документации Vercel](https://vercel.com/docs/functions/limitations), проверенной 17.10.2026, тело запроса/ответа Function ограничено 4,5 МБ. MOV около 29 МБ получит 413 FUNCTION_PAYLOAD_TOO_LARGE. Увеличение лимита парсера этого не исправляет.

Для загрузки видео около 29 МБ frontend должен обращаться к постоянному backend без Vercel Function на пути загрузки.

При Root Directory `backend` Vercel загружает `src/app.ts`. В нём теперь есть `export default handler(req, res)`: он лениво создаёт NestJS через `createApp()`, вызывает `app.init()` и передаёт запрос Express-адаптеру. Параллельные запросы разделяют одну инициализацию. Ошибка инициализации возвращает безопасный 503 без env и секретов. Отдельный запуск через `src/main.ts` / `node dist/main.js` сохранён.

Это исправляет отсутствующий default export, но не адаптирует хранилище и worker под serverless: нужны доступный для записи DATA_DIR, FFmpeg/FFprobe и действующая конфигурация ML; локальный SQLite и фоновый worker не гарантируют сохранность заданий между экземплярами Function. `/tmp` является временным хранилищем, а не постоянным томом. Ограничение тела запроса 4,5 МБ сохраняется. Исправление экспорта проверено локально, деплой на Vercel не проверен.

Для backend Root Directory остаётся `backend`, build — `npm run build`; frontend публикуется отдельным проектом. `JURY_API_KEY` хранится только в серверном env.

## Маршруты и общий сервис

- POST /api/site/analyze — загрузка multipart с полем file без ключа пользователя; ответ 202 с job_id.
- GET /api/site/jobs/:job_id — статус и результат без ключа пользователя.
- POST /api/v1/analyze и GET /api/v1/jobs/:job_id — API жюри; ApiKeyGuard требует X-API-Key, соответствующий серверной JURY_API_KEY.

SiteController и PublicController вызывают общий сервис Jobs (acceptUpload/get), используют одинаковые CapacityInterceptor и FileInterceptor. HTTP-запросов сервера к самому себе нет, добавление заголовка между контроллерами не требуется. Схемы ответов, ошибки, очередь, SQLite, FFmpeg и ML-контракт сохранены. Задания сайта сохраняются с owner=site, задания жюри — owner=api; Jobs.get проверяет владельца. Чужой job_id возвращает 404 даже с ключом жюри на site-маршруте. Старые записи owner=api не переименовываются: сайт к ним доступа не получает. Пользовательского входа, cookies и сессий нет. CORS ограничивает разрешённый браузерный origin, но не является авторизацией.

Frontend адаптирует verdict/violations и error.message для существующих экранов только после получения ответа. Не создаёт вымышленных кадров/документов, отмечает source: stub как демонстрационный результат.

## Настройки

Backend:

- JURY_API_KEY — секрет только в серверном env; во frontend и Vercel build env не задавать.
- UI_ORIGIN=https://your-site.vercel.app — точный origin frontend без завершающего слэша; для custom domain указать его.
- MAX_UPLOAD_BYTES=104857600 — существующий лимит 100 MiB.
- UPLOAD_TIMEOUT_MS=120000 — таймаут загрузки в Compose.
- Остальные настройки ML, DATA_DIR и FFmpeg сохранить.

Frontend на Vercel: Root Directory frontend, build npm run build, output dist. VITE_API_BASE_URL=https://api.example.org (origin backend), VITE_USE_MOCKS=false. После изменения VITE-переменных пересобрать frontend. Конечные /api, /api/site и /api/v1 в базовом URL нормализуются, поэтому /api не дублируется. Локально использовать http://localhost:3000; для UI, раздаваемого самим NestJS, оставить VITE_API_BASE_URL пустым.

Существующий HTTPS ingress backend должен пропускать /api/site/* и /api/v1/* и принимать multipart указанного размера. Например, для Nginx: client_max_body_size 101m (100 MiB плюс multipart), proxy_request_buffering off, proxy_read_timeout 125s, proxy_send_timeout 125s, client_body_timeout 125s. Не логировать ключи и тела запросов. Конфигурация реального ingress в репозитории отсутствует.

## Проверки

Из backend: npm test. Синтетический MOV около 29 MiB загружается через /api/site/analyze без ключа, проходит FFmpeg и тестовый ML; результат читается только через site; доступ между областями site и v1 проверяется на 404. Проверяются 401 без/с неверным ключом, авторизация верным ключом, идентичные ответы/ошибки и отсутствие ключа в ответах.

Для проверки реального HTTPS-размещения: задать в окружении оператора PROXY_ORIGIN, UI_ORIGIN, JURY_API_KEY и выполнить node deploy/check-proxy.mjs с установленным FFmpeg. Скрипт генерирует синтетический MOV, проверяет авторизацию API, загрузку без ключа через /api/site/*, polling и изоляцию site-задания от API жюри. Ключи/тела ответов не выводит.

В браузере на Vercel отдельно проверить upload → processing → результат: запрос идёт непосредственно на backend без X-API-Key и cookies. Проверить assets развёрнутой сборки на отсутствие секретов.

Адреса и доступ к реальному деплою не предоставлены: реальный HTTPS deployment и браузерный E2E не проверены. Локальная production-сборка проверена с синтетическим серверным секретом: его значение, JURY_API_KEY и X-API-Key отсутствуют в assets.
