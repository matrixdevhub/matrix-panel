#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { echo "ERROR: $*" >&2; exit 1; }
note() { printf '\n==> %s\n' "$*"; }

[[ $EUID -ne 0 ]] || fail "Run this script as the normal deployment user, not root. It may use sudo for guarded system setup."
command -v node >/dev/null || fail "Node.js 22+ is required (https://nodejs.org/)."
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22+ required; found $(node --version)."
command -v npm >/dev/null || fail "npm is required."
command -v openssl >/dev/null || fail "openssl is required."
[[ -f .env.example ]] || fail "Missing .env.example."
# Prefer reproducible installs. This repository currently has no committed npm lockfile,
# so fall back to npm install rather than making the guided installer unusable.
if [[ -f package-lock.json ]]; then
  INSTALL_COMMAND="ci"
else
  INSTALL_COMMAND="install"
  echo "WARNING: package-lock.json is missing; npm install may resolve newer compatible dependencies."
  echo "For reproducible production deploys, commit a reviewed package-lock.json and rerun."
fi
command -v sudo >/dev/null || fail "sudo is required for optional system configuration. Install it or configure system files manually."

echo "Matrix Panel guided installer (Debian 12 / existing Pterodactyl-safe)"
echo "This does not modify Pterodactyl, Wings, firewall rules, or Cloudflare account settings."
echo "It only installs dependencies/builds the app and can add a separate Nginx site + systemd service."
echo

read -r -p "Public hostname (e.g. matrix.example.com): " HOSTNAME
HOSTNAME="${HOSTNAME#https://}"; HOSTNAME="${HOSTNAME#http://}"; HOSTNAME="${HOSTNAME%%/*}"
[[ "$HOSTNAME" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$ ]] || fail "Invalid hostname."

read -r -p "Existing Pterodactyl panel URL (https://...): " PTERODACTYL_URL
PTERODACTYL_URL="${PTERODACTYL_URL%/}"
[[ "$PTERODACTYL_URL" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]] || fail "Pterodactyl URL must be a simple HTTPS origin (no path/query)."

