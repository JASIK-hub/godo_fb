# Video analysis backend

NestJS backend, Node.js 22+ (tested with Node 24). API source of truth: [OpenAPI](../contracts/public-api.yaml), [changes](../contracts/CHANGELOG.md).

## Local startup

From `backend/` run `npm ci`, copy `.env.example` to `.env`, and set independent random `API_KEY` and `UI_ACCESS_CODE` values (at least 32 characters). Set `UI_ORIGIN` to the exact frontend origin with no trailing slash. For a demo explicitly set `NODE_ENV=development` and `ML_STUB_ENABLED=true`. Run `npm run build` and `npm start`. PowerShell with restricted script execution can use `npm.cmd`.

`npm test` compiles TypeScript, validates OpenAPI and runs HTTP integration tests against a local fake ML server. Test credentials are synthetic.

## Public API

- `POST /api/v1/analyze`: `X-API-Key`, multipart `file`; returns HTTP 202 with `{ "job_id": "uuid" }` after upload, without waiting for ML.
- `GET /api/v1/jobs/{job_id}`: `X-API-Key`; returns `processing`, `done` with `verdict`, `violations`, `source`, or `failed` with a safe `error`.

MIME allowlist: MP4, WebM, QuickTime. This validates declared MIME, not media integrity; the ML service must validate/decode untrusted video in isolation. Upload limit defaults to 100 MiB. Empty/malformed uploads fail with 400, excessive size with 413, unsupported MIME with 415. Authorization runs before upload processing. A bounded reservation covers in-progress uploads and queued/running analyses. Exhausted capacity returns 503; retry with backoff.

Uploads use random disk filenames, never user filenames. Files are removed after success/failure and graceful shutdown. The OS temp directory contains per-process `godo-upload-*` directories; after a hard crash, clean abandoned directories through deployment temp-file retention. Configure ingress upload timeouts and request-rate limits.

## UI integration for Claude

1. Ask the user for the separately provisioned UI access code. `POST /api/v1/ui/session` with JSON `{ "access_code": "..." }` and `credentials: 'include'` creates a session. Do not persist the access code in browser storage or embed it in the bundle. Backend never returns the jury API key.
2. Upload with `POST /api/v1/ui/analyze`, FormData field `file`, `credentials: 'include'`. Let the browser set the multipart Content-Type and boundary.
3. Poll `GET /api/v1/ui/jobs/{job_id}` with `credentials: 'include'`, e.g. every second. Stop on `done`/`failed`. Show `verdict` (`pass`/`fail`), violation `code`, `message`, `timestamp_seconds`. Render ML strings as text. Visibly label `source: 'stub'` as demonstration data.
4. Logout: `DELETE /api/v1/ui/session`, `credentials: 'include'`. Handle 401 by requesting login; 404 means an unknown/expired job or a different session; 503 means capacity exhaustion.

All UI mutations require an Origin matching `UI_ORIGIN` (browsers set this automatically). If using a development reverse proxy, configure the browser-facing origin. Cookies are HttpOnly and SameSite=Strict, additionally Secure in production. Production frontend/backend must be same-site and HTTPS; same-origin reverse proxy is simplest. CORS permits only `UI_ORIGIN` with credentials. Session expiry is absolute, not sliding. Logging in again creates a new owner; its jobs are separate. Public API and UI jobs are also isolated. API-key requests belong to the single configured machine principal.

## ML integration and production

Set `ML_STUB_ENABLED=false` (default) and `ML_URL` to the full ML POST endpoint. Backend forwards multipart `file`, optionally with a separate `ML_API_KEY` in `X-API-Key`. No jury key or UI code is forwarded. ML must return JSON:

```json
{"verdict":"fail","violations":[{"code":"RULE_ID","message":"Description","timestamp_seconds":1.5}]}
```

`pass` requires an empty violations array; `fail` requires at least one violation. Codes/messages are nonempty (max 128/4096 characters), timestamps are finite and nonnegative. Maximum 1000 violations and 1 MiB response. Backend sets `source: 'ml'` itself. Non-2xx/network/timeout errors produce `ML_UNAVAILABLE`; invalid payloads produce `ML_INVALID_RESPONSE`. There is no automatic stub fallback and no automatic retry of ML requests. Timeout covers the response body as well as headers. Redirects are rejected to avoid forwarding credentials elsewhere.

For final deployment set `NODE_ENV=production`. Any environment other than exactly `development` or `test` is treated as production; a stub configuration prevents startup. Production requires HTTPS for UI_ORIGIN and ML_URL. Keep all credentials in backend environment/secret storage. `UI_ACCESS_CODE` must differ from `API_KEY`. Changing the UI code requires a restart, which also invalidates sessions.

This first version uses an in-process worker queue and memory job/session stores. **Run one instance**: restarts lose state, and jobs are not durable. For durable processing or horizontal scaling, replace these stores with a shared database/Redis and durable workers before deployment. Successful and failed jobs expire one hour after completion by default; sessions expire one hour after login. Defaults: 10 pending jobs including uploads, 2 ML workers, 1000 stored jobs, 1000 sessions, 120-second ML timeout. Login has a global per-process limit of 20 attempts/minute; use an ingress limiter for per-client controls. Environment limits are in `.env.example`.

Implementation references: [NestJS file uploads](https://docs.nestjs.com/techniques/file-upload), [NestJS authentication](https://docs.nestjs.com/security/authentication).
