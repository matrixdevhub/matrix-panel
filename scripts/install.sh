#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${EUID}" -eq 0 ]]; then
  echo "Do not run npm install/build as root. Run as the deployment user, using sudo only for system setup."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install it from https://nodejs.org/ and rerun."
  exit 1
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 22 )); then
  echo "Node.js 22 or newer is required (found $(node --version))."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found."
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to generate local secrets."
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "Created .env from .env.example."
fi

echo
echo "Matrix Panel environment setup"
echo "This configures .env and builds the app. It does NOT install PostgreSQL, change Nginx,"
echo "create a Cloudflare Tunnel, or replace any existing Pterodactyl configuration."
echo

read -r -p "Public hostname (e.g. matrix.example.com, without https://): " HOSTNAME
HOSTNAME="${HOSTNAME#https://}"
HOSTNAME="${HOSTNAME#http://}"
HOSTNAME="${HOSTNAME%%/*}"
if [[ -z "$HOSTNAME" || "$HOSTNAME" == *" "* || "$HOSTNAME" != *.* ]]; then
  echo "Please enter a valid hostname such as matrix.example.com."
  exit 1
fi

read -r -p "PostgreSQL DATABASE_URL (dedicated Matrix Panel DB, URL-encode special password characters): " DATABASE_URL
if [[ "$DATABASE_URL" != postgresql://* && "$DATABASE_URL" != postgres://* ]]; then
  echo "DATABASE_URL must start with postgresql:// or postgres://."
  exit 1
fi

read -r -p "Pterodactyl panel URL (e.g. https://panel.example.com): " PTERODACTYL_URL
PTERODACTYL_URL="${PTERODACTYL_URL%/}"
if [[ "$PTERODACTYL_URL" != https://* ]]; then
  echo "Use the HTTPS URL of your existing Pterodactyl Panel."
  exit 1
fi

read -r -s -p "Pterodactyl Application API key (hidden): " PTERODACTYL_APPLICATION_KEY
echo
if [[ -z "$PTERODACTYL_APPLICATION_KEY" ]]; then
  echo "Application API key is required for admin resource integration."
  exit 1
fi

SETUP_TOKEN="$(openssl rand -hex 32)"
CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -base64 32)"
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT
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
trap - EXIT
unset PTERODACTYL_APPLICATION_KEY DATABASE_URL

echo
echo "Environment saved to .env with mode 600."
echo "One-time admin setup token (save privately; needed for the first admin):"
echo "$SETUP_TOKEN"
echo
echo "Installing dependencies and building Matrix Panel..."
npm install
npm run typecheck
npm run build

echo
echo "Build completed."
echo "Next required steps:"
echo "  1. Ensure the PostgreSQL database/user in DATABASE_URL already exist and are reachable."
echo "  2. Configure a separate Nginx site using deploy/nginx/matrix-panel.conf.example."
echo "  3. Point Cloudflare Tunnel hostname https://$HOSTNAME to http://127.0.0.1:80."
echo "  4. Configure and start the systemd service using deploy/systemd/matrix-panel-api.service.example."
echo "  5. Verify /api/ready and create the first admin over HTTPS; then remove SETUP_TOKEN from .env and restart."
echo "Do not expose ports 3001 or 5432 publicly. Do not paste .env or API keys into chat."
