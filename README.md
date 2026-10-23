# Matrix Panel

Modern self-hosted control dashboard designed to connect to a real Pterodactyl Panel. No Supabase.

## Current working scope

- Responsive Matrix Panel dashboard UI.
- Node.js/Fastify API with health endpoint.
- Server-side Pterodactyl Application API integration for real server, node and location totals, plus server inventory.
- Honest disconnected state: it does not fabricate sample server data.
- PostgreSQL development service definition.
- Pterodactyl API credentials stay in the API process environment, never in frontend code.

## Requirements

- Node.js 20+
- npm 10+
- A reachable Pterodactyl Panel and an Application API key with read access to servers, nodes and locations for overview data.

## Local setup

1. Copy `.env.example` to `.env` in the repository root.
2. Set `PTERODACTYL_URL` to your panel base URL, for example `https://panel.example.com`.
3. Set `PTERODACTYL_APPLICATION_KEY` in the root `.env`. Generate it in the Pterodactyl admin area and grant only the permissions needed for the endpoints you use. **Never paste this key into the browser or commit it.**
4. Optionally start PostgreSQL: `docker compose up -d postgres`. Set a strong `POSTGRES_PASSWORD` and matching `DATABASE_URL` before exposing anything beyond local development.
5. Install and run:

   ```sh
   npm install
   npm run dev
   ```

6. Open `http://localhost:5173`. API health is at `http://localhost:3001/api/health`.

The API key is used only by the backend. The current first milestone is a read-only dashboard; user authentication and privileged server actions must be implemented before public production deployment. Do not expose this development API to the public internet as an admin service.

## API endpoints

- `GET /api/health` — API and configuration health (never returns credentials).
- `GET /api/overview` — real counts from Pterodactyl Application API.
- `GET /api/servers` — real server inventory from Pterodactyl Application API.

## Build checks

```sh
npm run typecheck
npm run build
```

## Architecture

- `apps/web`: React + TypeScript + Vite UI.
- `apps/api`: Fastify API and Pterodactyl integration.
- `docker-compose.yml`: local PostgreSQL service.

Wings is the node daemon managed by Pterodactyl. The dashboard uses Pterodactyl's supported API surfaces rather than exposing Wings directly to a browser.
