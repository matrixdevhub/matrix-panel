# Deployment notes

Matrix Panel is an active-development game-server panel. The repository can build the API and web UI, but a successful build is not the same as a tested production deployment. No live VPS, PostgreSQL database, or Pterodactyl instance is provisioned by this repository workflow.

## Requirements

- Linux VPS with a supported Node.js 22+ release and npm 10+.
- PostgreSQL 14+ reachable privately from the API.
- A domain pointed at the VPS if you want a public HTTPS deployment.
- A running Pterodactyl Panel and an Application API key with only the permissions the panel needs.
- A dedicated Linux service account and a firewall that exposes only SSH and HTTPS (plus HTTP temporarily for certificate setup, if needed).

## Deployment checklist

1. Create a dedicated Linux account and install Node.js 22+.
2. Run PostgreSQL on a private interface; do not expose port 5432 to the internet. Create a dedicated database and user with only the permissions Matrix Panel needs.
3. Place the repository in the configured application directory (the examples use `/opt/matrix-panel`). Ensure the service account can read the source and build output.
4. Create the root `.env` from `.env.example`. Set `NODE_ENV=production`, `API_HOST=127.0.0.1`, `API_PORT=3001`, the correct `WEB_ORIGIN`, a unique random `SETUP_TOKEN` of at least 24 characters, a `CREDENTIAL_ENCRYPTION_KEY` generated with `openssl rand -base64 32`, and a valid `DATABASE_URL`.
5. Set `PTERODACTYL_URL` and `PTERODACTYL_APPLICATION_KEY` on the API server only. Never place an Application API key in frontend variables or commit it.
6. Lock down environment-file permissions (for example, `chmod 600 .env`) and make sure the service account can read it. Back up the encryption key securely; changing it makes stored encrypted credentials unreadable.
7. Run `scripts/install.sh`, then validate the generated API and web builds. The script installs dependencies and builds the workspaces; it does not create a VPS, configure DNS/TLS/firewall, create PostgreSQL users, or start the service.
8. Configure Nginx using `deploy/nginx/matrix-panel.conf.example`. Replace `matrix.example.com` and the root path, validate with `nginx -t`, and configure HTTPS before allowing public logins. The config forwards WebSocket upgrade headers for the console.
9. Install and adjust `deploy/systemd/matrix-panel-api.service.example` to match the service account, app directory, and environment-file location. Start it only after the environment and database are configured; inspect `systemctl status` and journal logs.
10. Create the initial administrator by sending a POST request to `/api/auth/setup` with JSON fields `setupToken`, `email`, `username`, and a password of at least 12 characters. The endpoint only works while the users table is empty. Remove `SETUP_TOKEN` from the environment after setup and restart the API.
11. Verify `/api/live` and `/api/ready` locally, sign in over HTTPS, and test panel features against a non-production Pterodactyl environment first. Do not assume live integration is verified just because the CI build passed.
12. Configure encrypted/off-host PostgreSQL backups, monitor logs and disk usage, and apply minimum required Pterodactyl API permissions before inviting real users.

## Cloudflare Tunnel

For a Cloudflare Tunnel deployment, map the public hostname to the local Nginx origin (for example, `http://127.0.0.1:80`). Keep the API service and PostgreSQL private; route public traffic through the HTTPS hostname. Follow Cloudflare's current dashboard instructions for installing and running the tunnel connector on your OS.

## Current limitations

CI type-checks and builds the API and web workspaces and publishes a short-lived build artifact. This does not run end-to-end tests against PostgreSQL or Pterodactyl. Before production use, add and run integration tests for authentication, role permissions, server power controls, console/WebSocket, file operations, backups, schedules, and error handling; review all admin CRUD and billing flows; and perform a security review. Treat this panel as a staging project until those checks pass.
