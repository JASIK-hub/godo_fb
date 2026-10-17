# API changelog

## 1.0.0 — 2026-10-17

- Initial contract: `POST /api/v1/analyze` (multipart `file`, HTTP 202, `job_id`) and `GET /api/v1/jobs/{job_id}`, both requiring `X-API-Key`.
- States: `processing`, `done`, `failed`; done includes `verdict` (`pass`/`fail`), `violations` and `source` (`ml`/`stub`). Failure exposes a safe error code and message.
- Separate UI login/logout at `/api/v1/ui/session` and cookie-authorized `/api/v1/ui/analyze`, `/api/v1/ui/jobs/{job_id}`. UI jobs are session-scoped. Public API key is never needed in the browser.
- UI mutations require the configured Origin. Login uses a separately provisioned access code. Cookies require `credentials: 'include'`; production requires HTTPS and same-site frontend/backend.
- Initial single-process implementation: jobs/sessions expire and do not survive restart. Default upload limit 100 MiB; MP4, WebM, QuickTime MIME types. Capacity errors return 503.
- Claude: poll the appropriate job endpoint; handle failures, expiry (404), 401 and upload errors; visibly mark `source: stub`. Do not embed either credential in the build.
