# Synapse HMS — Final report

## Project status

Synapse HMS is implemented as a LAN-first, multi-user Hospital Management System: Next.js 15 application server, PostgreSQL, Drizzle ORM, server-side RBAC, append-only audit, transactional pharmacy/billing, backup/restore, and an Electron desktop shell.

This is a first production-capable drop, not a clickable mock. Remaining work is operational (Windows-signed installer, hospital-specific catalogue, printer templates) rather than missing core modules.

## Architecture

Workstations → Electron or browser → HMS HTTP API on the hospital LAN → PostgreSQL on localhost of the server. Internet is not required. Schema, auth, RBAC, and deployment are documented under `docs/`.

## Technology stack

Next.js 15, React 19, TypeScript (strict), Tailwind CSS 4, TanStack Query, React Hook Form + Zod, Drizzle ORM, PostgreSQL 16, Argon2id, Vitest, Playwright, Electron Builder.

## Completed modules

- Authentication, sessions, CSRF, lockout, password policy
- RBAC with 12 roles and fine-grained permissions
- User / department / designation / doctor administration
- Patients, appointments, queue, encounters (draft lock on finalize), prescriptions
- Reception front desk: slot booking, check-in tokens, consultation-fee billing
- Doctor clinic: personal queue, vitals, diagnoses, prescriptions, lab orders from the encounter
- Pharmacy counter: FEFO stock, cart, paid sale, bounded returns (store manager still owns purchases)
- Laboratory worklist: collect → receive → enter → independent verify
- Pharmacy catalogue, purchases, batches, concurrent-safe sales, returns, adjustments
- Central billing (invoices, partial payments, refunds, cancel)
- Laboratory order → sample → result → independent verification
- Role-aware dashboard and permission-filtered reports
- Settings, audit log, health, backup/restore
- Electron client that stores only the server URL
- systemd units and install script

## Database status

43 application tables plus Drizzle migrations in `drizzle/0000_init.sql`. Integer cents for money. Sequences with row locks for document numbers. Check constraints for non-negative stock and invoice money.

## Authentication / RBAC / security

Opaque hashed sessions, Argon2id, CSRF, disable+revoke, no client DB access, generic login errors, lab self-verify blocked, pharmacist cannot refund or admin users. See `docs/security.md`.

## Test results (this run)

| Suite | Total | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- |
| Vitest (unit + integration + security + role modules) | 33 | 33 | 0 | 0 |
| Playwright E2E (admin, reception, doctor, pharmacy, lab) | 7 | 7 | 0 | 0 |
| Backup | 1 dump verified (checksum + dump header) | | | |
| Restore | 1 restore into empty DB recovered 11 users | | | |
| Concurrent pharmacy | 8 sellers / 5 units → 5 success, 3 conflict, stock 0 | | | |
| Parallel invoices | 10 concurrent invoices, unique numbers | | | |
| `next build` | success | | | |

## Electron

`electron/` + `electron-builder.yml` produce `SynapseHMS-Setup-*.exe` on Windows CI/build hosts. Linux AppImage can be built with `npm run electron:build`. The client does not embed `DATABASE_URL`.

## Known limitations / debt

- In-process login rate limit is per Node process (fine on a single LAN server).
- Windows code-signing is not configured.
- Document printing uses browser print CSS, not a dedicated PDF engine.
- Per-user permission overrides are in the schema/API surface but not fully exposed as a rich UI matrix.
- No HL7/FHIR integration (out of scope for LAN-first v1).
- Demo users are created only with `npm run db:seed -- --demo`.

## Issues by severity

- Critical: 0
- High: 0
- Medium: unsigned Windows installer; print is browser-based
- Low: demo seed password documented for development only

## Production deployment

See `docs/deployment.md`. Create a unique `HMS_SECRET`, do not reuse development passwords, bind PostgreSQL to localhost, enable `synapse-hms.service` and the backup timer.

Admin: change `INITIAL_ADMIN_PASSWORD` immediately. User instructions: personal login only, LAN URL in the desktop client.
