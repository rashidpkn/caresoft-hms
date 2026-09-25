#!/usr/bin/env bash
set -euo pipefail
# Fresh-install helper for a Linux HMS server on the hospital LAN.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo) so systemd and PostgreSQL can be configured."
  exit 1
fi

APP_USER="${HMS_USER:-hms}"
APP_DIR="${HMS_DIR:-/opt/synapse-hms}"
DB_NAME="${HMS_DB:-synapse_hms}"
DB_USER="${HMS_DB_USER:-synapse}"
DB_PASS="${HMS_DB_PASSWORD:-$(openssl rand -base64 24)}"
SECRET="${HMS_SECRET:-$(openssl rand -hex 32)}"
ADMIN_USER="${INITIAL_ADMIN_USERNAME:-admin}"
ADMIN_PASS="${INITIAL_ADMIN_PASSWORD:-$(openssl rand -base64 12)Aa1}"

apt-get update -y
apt-get install -y postgresql postgresql-contrib nodejs npm

id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" /var/lib/synapse-hms/backups
rsync -a --exclude node_modules --exclude .git --exclude .next "$ROOT/" "$APP_DIR/" || cp -a "$ROOT/." "$APP_DIR/"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR" /var/lib/synapse-hms

sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
HMS_SECRET=${SECRET}
COOKIE_SECURE=false
COOKIE_NAME=synapse_session
BACKUP_DIR=/var/lib/synapse-hms/backups
INITIAL_ADMIN_USERNAME=${ADMIN_USER}
INITIAL_ADMIN_PASSWORD=${ADMIN_PASS}
PUBLIC_APP_URL=http://0.0.0.0:3000
EOF
chown "$APP_USER":"$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev || sudo -u "$APP_USER" npm install --omit=dev
sudo -u "$APP_USER" npx drizzle-kit migrate || sudo -u "$APP_USER" npm run db:migrate
sudo -u "$APP_USER" npm run db:seed

cp "$APP_DIR/deploy/synapse-hms.service" /etc/systemd/system/synapse-hms.service
systemctl daemon-reload
systemctl enable --now synapse-hms

echo
echo "Synapse HMS installed."
echo "Admin username: ${ADMIN_USER}"
echo "Admin password: ${ADMIN_PASS}"
echo "Change this password at first login."
echo "Health: curl http://127.0.0.1:3000/api/health/public"
