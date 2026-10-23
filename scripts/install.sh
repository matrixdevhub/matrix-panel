#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "IMPORTANT: edit .env before running the production API; configure PostgreSQL, WEB_ORIGIN, SETUP_TOKEN and Pterodactyl credentials."
fi

npm install
npm run build

echo
echo "Build finished. This script does not open firewall ports or publish your API."
echo "Before deployment, set API_HOST=127.0.0.1, configure HTTPS/reverse proxy, secure .env permissions,"
echo "create the initial admin with SETUP_TOKEN, and review deploy/systemd/matrix-panel-api.service.example."
