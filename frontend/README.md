# Frontend «GoDo» — анализ видео с производства

React + TypeScript + Vite + Tailwind CSS.

## Запуск

```bash
npm install
npm run dev      # http://localhost:5173
```

Адрес backend и режим мока настраиваются в `.env.local` (шаблон — `.env.example`):

```
VITE_API_BASE_URL=http://localhost:3000
VITE_USE_MOCKS=true|false
```

## Экраны

- **Загрузка** — выбор/перетаскивание видео, валидация (только видео, до 500 МБ),
  POST /api/site/analyze (поле `file`).
- **Обработка** — опрос GET /api/site/jobs/{job_id} раз в 2 с; остановка при `done`/`failed`
  и при уходе со страницы. Прогресс-бар из поля `progress` (если backend отдаёт).
- **Результат** — verdict и все события: тип, таймкод, описание, кадры (галерея),
  нормативный источник. При `failed`/сетевой ошибке показывается ошибка,
  а не «нарушений нет».

## Моки

Контракт описан в `contracts/public-api.yaml`. По умолчанию моки выключены. При явном `VITE_USE_MOCKS=true`
работает имитация (10 с «обработки», примеры событий, имитация сбоя — если файл пустой).
Бейдж вверху страницы показывает режим мока. Моки отделены: `src/api/mock.ts`,
выбор — в `src/api/index.ts`.

Запрос на контракт для Codex: `docs/contract-request-for-codex.md`.
