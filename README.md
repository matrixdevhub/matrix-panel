# Matrix Panel

Self-hosted game-server management dashboard designed for real Pterodactyl Panel integration. The UI does not fabricate server data.

## Implemented foundation

- React + TypeScript + Vite dashboard and Fastify + TypeScript API.
- Real Pterodactyl Application API reads for servers, nodes, locations, users, nests and mounts.
- PostgreSQL schema for users, sessions, audit logs, preferences, plans, redeem codes, user plans, balances and balance transactions.
- Initial admin bootstrap guarded by a private setup token and disabled automatically once any user exists.
- Scrypt password hashing, opaque server-side sessions stored as SHA-256 hashes, HttpOnly/SameSite cookies, login/setup rate limits and role-based route guards.
- Authenticated profile preferences, admin-only user/audit and Pterodactyl resource endpoints, plans, redeem codes, balances and settings APIs.
- Per-user Pterodactyl Client API key connection; credentials are encrypted at rest with AES-256-GCM and are never returned to the browser.
- Per-user server inventory, power actions, authenticated WebSocket console proxy, file listing/read/write, backup creation, and read access to schedules, databases, network allocations, startup, settings and server users. Pterodactyl continues to enforce permissions attached to each user's own Client API key.
- Admin UI views for live users, nodes, locations, nests, mounts, plans, redeem codes, balances, settings and audit data, including user/plan/code creation and balance adjustment forms.
- User UI for profile updates, password changes, preferences/themes, plan history, balance and redeem-code activation.
- Server UI with console, power controls, file editor and tabs for backups, schedules, databases, network, startup, settings and users.
- Responsive sign-in screen; API keys stay on the server.

## Requirements

- Node.js 22+, npm 10+, PostgreSQL 14+.
- A Pterodactyl Panel and an Application API key with the required read permissions.

## Setup

1. Copy .env.example to .env in the repository root.
2. Set DATABASE_URL, WEB_ORIGIN, a long random SETUP_TOKEN (at least 24 characters), and CREDENTIAL_ENCRYPTION_KEY generated with openssl rand -base64 32. Back up the encryption key securely; changing it makes existing saved credentials unreadable.
3. Set PTERODACTYL_URL and PTERODACTYL_APPLICATION_KEY on the API server only. Never put the Application API key in frontend variables or commit it.
4. Run npm install then npm run dev.
5. Create the initial administrator with a POST request to /api/auth/setup using JSON fields setupToken, email, username and password (minimum 12 characters). Keep the setup token private; remove it from the environment after setup.
6. Open http://localhost:5173 and sign in.

## Work still remaining

This is not production-ready and has not yet been tested against a live database or Pterodactyl instance. Console/WebSocket, file editing/upload/download, backups, schedules, full admin CRUD, billing/payment processing and deployment hardening still need implementation. Do not expose this development build publicly until the remaining work is completed and tested.
