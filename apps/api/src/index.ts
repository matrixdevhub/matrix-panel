import Fastify from "fastify";
import cors from "@fastify/cors";
import pg from "pg";
import { config, pterodactylConfigured } from "./config.js";
import { getPanelSummary, getServers, PterodactylError } from "./pterodactyl.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576 });
await app.register(cors, { origin: config.WEB_ORIGIN });

const pool = config.DATABASE_URL ? new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 1500
}) : null;

app.get("/api/health", async () => ({
  status: "ok",
  service: "matrix-panel-api",
  pterodactyl: pterodactylConfigured ? "configured" : "not_configured",
  database: pool ? "configured" : "not_configured",
  timestamp: new Date().toISOString()
}));

app.get("/api/overview", async (_request, reply) => {
  if (!pterodactylConfigured) {
    return reply.code(503).send({
      error: "Pterodactyl is not configured",
      message: "Add PTERODACTYL_URL and PTERODACTYL_APPLICATION_KEY to the API server's .env file, then restart the API."
    });
  }
  try {
    const summary = await getPanelSummary();
    return { ...summary, connection: "connected", source: "pterodactyl" };
  } catch (error) {
    const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl. Check the URL and network.");
    return reply.code(e.statusCode).send({ error: "Pterodactyl connection failed", message: e.message });
  }
});

app.get("/api/servers", async (_request, reply) => {
  try {
    return await getServers();
  } catch (error) {
    const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl. Check the URL and network.");
    return reply.code(e.statusCode).send({ error: "Unable to load servers", message: e.message });
  }
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: "Internal server error" });
});

const close = async () => {
  await app.close();
  await pool?.end();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
