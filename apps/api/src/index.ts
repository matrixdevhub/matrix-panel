import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { config, pterodactylConfigured } from "./config.js";
import { pool, migrate } from "./database.js";
import { authenticate, requireAdmin, requireUser } from "./auth.js";
import { hashPassword, hashToken, randomToken, verifyPassword } from "./security.js";
import { getPanelSummary, getServers, PterodactylError, applicationRequest } from "./pterodactyl.js";

const app = Fastify({ logger: true, bodyLimit: 1_048_576, trustProxy: config.NODE_ENV === "production" });
await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
await app.register(cookie);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
app.addHook("preHandler", authenticate);
const COOKIE = "matrix_session";
const cookieOptions = { path: "/", httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "strict" as const, maxAge: 604800 };
function dbRequired(reply: import("fastify").FastifyReply) {
  if (pool) return true;
  reply.code(503).send({ error: "Database is not configured", message: "Set DATABASE_URL and restart the API." });
  return false;
}
function originGuard(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) {
  if (request.headers.origin && request.headers.origin !== config.WEB_ORIGIN) {
    reply.code(403).send({ error: "Origin not allowed" }); return false;
  }
  return true;
}
async function audit(userId: string | null, action: string, request: import("fastify").FastifyRequest, targetType?: string, targetId?: string) {
  if (!pool) return;
  await pool.query("INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,ip_address) VALUES($1,$2,$3,$4,$5)",
    [userId, action, targetType ?? null, targetId ?? null, request.ip]);
}

app.get("/api/health", async () => ({
  status: "ok", service: "matrix-panel-api",
  pterodactyl: pterodactylConfigured ? "configured" : "not_configured",
  database: pool ? "configured" : "not_configured", timestamp: new Date().toISOString()
}));

app.post("/api/auth/setup", { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({ setupToken: z.string().min(24), email: z.string().email().max(254),
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/), password: z.string().min(12).max(128) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid setup data", details: parsed.error.flatten().fieldErrors });
  if (!config.SETUP_TOKEN || parsed.data.setupToken !== config.SETUP_TOKEN) return reply.code(403).send({ error: "Invalid setup token" });
  const count = await pool!.query("SELECT COUNT(*)::int AS count FROM users");
  if (count.rows[0].count !== 0) return reply.code(409).send({ error: "Initial setup is already complete" });
  const client = await pool!.connect();
  let user: { id: string; email: string; username: string; role: string };
  try {
    await client.query("BEGIN");
    const result = await client.query("INSERT INTO users(email,username,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id,email,username,role",
      [parsed.data.email.toLowerCase(), parsed.data.username, await hashPassword(parsed.data.password)]);
    user = result.rows[0];
    await client.query("INSERT INTO balances(user_id) VALUES($1)", [user.id]);
    await client.query("INSERT INTO user_preferences(user_id) VALUES($1)", [user.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const token = randomToken();
  await pool!.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')", [hashToken(token), user.id]);
  reply.setCookie(COOKIE, token, cookieOptions);
  await audit(String(user.id), "auth.initial_setup", request, "user", String(user.id));
  return reply.code(201).send({ user });
});

app.post("/api/auth/login", { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({ login: z.string().min(1).max(254), password: z.string().min(1).max(128) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Enter your email/username and password" });
  const result = await pool!.query("SELECT id,email,username,role,password_hash,is_active FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($1) LIMIT 1", [parsed.data.login]);
  const user = result.rows[0];
  if (!user || !user.is_active || !(await verifyPassword(parsed.data.password, user.password_hash))) return reply.code(401).send({ error: "Invalid login or password" });
  const token = randomToken();
  await pool!.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')", [hashToken(token), user.id]);
  reply.setCookie(COOKIE, token, cookieOptions);
  await audit(String(user.id), "auth.login", request, "user", String(user.id));
  return { user: { id: String(user.id), email: user.email, username: user.username, role: user.role } };
});
app.post("/api/auth/logout", async (request, reply) => {
  if (!originGuard(request, reply)) return;
  const token = request.cookies?.[COOKIE];
  if (token && pool) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  reply.clearCookie(COOKIE, { path: "/", sameSite: "strict", secure: config.NODE_ENV === "production" });
  return { ok: true };
});
app.get("/api/auth/me", { preHandler: requireUser }, async request => ({ user: request.sessionUser }));

app.get("/api/profile/preferences", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT theme,notification_sound,about,updated_at FROM user_preferences WHERE user_id=$1", [request.sessionUser!.id]);
  return result.rows[0] ?? { theme: "dark", notification_sound: true, about: "" };
});
app.patch("/api/profile/preferences", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({ theme: z.enum(["dark","light","dark-purple","dark-blue-purple","dark-red-purple-pink-blue"]).optional(),
    notification_sound: z.boolean().optional(), about: z.string().max(1000).optional() }).strict().safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return reply.code(400).send({ error: "Invalid preferences" });
  const { theme, notification_sound, about } = parsed.data;
  await pool!.query("INSERT INTO user_preferences(user_id,theme,notification_sound,about) VALUES($1,COALESCE($2,'dark'),COALESCE($3,TRUE),COALESCE($4,'')) ON CONFLICT(user_id) DO UPDATE SET theme=COALESCE($2,user_preferences.theme),notification_sound=COALESCE($3,user_preferences.notification_sound),about=COALESCE($4,user_preferences.about),updated_at=NOW()",
    [request.sessionUser!.id, theme ?? null, notification_sound ?? null, about ?? null]);
  await audit(request.sessionUser!.id, "profile.preferences.update", request, "user", request.sessionUser!.id);
  return { ok: true };
});

app.get("/api/admin/users", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const parsed = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(25), search: z.string().max(100).optional() }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });
  const { page, limit, search = "" } = parsed.data;
  const term = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
  const rows = await pool!.query("SELECT id,email,username,role,is_active,created_at FROM users WHERE email ILIKE $1 OR username ILIKE $1 ORDER BY id DESC LIMIT $2 OFFSET $3", [term, limit, (page - 1) * limit]);
  const count = await pool!.query("SELECT COUNT(*)::int AS total FROM users WHERE email ILIKE $1 OR username ILIKE $1", [term]);
  return { data: rows.rows, pagination: { page, limit, total: count.rows[0].total } };
});
app.get("/api/admin/audit-logs", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid limit" });
  const rows = await pool!.query("SELECT a.id,a.action,a.target_type,a.target_id,a.metadata,a.ip_address,a.created_at,u.username AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT $1", [parsed.data.limit]);
  return { data: rows.rows };
});

