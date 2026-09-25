# Deployment (LAN server)

## Recommended layout

- Server PC: Ubuntu 22.04/24.04, PostgreSQL 16, Node.js 22, Synapse HMS systemd service.
- Clients: Windows PCs running the Electron installer, pointing at `http://<server-lan-ip>:3000`.

PostgreSQL must listen on `127.0.0.1` only. Do not expose 5432 to the hospital LAN.

## Quick install

```bash
sudo bash deploy/install-server.sh
```

The script creates the database user, `.env`, runs migrations and seed, and enables `synapse-hms.service`.

## Manual

1. Install PostgreSQL and create database `synapse_hms`.
2. Copy the app to `/opt/synapse-hms`.
3. Create `.env` from `.env.example`. Generate `HMS_SECRET` with `openssl rand -hex 32`.
4. `npm ci && npm run db:migrate && npm run db:seed && npm run build`
5. `systemctl enable --now synapse-hms`
6. Open `http://<server-ip>:3000/login` from a workstation.

## First admin

Created from `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` when no user exists. Change the password immediately.

## Health

- `curl http://127.0.0.1:3000/api/health/public` (no auth)
- Authenticated `/api/health` for DB, memory, last backup.

## Reboot

systemd `Restart=always` and `WantedBy=multi-user.target` bring the API back after power loss. PostgreSQL is a dependency.
