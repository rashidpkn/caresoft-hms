# Troubleshooting

## Cannot reach HMS server

The Electron client shows an offline screen. Confirm the server PC is powered, `systemctl status synapse-hms` is active, and the workstation is on the same LAN. Ping the server IP. The app does not need internet.

## Database unreachable

Staff see a generic unavailability message. On the server: `systemctl status postgresql`, `psql "$DATABASE_URL" -c 'select 1'`.

## Locked account

Wait `LOGIN_LOCK_MINUTES` or have an admin reset the password (`user.reset_password`), which clears `failed_login_count`.

## Duplicate stock / negative stock

Should not occur; if it does, stop dispensing, run a backup, inspect `inventory_movements` for the batch, then `inventory.adjust` with a written reason.

## Forgot server URL

Electron stores only `server.json` under the OS userData directory. Re-enter `http://<lan-ip>:3000`.

## Stack traces in the UI

They are not supposed to appear. If they do, you are running a modified build; file a defect rather than showing them to staff.
