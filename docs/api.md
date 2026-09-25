# API

All application JSON APIs live under `/api/...` and return:

```json
{ "ok": true, "data": {} }
```

or

```json
{ "ok": false, "error": { "code": "forbidden", "message": "..." } }
```

Clients must send cookies. Mutating calls need `X-CSRF-Token` from `GET /api/auth/me`.

Stack traces are never returned. Database errors are mapped to user-facing messages.

Key routes:

- `POST /api/auth/login` `POST /api/auth/logout` `GET /api/auth/me`
- `GET|POST /api/patients` `GET|PATCH /api/patients/:id`
- `GET|POST /api/appointments` `POST /api/appointments/checkin`
- `POST /api/encounters` `PATCH /api/encounters/:id` `POST /api/encounters/finalize`
- `GET|POST /api/pharmacy/*` including `sales`, `purchases`, `adjust`
- `GET|POST /api/billing/*`
- `GET|POST /api/lab/*`
- `GET /api/dashboard` `GET /api/reports/*` `GET /api/audit`
- `GET /api/health` `GET /api/health/public` `GET|POST /api/backups`

The router is `src/server/api-router.ts`. Add new endpoints there rather than scattering business logic in React.