read -r -p "Dedicated PostgreSQL DATABASE_URL (password special characters URL-encoded): " DATABASE_URL
[[ "$DATABASE_URL" == postgresql://* || "$DATABASE_URL" == postgres://* ]] || fail "DATABASE_URL must begin postgresql:// or postgres://."

read -r -s -p "Pterodactyl Application API key (input hidden): " PTERODACTYL_APPLICATION_KEY; echo
[[ -n "$PTERODACTYL_APPLICATION_KEY" ]] || fail "Application API key is required."
[[ "$PTERODACTYL_APPLICATION_KEY" != *$'\n'* ]] || fail "API key cannot contain a newline."

if [[ -f .env ]]; then
  BACKUP=".env.backup.$(date +%Y%m%d%H%M%S)"
  cp -p .env "$BACKUP"
  chmod 600 "$BACKUP"
  echo "Existing .env backed up to $BACKUP (keep it private)."
fi

SETUP_TOKEN="$(openssl rand -hex 32)"
CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32 | tr -d '\n')"
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"; unset PTERODACTYL_APPLICATION_KEY DATABASE_URL' EXIT
cat > "$TMP_ENV" <<EOF
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3001
WEB_ORIGIN=https://$HOSTNAME
SETUP_TOKEN=$SETUP_TOKEN
CREDENTIAL_ENCRYPTION_KEY=$CREDENTIAL_ENCRYPTION_KEY
PTERODACTYL_URL=$PTERODACTYL_URL
PTERODACTYL_APPLICATION_KEY=$PTERODACTYL_APPLICATION_KEY
PTERODACTYL_CLIENT_KEY=
DATABASE_URL=$DATABASE_URL
VITE_API_URL=
EOF
chmod 600 "$TMP_ENV"
mv "$TMP_ENV" .env
unset PTERODACTYL_APPLICATION_KEY DATABASE_URL
trap - EXIT

if [[ "$INSTALL_COMMAND" == "ci" ]]; then
  note "Installing locked dependencies"
  npm ci
else
  note "Installing dependencies (no committed lockfile; not fully reproducible)"
  npm install
fi
note "Type-checking"
npm run typecheck
note "Building frontend and API"
npm run build
[[ -d apps/web/dist ]] || fail "Web build output apps/web/dist not found."
[[ -f apps/api/dist/index.js || -d apps/api/dist ]] || echo "Warning: API build output location differs; verify API start command before enabling service."

echo
echo "Build succeeded. .env permissions: $(stat -c '%a' .env)"
echo "One-time admin setup token (store privately; it will not be written to the terminal again):"
echo "$SETUP_TOKEN"
echo "Use it only for the first admin setup, then remove SETUP_TOKEN from .env and restart the service."
echo

read -r -p "Install a separate Matrix Panel systemd unit and Nginx site now? [y/N] " INSTALL_SYSTEM
if [[ "$INSTALL_SYSTEM" =~ ^[Yy]$ ]]; then
  command -v nginx >/dev/null || fail "Nginx is not installed. Install it separately; existing Pterodactyl config was not touched."
  command -v setfacl >/dev/null || fail "setfacl is required for safe service permissions. Install with: sudo apt-get install acl"
  sudo -v
  SERVICE_USER="matrix-panel"
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    sudo useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
  # Keep the checkout owned by the deploying user so future updates remain possible.
  # Grant the service account read access without recursively changing repository ownership.
  sudo setfacl -R -m "u:$SERVICE_USER:rX" "$ROOT" 2>/dev/null || {
    echo "setfacl is unavailable; installing ACL support is required for safe read access."
    echo "Run: sudo apt-get install acl, then rerun this installer."
    exit 1
  }
  sudo setfacl -m "u:$SERVICE_USER:rw" "$ROOT/.env"
  sudo chmod 600 "$ROOT/.env"

  NGINX_AVAILABLE="/etc/nginx/sites-available/matrix-panel"
  NGINX_ENABLED="/etc/nginx/sites-enabled/matrix-panel"
  SYSTEMD_FILE="/etc/systemd/system/matrix-panel-api.service"
  [[ ! -e "$NGINX_AVAILABLE" && ! -e "$NGINX_ENABLED" ]] || fail "Matrix Panel Nginx file already exists; refusing to overwrite it."
  [[ ! -e "$SYSTEMD_FILE" ]] || fail "Matrix Panel systemd unit already exists; refusing to overwrite it."

  TMP_NGINX="$(mktemp)"
  TMP_UNIT="$(mktemp)"
  trap 'rm -f "$TMP_NGINX" "$TMP_UNIT"; unset SETUP_TOKEN' EXIT
  cat > "$TMP_NGINX" <<EOF
# This file is included from Nginx's http context, so map must be outside server.
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    '' close;
}
server {
    listen 80;
    server_name $HOSTNAME;
    root $ROOT/apps/web/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_read_timeout 3600s;
    }
}
EOF
  cat > "$TMP_UNIT" <<EOF
[Unit]
Description=Matrix Panel API
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$ROOT
Environment=NODE_ENV=production
EnvironmentFile=$ROOT/.env
ExecStart=$(command -v npm) run start --workspace @matrix-panel/api
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$ROOT
UMask=0077
[Install]
WantedBy=multi-user.target
EOF
  sudo install -o root -g root -m 644 "$TMP_NGINX" "$NGINX_AVAILABLE"
  sudo ln -s "$NGINX_AVAILABLE" "$NGINX_ENABLED"
  sudo install -o root -g root -m 644 "$TMP_UNIT" "$SYSTEMD_FILE"
  if ! sudo nginx -t; then
    sudo rm -f "$NGINX_ENABLED" "$NGINX_AVAILABLE" "$SYSTEMD_FILE"
    fail "Nginx config test failed; generated files removed. Existing sites were not restarted."
  fi
  sudo systemctl daemon-reload
  sudo systemctl enable --now matrix-panel-api
  sudo systemctl reload nginx
  rm -f "$TMP_NGINX" "$TMP_UNIT"
  trap - EXIT
  echo "Separate Matrix Panel systemd service and Nginx site installed."
else
  echo "Skipped systemd/Nginx changes. Configure them using docs/DEPLOYMENT.md."
fi

echo
echo "Remaining external steps (Cloudflare cannot be configured without your Cloudflare account):"
echo "  1. Confirm PostgreSQL is reachable and DATABASE_URL uses a dedicated Matrix Panel DB/user."
echo "  2. In Cloudflare Zero Trust, route $HOSTNAME to http://127.0.0.1:80 using your existing Tunnel."
echo "  3. Check locally: curl -i http://127.0.0.1:3001/api/ready"
echo "  4. Open https://$HOSTNAME and perform the first-admin setup using the one-time token."
echo "  5. Remove SETUP_TOKEN from $ROOT/.env, then restart: sudo systemctl restart matrix-panel-api"
echo "  6. Never expose TCP 3001 or 5432 publicly. Do not paste .env, tokens, or API keys into chat."
