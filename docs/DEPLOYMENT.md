# Deployment notes

Matrix Panel is an active-development game-server panel. A successful build is not the same as a tested production deployment. Do not expose it to real users until the integration and security checks below pass.

## Requirements

- Debian 12 or another supported Linux environment.
- Node.js 22+ and npm 10+.
- PostgreSQL 14+ reachable privately from the API.
- A running Pterodactyl Panel and a least-privilege Application API key.
- A domain active in Cloudflare for a public Cloudflare Tunnel hostname.
- A dedicated Linux service account.

## 0. Inspect before changing a VPS

If the VPS already hosts Pterodactyl Panel and Wings, inspect existing services before installing or changing anything. Do not overwrite existing Nginx site files, change the firewall, or restart Wings as part of Matrix Panel setup.

Read-only checks:

```bash
cat /etc/debian_version
node -v
npm -v
nginx -v
systemctl is-active nginx
systemctl is-active postgresql
psql --version
ss -lntp | grep -E ':(80|443|3001|5432)\b' || true
```

A missing command or inactive service is a signal to inspect further, not to blindly reinstall it.

## 1. Database and environment

If PostgreSQL is not installed, install a supported PostgreSQL 14+ release and configure it to listen only on localhost or a private interface. Create a dedicated database and database user for Matrix Panel; do not reuse the Pterodactyl database/user and do not expose port 5432 publicly.

Clone the repository into `/opt/matrix-panel`, then create the environment file:

```bash
cd /opt/matrix-panel
cp .env.example .env
chmod 600 .env
```

Edit `.env` locally on the VPS. Set `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=3001`, `WEB_ORIGIN=https://YOUR_MATRIX_HOSTNAME`, a unique one-time `SETUP_TOKEN` of at least 24 characters, `CREDENTIAL_ENCRYPTION_KEY` generated with `openssl rand -base64 32`, a dedicated `DATABASE_URL`, `PTERODACTYL_URL`, and `PTERODACTYL_APPLICATION_KEY`.

Keep API keys out of frontend variables, Git commits, logs, screenshots, and chat. Back up the credential-encryption key securely; changing it can make stored encrypted credentials unreadable.

Run `./scripts/install.sh` from the repository root as the non-root deployment user. It interactively asks for the public hostname, an already-created dedicated PostgreSQL `DATABASE_URL`, and the Pterodactyl HTTPS URL/Application API key; it generates `SETUP_TOKEN` and `CREDENTIAL_ENCRYPTION_KEY`, writes `.env` with mode `600`, then type-checks and builds both workspaces. If `package-lock.json` exists it uses `npm ci`; because this repository currently has no committed lockfile, it warns and falls back to `npm install`, which is not fully reproducible. For production, commit and review a lockfile before deployment. Store the printed one-time setup token privately. The script does not install/configure PostgreSQL, Nginx, Cloudflare Tunnel, DNS/TLS, or systemd, and it must not be treated as a complete server installer.

## 2. Nginx origin

Use `deploy/nginx/matrix-panel.conf.example` as a reference, not as a file to overwrite an existing Pterodactyl Nginx configuration. Create a separate site for the Matrix Panel hostname. Confirm the web build path is `/opt/matrix-panel/apps/web/dist` and that `/api/` is proxied to `http://127.0.0.1:3001`, including WebSocket upgrade headers.

Test with `sudo nginx -t` before any reload. Ensure the new site does not conflict with the existing Pterodactyl hostname or ports.

## 3. Cloudflare Tunnel

Use a domain active in your Cloudflare account. In the Cloudflare dashboard, create a Tunnel and configure a public hostname such as `matrix.example.com` with origin `http://127.0.0.1:80` if Nginx listens locally on port 80.

Install `cloudflared` using Cloudflare's current official Debian/Linux instructions. Use the dashboard-provided connector command/token on the VPS; never paste the token into chat or commit it. Prefer a managed service and verify the connector is connected in the dashboard.

Keep the API bound to `127.0.0.1` and PostgreSQL private. Do not create public hostnames for ports 3001 or 5432. If the VPS also serves Pterodactyl, keep its hostname and routing unchanged. Set `WEB_ORIGIN` to the public HTTPS hostname, not the local origin.

Official instructions: https://developers.cloudflare.com/tunnel/get-started/

## 4. systemd API service

Adjust `deploy/systemd/matrix-panel-api.service.example` for the real app path, service user and environment file. Confirm the service user can read the app and `.env`. Then run `systemctl daemon-reload`, enable/start the service, and inspect `systemctl status matrix-panel-api` and `journalctl -u matrix-panel-api`.

Do not start the API until the environment and database are configured. Do not expose the API directly to the internet.

## 5. Initial administrator and verification

Create the first administrator by POSTing JSON fields `setupToken`, `email`, `username`, and a password of at least 12 characters to `/api/auth/setup`. This only works while the users table is empty. Remove `SETUP_TOKEN` from the environment and restart the API immediately after setup.

Verify `/api/live` and `/api/ready` locally, sign in over the public HTTPS hostname, and test against a disposable staging Pterodactyl environment.

## 6. Required staging tests before production

CI type-checks and builds both workspaces; it does not run end-to-end tests against PostgreSQL or Pterodactyl. Test authentication/session handling, role permissions, Pterodactyl resource reads, power controls, console/WebSocket, file operations, backups, schedules and error handling. Review admin CRUD and billing flows and perform a security review. Configure off-host database backups, log/disk monitoring and recovery procedures before production use.
