# Deployment notes

## Production checklist

1. Use a dedicated Linux account and a supported Node.js 22+ release.
2. Run PostgreSQL on a private interface; do not expose port 5432 to the internet.
3. Configure the root .env file and lock down permissions (for example, chmod 600 .env).
4. Set NODE_ENV=production, API_HOST=127.0.0.1, a correct WEB_ORIGIN, a long random SETUP_TOKEN and the real Pterodactyl URL/Application API key.
5. Run scripts/install.sh, configure Nginx from deploy/nginx/matrix-panel.conf.example, and install the systemd service from deploy/systemd/matrix-panel-api.service.example after adjusting paths and account names.
6. Serve the site over HTTPS. Secure cookies require HTTPS in production.
7. Create the initial administrator using the setup endpoint. Remove SETUP_TOKEN from .env after setup and restart the service.
8. Apply the minimum required Pterodactyl Application API permissions. Never expose Application API keys to browser code, screenshots, logs or a public repository.
9. Configure backups for PostgreSQL and review logs/retention before allowing real users.

## Cloudflare Tunnel

For a Cloudflare Tunnel deployment, create a tunnel in the Cloudflare dashboard and map the public hostname to the local Nginx origin (for example, http://127.0.0.1:80). Keep the API service and PostgreSQL private; route public traffic through the HTTPS hostname. Do not publish the API on a second unrestricted hostname. Follow Cloudflare's current dashboard instructions for installing and running the tunnel connector on your OS.

## Current limitations

The repository is still in active development. This install helper only checks prerequisites, installs dependencies and builds the current workspaces. It does not configure DNS, certificates, firewall policy, PostgreSQL credentials, Cloudflare, or a production host automatically. The server control, WebSocket console, file manager, backup/schedule workflows and complete role-based UI must be finished and integration-tested before production use.
