# Matrix Panel

Self-hosted game-server management dashboard for Pterodactyl Panel. The UI is designed to use API-backed data rather than fabricated server records.

## Current status

**Staging / active development — not yet verified against a live production VPS, PostgreSQL database, or Pterodactyl instance.** A successful CI build proves compilation only; it does not prove all runtime flows or security controls are production-ready.

## Implemented foundation

- React + TypeScript + Vite web dashboard and Fastify + TypeScript API.
- PostgreSQL-backed users, sessions, audit logs, preferences, plans, redeem codes, user plans, balances and balance transactions.
- Initial admin bootstrap protected by a one-time setup token.
- Password hashing, hashed server-side session tokens, HttpOnly/SameSite cookies, rate limits and role-guarded API routes.
- Pterodactyl Application API integration for server and administrative resource reads.
- Per-user Pterodactyl Client API key support; credentials are encrypted at rest and never returned to the browser.
- User server inventory, power actions, WebSocket console proxy, file operations and read access to server-related resources, subject to the connected user's Pterodactyl permissions.
- Admin and user dashboard views for supported account, plan, balance and server-management flows.

Feature coverage in the code is not a substitute for end-to-end testing. Treat server controls and admin/billing workflows as unverified until tested against a disposable staging Pterodactyl environment.

## Requirements

- Debian/Ubuntu or another supported Linux environment.
- Node.js 22+ and npm.
- PostgreSQL 14+ reachable privately by the API.
- A running Pterodactyl Panel and a least-privilege Application API key.
- A domain pointed to the VPS for public HTTPS deployment.

## Production-shaped deployment outline

1. Create a dedicated Linux service account and install Node.js 22+.
2. Install PostgreSQL locally or use a private managed database. Do not expose PostgreSQL port 5432 publicly.
3. Clone this repository to `/opt/matrix-panel` and ensure the service account can read the files and build output.
4. Copy `.env.example` to `.env`; set `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=3001`, the public `WEB_ORIGIN`, a unique `SETUP_TOKEN` of at least 24 characters, a valid `DATABASE_URL`, `PTERODACTYL_URL`, and `PTERODACTYL_APPLICATION_KEY`.
5. Generate `CREDENTIAL_ENCRYPTION_KEY` using `openssl rand -base64 32`. Back it up securely; changing it can make stored encrypted credentials unreadable. Never commit or share `.env` or API keys.
6. Run `scripts/install.sh` to install dependencies and build both workspaces. This script does not create database users, configure DNS/TLS/firewall, or start the service.
7. Configure Nginx from `deploy/nginx/matrix-panel.conf.example`; set the correct hostname and build path. Validate using `nginx -t` and configure HTTPS before public logins.
8. Configure `deploy/systemd/matrix-panel-api.service.example` for the actual service account, app directory and environment-file location. Start the API only after the database and environment are configured.
9. Verify `/api/live` and `/api/ready` locally. Create the first administrator by POSTing `setupToken`, `email`, `username` and a password of at least 12 characters to `/api/auth/setup`. Remove `SETUP_TOKEN` and restart the API immediately after setup.
10. Test authentication, permissions, Pterodactyl reads, power controls, console/WebSocket, file operations, backups, schedules and admin flows using a disposable staging instance before production use.
11. Configure HTTPS renewal, firewall restrictions, off-host database backups, log monitoring and a recovery procedure.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the deployment checklist and Nginx details.

## CI

GitHub Actions type-checks and builds the API and web workspaces. A green CI run is not an end-to-end test against a real database or Pterodactyl instance.

## Security reminders

- Keep `PTERODACTYL_APPLICATION_KEY` server-side only and grant only the permissions required.
- Do not expose the API directly to the internet; bind it to loopback behind HTTPS Nginx.
- Do not expose PostgreSQL publicly.
- Use a unique, strong setup token and remove it after first-admin creation.
- Back up the credential-encryption key securely.
- Keep this in staging until integration tests and a security review pass.