const resources: Record<string, string> = { servers: "/servers", nodes: "/nodes", locations: "/locations", nests: "/nests", mounts: "/mounts", users: "/users" };
for (const [name, path] of Object.entries(resources)) {
  app.get("/api/admin/pterodactyl/" + name, { preHandler: requireAdmin }, async (request, reply) => {
    if (!pterodactylConfigured) return reply.code(503).send({ error: "Pterodactyl is not configured" });
    const query = z.object({ page: z.coerce.number().int().min(1).default(1), per_page: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "Invalid pagination" });
    try { return await applicationRequest(path + "?page=" + query.data.page + "&per_page=" + query.data.per_page); }
    catch (error) {
      const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl.");
      return reply.code(e.statusCode).send({ error: "Pterodactyl request failed", message: e.message });
    }
  });
}
app.get("/api/overview", { preHandler: requireUser }, async (_request, reply) => {
  if (!pterodactylConfigured) return reply.code(503).send({ error: "Pterodactyl is not configured", message: "Set PTERODACTYL_URL and PTERODACTYL_APPLICATION_KEY on the API server." });
  try { return { ...(await getPanelSummary()), connection: "connected", source: "pterodactyl" }; }
  catch (error) {
    const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl.");
    return reply.code(e.statusCode).send({ error: "Pterodactyl connection failed", message: e.message });
  }
});
app.get("/api/servers", { preHandler: requireUser }, async (_request, reply) => {
  try { return await getServers(); }
  catch (error) {
    const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl.");
    return reply.code(e.statusCode).send({ error: "Unable to load servers", message: e.message });
  }
});
app.setErrorHandler((error, _request, reply) => { app.log.error(error); reply.code(500).send({ error: "Internal server error" }); });
try { await migrate(); await app.listen({ host: config.API_HOST, port: config.API_PORT }); }
catch (error) { app.log.error(error); process.exit(1); }
for (const signal of ["SIGINT","SIGTERM"] as const) process.on(signal, async () => { await app.close(); await pool?.end(); process.exit(0); });
