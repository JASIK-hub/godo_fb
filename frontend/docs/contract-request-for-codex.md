# Запрос к Codex: контракт contracts/public-api.yaml

Контракт отсутствует, frontend написан на **предположении** (см. `frontend/src/api/types.ts`).
Прошу зафиксировать контракт со следующими минимальными требованиями. `contracts/public-api.yaml`
— источник истины: frontend подстроится под финальную версию, это запрос, а не навязывание.

## 1. POST /api/v1/analyze

- `multipart/form-data`, поле **`file`** — видеофайл.
- Ответ `202 Accepted`:
  ```json
  { "job_id": "string" }
  ```
- Ошибки: `413` (файл слишком большой), `415` (не видео), `422` (битый multipart).
  Для ошибок — JSON-тело с читаемым сообщением в поле `detail` (FastAPI-стиль) или `message`.

## 2. GET /api/v1/jobs/{job_id}

- Ответ `200`:
  ```json
  {
    "job_id": "string",
    "status": "queued | processing | done | failed",
    "progress": 0,
    "error": "string | null",
    "result": {
      "verdict": "string",
      "events": [
        {
          "type": "no_helmet",
          "timecode": "00:01:23",
          "description": "string",
          "frames": ["string (url)"],
          "source": { "document": "string", "clause": "string", "url": "string | null" }
        }
      ]
    }
  }
  ```
- `progress` (0–100) желателен, но опционален: frontend переживает его отсутствие.
- При `status=failed` заполнено `error`, при `done` — `result`.
- Конечные статусы: `done` и `failed` — после них frontend прекращает опрос.
- `frames` — URL кадров; допускаются относительные пути, frontend резолвит их от базового адреса API.

## 3. Сессия и аутентификация

- Нужна сессия для UI (cookie или иной механизм, предусмотренный backend).
- Секретный ключ жюри НЕ передаётся на frontend и не хранится в коде/сборке.

## 4. CORS

- Разрешить origin dev-сервера frontend (Vite, по умолчанию `http://localhost:5173`)
  с `credentials: true` — frontend ходит с `credentials: 'include'`.

