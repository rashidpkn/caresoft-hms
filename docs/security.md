# Security

Hardening choices:

- Clients cannot open PostgreSQL.
- Argon2id passwords, generic login errors, account lockout.
- Server-side RBAC on every sensitive route.
- CSRF on cookie-authenticated mutations.
- Session revocation on disable/password reset.
- No Google font/CDN dependency (LAN/offline).
- `poweredByHeader: false`.
- Electron: `contextIsolation`, `sandbox`, no Node in the renderer, no DB URL in the bundle.
- Audit log has no modification API.
- Rate limit on login by IP (in-process; pair with reverse proxy if exposing beyond LAN).
- Path traversal blocked on restore filenames (`path.basename` + directory prefix check).
- Zod validation on write payloads.
- Integer money (no float totals).

CORS defaults to same-origin. Set `CORS_ORIGIN` only if a separate desktop origin is required.

Do not commit `.env`. Do not put `DATABASE_URL` in Electron.
