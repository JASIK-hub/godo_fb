# Godo — проверка видеозаписей

React UI, NestJS API с фоновым worker, локальный SQLite и отдельный ML-сервис из другого репозитория. [Фактическая архитектура и аудит](docs/architecture.md), [контракт](contracts/public-api.yaml), [требования к ML](docs/ml-integration.md).

**Текущие границы:** backend проверен на искусственных видео и локальном тестовом ML. Реальный ML, GPU, контейнерный запуск и работа без исходящего интернета здесь не проверены. Frontend ветки main требует [исправления интеграции](docs/frontend-handoff.md); пока нельзя считать браузерный путь готовым для жюри.

## Backend локально

Нужны Node 24.14+ ветки 24, FFmpeg и FFprobe в PATH (либо FFMPEG_PATH/FFPROBE_PATH). Из backend:

```sh
npm ci
cp .env.example .env
```

Задайте случайный JURY_API_KEY. Укажите точный UI_ORIGIN для CORS и локальный RULES_PATH. Для разработки можно скопировать `config/rules.example.json` в `config/rules.json` и явно включить `NODE_ENV=development`, `ML_STUB_ENABLED=true`. Пример справочника и заглушка запрещены в production. Заглушка всё равно проходит реальное декодирование видео.

Генерация ключа жюри:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Сохраните значение только в серверной `JURY_API_KEY` (backend/.env, либо корневая .env для Compose). Отсутствующий/пустой ключ останавливает запуск; старое имя `API_KEY` не поддерживается. Клиент передаёт `X-API-Key`. Примеры Bash, если JURY_API_KEY уже задана в окружении клиента:

```sh
curl --fail-with-body https://review.example.org/api/v1/analyze \
  -H "X-API-Key: $JURY_API_KEY" -F "file=@synthetic.mov;type=video/quicktime"
curl --fail-with-body https://review.example.org/api/v1/jobs/RETURNED_JOB_ID \
  -H "X-API-Key: $JURY_API_KEY"
```

Замените адрес и RETURNED_JOB_ID. Ключ нельзя встраивать во frontend. Способ доступа из браузера требует отдельного согласования; публичного обхода проверки ключа нет. Подробнее — [авторизация backend](backend/README.md#api).

```sh
npm run build
npm start
# Отдельно, на искусственных данных:
npm test
```

В PowerShell используйте `npm.cmd`, если запуск npm.ps1 запрещён. Тесты требуют установленный FFmpeg/FFprobe; не подменяют их моками. Тестовые временные каталоги удаляются. Ключи тестов синтетические, модель не вызывается.

## Контейнерный запуск

1. На этапе подготовки с интернетом установите Docker Engine/Compose, соберите приложение: `docker compose build backend`. Один Dockerfile собирает frontend и backend; NestJS раздаёт готовый UI и API. Compose читает обязательные env-поля, поэтому сначала скопируйте `deploy/.env.example` в корневой `.env` и заполните их. Backend npm-зависимости закреплены точными версиями и lockfile, frontend собирается через существующий lockfile. FFmpeg устанавливается при build, не при обработке. Для ручной сборки используйте корень репозитория: `docker build -f backend/Dockerfile -t godo-backend:local .`.
2. ML-разработчик должен предоставить готовый совместимый образ. Загрузите его заранее (`docker load` или предварительный pull), задайте ML_IMAGE с неизменяемым digest/локальным тегом, MODEL_WEIGHTS_DIR и RULES_FILE. Все файлы должны уже существовать. Не используйте синтетический пример справочника в production.
3. Сохраните итоговые образы через `docker save` и manifest digest/версий/контрольных сумм весов для повторного развёртывания без интернета. Версии base-image заданы тегами, apt использует репозиторий Debian: побитовая повторяемость нового build не заявляется. Для точного воспроизведения используйте сохранённые образы/digests.
4. UI_ORIGIN должен быть публичным HTTPS-origin без завершающего `/`. Настройте HTTPS ingress оператора на `127.0.0.1:8080` (HTTP_BIND/HTTP_PORT). Это обслуживает UI и `/api/` на одном origin; машинные endpoint сохраняют проверку ключа. Внешний TLS ingress не реализуется фиктивно в этом репозитории.
5. После staging запустите `docker compose config --quiet`, затем `docker compose up -d --no-build --pull never`. Backend хранит SQLite/видео в named volume backend-data. Не запускайте несколько backend-реплик на этом томе. ML слушает внутреннюю сеть, его GPU override должен быть предоставлен участником под реальное оборудование.
6. Проверяйте `docker compose ps`, `docker compose logs backend`, затем `docker compose exec backend node -e "fetch('http://127.0.0.1:3000/health/ready').then(async r=>{console.log(r.status);process.exit(r.ok?0:1)})"`. Readiness проверяет БД, worker, FFmpeg/FFprobe и ML health. Ошибка readiness не даёт автоматического права считать сервис готовым. `docker compose down` сохраняет данные; **не используйте `down -v`**, если результаты нужны.

Лимит размера проверяет backend через MAX_UPLOAD_BYTES. Размер/длительность — параметры эксплуатации, не выдуманные требования хакатона. Значения по умолчанию: одно задание, один worker, медиа 30 с, ML 180 с, общий дедлайн 300 с, запас 5 с. Увеличение очереди допускается только в пределах бюджета и измеренной ёмкости ML.

Отдельного UI-сервера нет: Compose публикует порт NestJS 3000 на `127.0.0.1:8080`; backend и ML остаются во внутренней сети. Для запуска без Docker предварительно соберите frontend и задайте backend `STATIC_DIR=../frontend/dist`. Если STATIC_DIR пуст, раздача UI отключена. При обновлении существующего Compose-развёртывания используйте `docker compose up -d --no-build --pull never --remove-orphans`, чтобы удалить старый UI-контейнер; постоянный том данных сохраняется.

## Проверка без исходящего интернета

**Проверка подготовлена, но не выполнена.** Причины: Docker daemon не запущен, реального ML-образа, весов и оборудования в текущем окружении нет.

На машине с подготовленными образами/весами:

```sh
docker compose up -d --no-build --pull never
node deploy/check-offline.mjs
```

Скрипт проверяет, что backend и ML подключены только к internal networks, из их network namespaces проверяет запрет исходящих соединений, создаёт синтетический MOV около 29 MiB и выполняет upload → polling → done с `source: ml` и временем ≤300 с. Никакие реальные видео или описания наружу не отправляются. Внутренняя сеть остаётся доступной; входящий доступ к опубликованному порту backend не отключается. Для жюри дополнительно проверьте HTTPS UI/API с внешнего устройства, холодный запуск ML без cache/download, обработку допустимых роликов и очередь под нагрузкой. Сохраните команды, конфигурацию, digest образов и обезличенные статусы/время; не публикуйте ключи или кадры.

HTTP-отмена не доказывает остановку GPU-вычисления. До подтверждения ML-разработчиком дедлайна/отмены нельзя заявлять строгую ёмкость всего решения или успешный анализ любого видео за 5 минут.
