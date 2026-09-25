# Implementation roadmap

0. Requirements & architecture — `docs/`
1. Foundation — Next.js, Drizzle, Vitest, Playwright, Electron
2. Database — `src/db/schema`, `drizzle/0000_init.sql`
3. Auth / RBAC / audit — `src/server/auth`, `audit.ts`
4. Clinical — patients, appointments, encounters, prescriptions
5. Pharmacy / billing / lab — transactional services
6. Dashboards, reports, settings, health, backup
7. Desktop + systemd + install script
8. QA: unit, integration, concurrency, backup/restore, e2e, security
