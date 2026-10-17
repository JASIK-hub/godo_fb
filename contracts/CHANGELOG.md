# API changelog

## 1.1.0 — 2026-10-17

- Server credential configuration now requires `JURY_API_KEY` (no legacy `API_KEY` fallback); missing/empty configuration prevents startup. HTTP `X-API-Key`, public JSON and ML contract are unchanged. OpenAPI documents the server variable.
- Existing paths, statuses and result fields retained. Public `pass` with empty `violations` means no violations; internal ML `no_violation` is mapped to `pass` only after validation.
- Added failure codes `INVALID_VIDEO`, `DEADLINE_EXCEEDED`, `PROCESS_INTERRUPTED` to distinguish decoding, total deadline and restart failures. Consumers should display `error.message` and tolerate additional error codes.
- Jobs and sessions now persist locally. Incomplete jobs fail on restart without re-running ML. A 300-second maximum deadline includes queue wait and upload after backend admission.
- `violations[].code` identifies a rule in the local catalog; timestamps must fit the decoded duration. No frame/evidence fields have been added: their format requires a separate agreement with ML and frontend.

## 1.0.0 — 2026-10-17

- Initial contract: `POST /api/v1/analyze` (multipart `file`, HTTP 202, `job_id`) and `GET /api/v1/jobs/{job_id}`, both requiring `X-API-Key`.
- States: `processing`, `done`, `failed`; done includes `verdict` (`pass`/`fail`), `violations` and `source` (`ml`/`stub`). Failure exposes a safe error code and message.
- Separate UI login/logout at `/api/v1/ui/session` and cookie-authorized `/api/v1/ui/analyze`, `/api/v1/ui/jobs/{job_id}`. UI jobs are session-scoped. Public API key is never needed in the browser.
- UI mutations require the configured Origin. Login uses a separately provisioned access code. Cookies require `credentials: 'include'`; production requires HTTPS and same-site frontend/backend.
- Initial single-process implementation: jobs/sessions expire and do not survive restart. Default upload limit 100 MiB; MP4, WebM, QuickTime MIME types. Capacity errors return 503.
- Claude: poll the appropriate job endpoint; handle failures, expiry (404), 401 and upload errors; visibly mark `source: stub`. Do not embed either credential in the build.
