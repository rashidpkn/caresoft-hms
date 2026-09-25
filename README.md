# Synapse HMS

LAN-first Hospital Management System: Next.js + PostgreSQL + Drizzle + Electron.

Internet is not required. Workstations talk to the HMS API on the hospital LAN. PostgreSQL stays on the server.

## Quick start (development)

```bash
cp .env.example .env.local
# set DATABASE_URL and HMS_SECRET
npm install
npx drizzle-kit generate   # first time
npm run db:migrate
npm run db:seed:demo
npm run dev
```

Open http://127.0.0.1:3000/login

Demo password (development seed only): `Hospital_Demo_1`  
Admin: `admin` / `ChangeMe_Admin_1`

## Tests

```bash
npm test
```

## Production

See `docs/deployment.md`, `docs/backup-restore.md`, and `docs/architecture.md`.
