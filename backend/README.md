# Backend

NestJS API + worker внутри одного процесса, локальный SQLite WAL и дисковые видео. Node 24.14+ ветки 24, FFmpeg/FFprobe обязательны.

NestJS также раздаёт production-сборку UI: задайте STATIC_DIR на каталог frontend/dist. В Docker сборка уже лежит в /app/public. Отдельный сервер статики не требуется; API и UI используют один порт. Если STATIC_DIR не задан, backend обслуживает только API. Dockerfile собирается с контекстом корня репозитория.

Основные инструкции: [корневой README](../README.md), [архитектура и результаты аудита](../docs/architecture.md), [требования к ML](../docs/ml-integration.md), [контракт](../contracts/public-api.yaml).

## Запуск

Из backend: `npm ci`, скопировать `.env.example` в `.env`, задать случайный `JURY_API_KEY`, точный `UI_ORIGIN` для CORS и внутренние `ML_SERVICE_URL`/`ML_HEALTH_URL`. Затем `npm run build` и `npm start`. Нормативный справочник хранится только в ML; backend не использует `RULES_PATH`.

Для заглушки требуются явно заданные `NODE_ENV=development` (или test) и `ML_STUB_ENABLED=true`. Production откажется запускаться с заглушкой. Никаких fallback на заглушку при сбоях ML.

Если ML пока отсутствует, используйте `npm run dev:stub`. Команда читает `.env` и явно включает demo-заглушку, не переписывая `.env`. `JURY_API_KEY` и корректный `UI_ORIGIN` по-прежнему обязательны; команда запрещена при production-окружении. Обычный `npm run dev` не меняет режим ML.

После успешного запуска появится `Backend listening on port ...`. `GET /health/live` подтверждает работу API. Для загрузки и декодирования видео нужны FFmpeg/FFprobe: установите их в PATH или задайте пути FFMPEG_PATH/FFPROBE_PATH. Без этих бинарников API может запуститься, но `/health/ready` вернёт 503 и обработка видео не будет работоспособной. Для API без собранного UI оставьте STATIC_DIR пустым.

Ошибки запуска называют проблемную настройку: UI_ORIGIN, ML_SERVICE_URL, STATIC_DIR, DATA_DIR или PORT. Значения ключей не выводятся.

ML отвечает за существование нормативных правил. Backend проверяет структуру ответа и таймкоды, сохраняет результат в SQLite и возвращает интерфейсу без изменения публичной схемы. Нормативный источник передаётся ML в `violations[].message` вместе с описанием; `code` содержит идентификатор правила. Отдельных полей document/clause в текущем ответе ML нет. `source: ml | stub` обозначает происхождение анализа, а не нормативный документ.

## API

CORS разрешает origin из `UI_ORIGIN`, методы GET/POST/OPTIONS и заголовки Content-Type/X-API-Key. Для локального Vite задайте `UI_ORIGIN=http://localhost:5173` без завершающего `/`, затем перезапустите backend. Адрес API во frontend должен совпадать с портом backend: при PORT=3000 это `http://localhost:3000`. CORS не отменяет обязательный X-API-Key; ключ жюри нельзя помещать в frontend-сборку. Способ браузерной авторизации по-прежнему требует согласования.

Ключ жюри хранится только на сервере в `JURY_API_KEY`. Сгенерируйте его локально:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Установите полученное значение в `JURY_API_KEY` в backend/.env или в окружении сервера (для Compose — в корневом .env). Не коммитьте .env и не используйте placeholder из .env.example в развёртывании. Переменная `API_KEY` больше не используется и не служит fallback. Без JURY_API_KEY, с пустым или пробельным значением процесс завершается с кодом 1 и сообщением `JURY_API_KEY must be set and non-empty`.

Примеры для Bash: переменная JURY_API_KEY уже установлена в окружении API-клиента; BASE_URL указывает на ваше развёртывание. Реальный секрет в примеры не подставляйте и не публикуйте команды с раскрытыми значениями.

