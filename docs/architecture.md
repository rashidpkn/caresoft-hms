# Synapse HMS Architecture

Synapse HMS is a LAN-first Hospital Management System. Workstations never talk to PostgreSQL. They talk only to the HMS application server over the hospital LAN.

```
Reception / Doctor / Pharmacy / Lab PCs
        │  Electron desktop (HMS.exe) or browser
        │  HTTP to HMS API (LAN)
        ▼
HMS application server (Next.js + Node.js)
        │
        ▼
PostgreSQL (localhost on the server, not exposed to clients)
```

## Goals

Operate a hospital without internet. Keep identifiable staff accounts, server-side RBAC, append-only audit, transactional pharmacy and billing, backup/restore, and a desktop client that only stores the server URL.

## Users and roles

Personal accounts only. Roles: Super Admin, Admin, Doctor, Nurse, Receptionist, Pharmacist, Store Manager, Lab Technician, Lab Attendant, Lab Verifier, Accountant, Security Officer.

Authorization is enforced in the API (`requireAuth` + permission codes). Hiding a sidebar link is not access control.

## Modules

Patients, appointments/queue, consultation/encounters, prescriptions, pharmacy/inventory, billing, laboratory, reporting, dashboards, user administration, settings, audit, health, backup.

## Layering

UI → Next.js route handlers (`src/server/api-router.ts`) → application services (`src/server/services`) → Drizzle repositories/schema → PostgreSQL.

Business rules live in services and are covered by Vitest. React components call `/api/...` and do not import the database.

## Authentication

Opaque session tokens (32 random bytes) stored as SHA-256 hashes in `sessions`. HTTP-only cookie `synapse_session`. CSRF token required on mutating requests. Idle timeout and absolute TTL. Failed logins lock the account. Disabled users cannot authenticate. Password change revokes sessions.

## Audit

`audit_logs` is insert-only from application code. There is no update/delete API.

## Electron

`electron/main.cjs` loads the configured LAN URL. It does not embed database credentials. If the server is down it shows `offline.html` so staff can correct the URL.

## Deployment

Linux systemd unit `deploy/synapse-hms.service` binds the app to the LAN. PostgreSQL listens on localhost. See `docs/deployment.md`.
