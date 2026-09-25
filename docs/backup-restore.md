# Backup and restore

Backups are `pg_dump` plain SQL files in `BACKUP_DIR` (default `./var/backups` or `/var/lib/synapse-hms/backups`).

## Automatic

Enable:

```bash
sudo cp deploy/synapse-hms-backup.service deploy/synapse-hms-backup.timer /etc/systemd/system/
sudo systemctl enable --now synapse-hms-backup.timer
```

## Manual

- UI: System → Run backup now (`backup.manage`)
- CLI: `npm run backup`

Each run records size, SHA-256, and a verification flag (dump contains PostgreSQL dump/schema markers).

## Restore (tested with `psql -f`)

1. Stop the app: `sudo systemctl stop synapse-hms`
2. Restore:

```bash
sudo -u postgres psql -d synapse_hms -v ON_ERROR_STOP=1 -f /var/lib/synapse-hms/backups/<file>.sql
```

Or use the super-admin API `POST /api/backups/restore` with `{ "filename": "...", "confirm": "RESTORE" }` — this is destructive.

3. Start the app: `sudo systemctl start synapse-hms`
4. Sign in and confirm patients/invoices still load.

Restore has been exercised in this repository via `pg_dump` + `psql` against the test database (see tests and `docs/FINAL_REPORT.md`).