```sh
BASE_URL=https://review.example.org
curl --fail-with-body -X POST "$BASE_URL/api/v1/analyze" \
  -H "X-API-Key: $JURY_API_KEY" \
  -F "file=@synthetic.mov;type=video/quicktime"

# Используйте job_id из ответа 202:
JOB_ID=replace_with_returned_job_id
curl --fail-with-body "$BASE_URL/api/v1/jobs/$JOB_ID" \
  -H "X-API-Key: $JURY_API_KEY"
```

Для PowerShell используйте `curl.exe` и `$env:JURY_API_KEY`. Заголовок нечувствителен к регистру; отсутствие, пустое значение или неверный ключ дают 401 до обработки multipart. Корректный ключ разрешает дальнейшую валидацию: например, отсутствующий файл даёт 400, неизвестный job_id — 404.

В Swagger/OpenAPI схема `ApiKey` задана как `type: apiKey`, `in: header`, `name: X-API-Key` и защищает оба публичных маршрута. Источник схемы — contracts/public-api.yaml; отдельный Swagger UI в backend не установлен.

Текущий frontend вызывает защищённые endpoint без ключа и получает 401. Способ доступа из браузера требует отдельного согласования; новый механизм не добавлен. Не добавляйте JURY_API_KEY в VITE-переменные, код или assets. Раздача UI не предоставляет доступ к API без ключа.

- `POST /api/v1/analyze`: X-API-Key, multipart file, 202 с job_id после записи файла и состояния. Декодирование/ML идут в worker.
- `GET /api/v1/jobs/{job_id}`: X-API-Key; processing/done/failed. Готовый результат содержит verdict pass/fail, violations и source.
- `GET /health/live`, `GET /health/ready`: состояние процесса и зависимостей; тела не содержат секретов/пользовательских данных. Compose публикует backend на loopback:8080 вместе с UI.

UI_ORIGIN используется существующей настройкой CORS; разрешённый Origin не заменяет проверку X-API-Key. Авторизация API выполняется только через ключ жюри.

## Надёжность и данные

DATA_DIR содержит jobs.sqlite и uploads. Запускать ровно один backend с этим каталогом. На старте незавершённые задания становятся failed/PROCESS_INTERRUPTED, не перезапускаются. Общий дедлайн не превышает 300 секунд, включая очередь и загрузку после резервирования. Перегрузка возвращает 503. Это предел до конечного статуса, не измеренная гарантия успешного анализа любой записи реальной моделью.

FFprobe и FFmpeg валидируют длительность и декодируют весь видеопоток. MAX_UPLOAD_BYTES/MAX_VIDEO_DURATION_SECONDS задают эксплуатационные пределы. Оба бинарника можно задать через FFMPEG_PATH/FFPROBE_PATH. ML обязан сам безопасно декодировать недоверенные данные, учитывать X-Deadline-At и останавливать вычисления при отмене; закрытие HTTP со стороны backend не гарантирует остановку GPU.

Файлы удаляются по VIDEO_RETENTION_MS с периодом CLEANUP_INTERVAL_MS; активные файлы исключены, orphan не удаляется раньше UPLOAD_TIMEOUT_MS+1000. Результаты удаляются по JOB_TTL_MS. Не удаляйте persistent volume, если данные нужны.

ML получает только файл, отдельный ML_API_KEY (если настроен), UUID и дедлайн. Внешние редиректы запрещены. Ответ ограничен 1 MiB/1000 нарушениями; code проверяется как непустая строка, optional rule_id должен совпадать с code; timestamp_seconds — внутри длительности. Внутренний no_violation преобразуется в pass только с пустым violations. Непустые frames пока отклоняются: формата доказательств в публичном API нет.

## Проверки

`npm test` собирает TypeScript, валидирует OpenAPI, генерирует синтетические MOV через FFmpeg и проверяет HTTP-поток, сбои, лимиты, локальное сохранение/рестарт. Установите FFmpeg/FFprobe до тестов. Реальные пользовательские видео не используются. Docker/offline проверка описана в корневом README и не выполнена без ML-образа и работающего Docker daemon.
