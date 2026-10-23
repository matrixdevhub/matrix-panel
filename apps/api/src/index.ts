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
import { clientRequest, decryptCredential, encryptCredential } from "./pterodactyl-client.js";

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

async function userClientToken(userId: string) {
  if (!pool) return null;
  const result = await pool.query("SELECT encrypted_token,iv,auth_tag FROM user_integrations WHERE user_id=$1", [userId]);
  if (!result.rowCount) return null;
  return decryptCredential(result.rows[0]);
}
app.get("/api/profile/pterodactyl-credential", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT updated_at FROM user_integrations WHERE user_id=$1", [request.sessionUser!.id]);
  return { connected: Boolean(result.rowCount), updated_at: result.rows[0]?.updated_at ?? null };
});
app.post("/api/profile/pterodactyl-credential", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({ apiKey: z.string().min(20).max(300) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Enter a valid Pterodactyl Client API key" });
  if (!config.CREDENTIAL_ENCRYPTION_KEY) return reply.code(503).send({ error: "Credential encryption is not configured on the server" });
  try { await clientRequest(parsed.data.apiKey, "/account"); }
  catch (error) {
    const e = error as { statusCode?: number; message?: string };
    return reply.code(e.statusCode ?? 502).send({ error: "Could not validate Pterodactyl Client API key", message: e.message ?? "Connection failed" });
  }
  const encrypted = encryptCredential(parsed.data.apiKey);
  await pool!.query("INSERT INTO user_integrations(user_id,encrypted_token,iv,auth_tag) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token,iv=EXCLUDED.iv,auth_tag=EXCLUDED.auth_tag,updated_at=NOW()",
    [request.sessionUser!.id, encrypted.encrypted_token, encrypted.iv, encrypted.auth_tag]);
  await audit(request.sessionUser!.id, "pterodactyl.client_key.connect", request, "integration", "pterodactyl");
  return { connected: true };
});
app.delete("/api/profile/pterodactyl-credential", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  await pool!.query("DELETE FROM user_integrations WHERE user_id=$1", [request.sessionUser!.id]);
  await audit(request.sessionUser!.id, "pterodactyl.client_key.disconnect", request, "integration", "pterodactyl");
  return { connected: false };
});
app.get("/api/profile/servers", { preHandler: requireUser }, async (request, reply) => {
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); }
  catch { return reply.code(503).send({ error: "Could not decrypt saved credentials. Check CREDENTIAL_ENCRYPTION_KEY." }); }
  if (!token) return reply.code(409).send({ error: "Connect your own Pterodactyl Client API key in profile settings first." });
  try {
    const response = await clientRequest<{ data: Array<{ attributes: Record<string, any> }> }>(token, "/servers");
    return { data: response.data.map(({ attributes: s }) => ({
      id: s.identifier, uuid: s.uuid, identifier: s.identifier, name: s.name,
      description: s.description ?? "", node: s.node ?? "—", ownerId: request.sessionUser!.id,
      status: s.is_suspended ? "suspended" : s.is_installing ? "installing" : (s.current_state ?? s.status ?? "unknown"),
      limits: { memory: s.limits?.memory ?? 0, disk: s.limits?.disk ?? 0, cpu: s.limits?.cpu ?? 0 }
    })) };
  } catch (error) {
    const e = error as { statusCode?: number; message?: string };
    return reply.code(e.statusCode ?? 502).send({ error: "Unable to load your servers", message: e.message ?? "Pterodactyl Client API failed" });
  }
});
app.post("/api/profile/servers/:identifier/power", { preHandler: requireUser }, async (request, reply) => {
  if (!originGuard(request, reply)) return;
  const params = z.object({ identifier: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(request.params);
  const body = z.object({ signal: z.enum(["start","stop","restart","kill"]) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid server or power signal" });
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); }
  catch { return reply.code(503).send({ error: "Could not decrypt saved credentials" }); }
  if (!token) return reply.code(409).send({ error: "Connect your Pterodactyl Client API key first" });
  try {
    await clientRequest(token, "/servers/" + params.data.identifier + "/power", "POST", { signal: body.data.signal });
    await audit(request.sessionUser!.id, "server.power." + body.data.signal, request, "server", params.data.identifier);
    return { ok: true, signal: body.data.signal };
  } catch (error) {
    const e = error as { statusCode?: number; message?: string };
    return reply.code(e.statusCode ?? 502).send({ error: "Server power action failed", message: e.message ?? "Pterodactyl Client API failed" });
  }
});
app.get("/api/profile/servers/:identifier/files", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ identifier: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(request.params);
  const query = z.object({ directory: z.string().max(1000).default("/") }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid server or directory" });
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); }
  catch { return reply.code(503).send({ error: "Could not decrypt saved credentials" }); }
  if (!token) return reply.code(409).send({ error: "Connect your Pterodactyl Client API key first" });
  try { return await clientRequest(token, "/servers/" + params.data.identifier + "/files/list?directory=" + encodeURIComponent(query.data.directory)); }
  catch (error) {
    const e = error as { statusCode?: number; message?: string };
    return reply.code(e.statusCode ?? 502).send({ error: "File listing failed", message: e.message ?? "Pterodactyl Client API failed" });
  }
});


const clientResourcePaths: Record<string, string> = {
  backups: "/backups", schedules: "/schedules", databases: "/databases",
  network: "/network/allocations", settings: "/settings", startup: "/startup", users: "/users"
};
app.get("/api/profile/servers/:identifier/:section", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ identifier: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/), section: z.string() }).safeParse(request.params);
  if (!params.success || !clientResourcePaths[params.data.section]) return reply.code(404).send({ error: "Unknown server resource" });
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); } catch { return reply.code(503).send({ error: "Could not decrypt saved credentials" }); }
  if (!token) return reply.code(409).send({ error: "Connect your Pterodactyl Client API key first" });
  try { return await clientRequest(token, "/servers/" + params.data.identifier + clientResourcePaths[params.data.section]); }
  catch (error) { const e = error as { statusCode?: number; message?: string }; return reply.code(e.statusCode ?? 502).send({ error: "Could not load server resource", message: e.message ?? "Pterodactyl Client API failed" }); }
});
app.get("/api/profile/servers/:identifier/files/contents", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ identifier: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(request.params);
  const query = z.object({ file: z.string().min(1).max(1000) }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid file path" });
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); } catch { return reply.code(503).send({ error: "Could not decrypt saved credentials" }); }
  if (!token) return reply.code(409).send({ error: "Connect your Pterodactyl Client API key first" });
  try { return await clientRequest<string>(token, "/servers/" + params.data.identifier + "/files/contents?file=" + encodeURIComponent(query.data.file)); }
  catch (error) { const e = error as { statusCode?: number; message?: string }; return reply.code(e.statusCode ?? 502).send({ error: "Could not read file", message: e.message ?? "Pterodactyl Client API failed" }); }
});
app.put("/api/profile/servers/:identifier/files/contents", { preHandler: requireUser }, async (request, reply) => {
  if (!originGuard(request, reply)) return;
  const params = z.object({ identifier: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(request.params);
  const query = z.object({ file: z.string().min(1).max(1000) }).safeParse(request.query);
  const body = z.object({ content: z.string().max(2_000_000) }).safeParse(request.body);
  if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "Invalid file update" });
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); } catch { return reply.code(503).send({ error: "Could not decrypt saved credentials" }); }
  if (!token) return reply.code(409).send({ error: "Connect your Pterodactyl Client API key first" });
  try {
    await clientRequest(token, "/servers/" + params.data.identifier + "/files/write?file=" + encodeURIComponent(query.data.file), "POST", body.data.content);
    await audit(request.sessionUser!.id, "server.file.write", request, "server", params.data.identifier);
    return { ok: true };
  } catch (error) { const e = error as { statusCode?: number; message?: string }; return reply.code(e.statusCode ?? 502).send({ error: "Could not write file", message: e.message ?? "Pterodactyl Client API failed" }); }
});
app.post("/api/profile/servers/:identifier/backups", { preHandler: requireUser }, async (request, reply) => {
  if (!originGuard(request, reply)) return;
  const params = z.object({ identifier: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/) }).safeParse(request.params);
  const body = z.object({ name: z.string().max(100).optional() }).safeParse(request.body ?? {});
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid backup request" });
  let token: string | null;
  try { token = await userClientToken(request.sessionUser!.id); } catch { return reply.code(503).send({ error: "Could not decrypt saved credentials" }); }
  if (!token) return reply.code(409).send({ error: "Connect your Pterodactyl Client API key first" });
  try {
    const result = await clientRequest(token, "/servers/" + params.data.identifier + "/backups", "POST", body.data);
    await audit(request.sessionUser!.id, "server.backup.create", request, "server", params.data.identifier);
    return reply.code(201).send(result);
  } catch (error) { const e = error as { statusCode?: number; message?: string }; return reply.code(e.statusCode ?? 502).send({ error: "Could not create backup", message: e.message ?? "Pterodactyl Client API failed" }); }
});

app.get("/api/overview", { preHandler: requireAdmin }, async (_request, reply) => {
  if (!pterodactylConfigured) return reply.code(503).send({ error: "Pterodactyl is not configured", message: "Set PTERODACTYL_URL and PTERODACTYL_APPLICATION_KEY on the API server." });
  try { return { ...(await getPanelSummary()), connection: "connected", source: "pterodactyl" }; }
  catch (error) {
    const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl.");
    return reply.code(e.statusCode).send({ error: "Pterodactyl connection failed", message: e.message });
  }
});
app.get("/api/servers", { preHandler: requireAdmin }, async (_request, reply) => {
  try { return await getServers(); }
  catch (error) {
    const e = error instanceof PterodactylError ? error : new PterodactylError("Could not reach Pterodactyl.");
    return reply.code(e.statusCode).send({ error: "Unable to load servers", message: e.message });
  }
});
app.get("/api/plans", async (_request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT plan_key,name,description,memory_mb,disk_mb,cpu_percent,price_cents FROM plans WHERE is_active=TRUE ORDER BY price_cents ASC");
  return { data: result.rows };
});
app.get("/api/admin/plans", { preHandler: requireAdmin }, async (_request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT * FROM plans ORDER BY id DESC");
  return { data: result.rows };
});
app.post("/api/admin/plans", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({
    plan_key: z.string().min(2).max(40).regex(/^[a-z0-9_-]+$/),
    name: z.string().min(2).max(80), description: z.string().max(500).default(""),
    memory_mb: z.number().int().positive().max(1048576), disk_mb: z.number().int().positive().max(10485760),
    cpu_percent: z.number().int().positive().max(10000), price_cents: z.number().int().min(0).max(100000000),
    is_active: z.boolean().default(true)
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid plan data", details: parsed.error.flatten().fieldErrors });
  const p = parsed.data;
  try {
    const result = await pool!.query("INSERT INTO plans(plan_key,name,description,memory_mb,disk_mb,cpu_percent,price_cents,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [p.plan_key,p.name,p.description,p.memory_mb,p.disk_mb,p.cpu_percent,p.price_cents,p.is_active]);
    await audit(request.sessionUser!.id, "plans.create", request, "plan", p.plan_key);
    return reply.code(201).send({ data: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "That plan key already exists" });
    throw error;
  }
});
app.patch("/api/admin/plans/:id", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  const body = z.object({
    name: z.string().min(2).max(80).optional(), description: z.string().max(500).optional(),
    memory_mb: z.number().int().positive().max(1048576).optional(), disk_mb: z.number().int().positive().max(10485760).optional(),
    cpu_percent: z.number().int().positive().max(10000).optional(), price_cents: z.number().int().min(0).max(100000000).optional(),
    is_active: z.boolean().optional()
  }).strict().safeParse(request.body);
  if (!params.success || !body.success || !Object.keys(body.data).length) return reply.code(400).send({ error: "Invalid plan update" });
  const keys = Object.keys(body.data) as Array<keyof typeof body.data>;
  const values = keys.map(key => body.data[key]);
  const sets = keys.map((key, i) => key + "=$" + (i + 1));
  sets.push("updated_at=NOW()");
  values.push(params.data.id as never);
  const result = await pool!.query("UPDATE plans SET " + sets.join(",") + " WHERE id=$" + values.length + " RETURNING *", values);
  if (!result.rowCount) return reply.code(404).send({ error: "Plan not found" });
  await audit(request.sessionUser!.id, "plans.update", request, "plan", String(params.data.id));
  return { data: result.rows[0] };
});

app.post("/api/admin/redeem-codes", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({
    plan_key: z.string().min(2).max(40), duration_days: z.number().int().min(1).max(3650),
    max_uses: z.number().int().min(1).max(100000).default(1),
    expires_at: z.string().datetime().optional()
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid redeem-code data" });
  const plan = await pool!.query("SELECT plan_key FROM plans WHERE plan_key=$1 AND is_active=TRUE", [parsed.data.plan_key]);
  if (!plan.rowCount) return reply.code(400).send({ error: "Choose an active plan first" });
  const code = randomToken(18).toUpperCase();
  await pool!.query("INSERT INTO redeem_codes(code_hash,plan_key,duration_days,max_uses,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6)",
    [hashToken(code), parsed.data.plan_key, parsed.data.duration_days, parsed.data.max_uses, parsed.data.expires_at ?? null, request.sessionUser!.id]);
  await audit(request.sessionUser!.id, "redeem_code.create", request, "plan", parsed.data.plan_key);
  return reply.code(201).send({ code, plan_key: parsed.data.plan_key, duration_days: parsed.data.duration_days, max_uses: parsed.data.max_uses });
});
app.post("/api/redeem", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const parsed = z.object({ code: z.string().min(8).max(100) }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Enter a valid redeem code" });
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const codeHash = hashToken(parsed.data.code.trim().toUpperCase());
    const found = await client.query("SELECT * FROM redeem_codes WHERE code_hash=$1 FOR UPDATE", [codeHash]);
    const code = found.rows[0];
    if (!code || code.uses >= code.max_uses || (code.expires_at && new Date(code.expires_at).getTime() <= Date.now())) {
      await client.query("ROLLBACK");
      return reply.code(400).send({ error: "This code is invalid, expired or already used" });
    }
    const start = await client.query("SELECT GREATEST(NOW(),COALESCE(MAX(expires_at),NOW())) AS starts_at FROM user_plans WHERE user_id=$1 AND plan_key=$2 AND expires_at>NOW()",
      [request.sessionUser!.id, code.plan_key]);
    const startsAt = start.rows[0].starts_at;
    const grant = await client.query("INSERT INTO user_plans(user_id,plan_key,starts_at,expires_at,source) VALUES($1,$2,$3,$3+($4::text||' days')::interval,'redeem') RETURNING plan_key,starts_at,expires_at",
      [request.sessionUser!.id, code.plan_key, startsAt, code.duration_days]);
    await client.query("UPDATE redeem_codes SET uses=uses+1 WHERE id=$1", [code.id]);
    await client.query("COMMIT");
    await audit(request.sessionUser!.id, "redeem_code.activate", request, "plan", code.plan_key);
    return { ok: true, plan: grant.rows[0] };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
app.get("/api/profile/plans", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT up.id,up.plan_key,p.name,p.memory_mb,p.disk_mb,p.cpu_percent,up.starts_at,up.expires_at,up.source FROM user_plans up LEFT JOIN plans p ON p.plan_key=up.plan_key WHERE up.user_id=$1 ORDER BY up.expires_at DESC",
    [request.sessionUser!.id]);
  return { data: result.rows };
});
app.get("/api/profile/balance", { preHandler: requireUser }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT balance_cents,updated_at FROM balances WHERE user_id=$1", [request.sessionUser!.id]);
  return result.rows[0] ?? { balance_cents: 0 };
});
app.get("/api/admin/balances", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const result = await pool!.query("SELECT u.id,u.username,u.email,COALESCE(b.balance_cents,0) AS balance_cents FROM users u LEFT JOIN balances b ON b.user_id=u.id ORDER BY u.id DESC LIMIT 100");
  return { data: result.rows };
});
app.post("/api/admin/balances/:userId/adjust", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const params = z.object({ userId: z.coerce.number().int().positive() }).safeParse(request.params);
  const body = z.object({ amount_cents: z.number().int().min(-100000000).max(100000000).refine(n => n !== 0), reason: z.string().min(3).max(250) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid balance adjustment" });
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO balances(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [params.data.userId]);
    const current = await client.query("SELECT balance_cents FROM balances WHERE user_id=$1 FOR UPDATE", [params.data.userId]);
    if (!current.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "User not found" }); }
    const next = Number(current.rows[0].balance_cents) + body.data.amount_cents;
    if (next < 0) { await client.query("ROLLBACK"); return reply.code(400).send({ error: "Balance cannot become negative" }); }
    await client.query("UPDATE balances SET balance_cents=$1,updated_at=NOW() WHERE user_id=$2", [next, params.data.userId]);
    await client.query("INSERT INTO balance_transactions(user_id,amount_cents,reason,actor_user_id) VALUES($1,$2,$3,$4)", [params.data.userId, body.data.amount_cents, body.data.reason, request.sessionUser!.id]);
    await client.query("COMMIT");
    await audit(request.sessionUser!.id, "balance.adjust", request, "user", String(params.data.userId));
    return { user_id: params.data.userId, balance_cents: next };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});


app.patch("/api/admin/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  const body = z.object({ role: z.enum(["admin","user"]).optional(), is_active: z.boolean().optional() }).strict().safeParse(request.body);
  if (!params.success || !body.success || !Object.keys(body.data).length) return reply.code(400).send({ error: "Invalid user update" });
  if (String(params.data.id) === request.sessionUser!.id && (body.data.role === "user" || body.data.is_active === false)) return reply.code(400).send({ error: "You cannot disable or demote your own active session" });
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT id,role,is_active FROM users WHERE id=$1 FOR UPDATE", [params.data.id]);
    if (!found.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "User not found" }); }
    const current = found.rows[0];
    if (current.role === "admin" && current.is_active && (body.data.role === "user" || body.data.is_active === false)) {
      const admins = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND is_active=TRUE");
      if (admins.rows[0].count <= 1) { await client.query("ROLLBACK"); return reply.code(409).send({ error: "The last active administrator cannot be demoted or disabled" }); }
    }
    const updated = await client.query("UPDATE users SET role=$1,is_active=$2,updated_at=NOW() WHERE id=$3 RETURNING id,email,username,role,is_active,created_at", [body.data.role ?? current.role, body.data.is_active ?? current.is_active, params.data.id]);
    if (body.data.is_active === false) await client.query("DELETE FROM sessions WHERE user_id=$1", [params.data.id]);
    await client.query("COMMIT");
    await audit(request.sessionUser!.id, "users.update", request, "user", String(params.data.id));
    return { data: updated.rows[0] };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
app.get("/api/admin/settings", { preHandler: requireAdmin }, async (_request, reply) => {
  if (!dbRequired(reply)) return;
  const rows = await pool!.query("SELECT setting_key,setting_value,updated_at FROM panel_settings ORDER BY setting_key");
  return { data: rows.rows };
});
app.put("/api/admin/settings/:key", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const params = z.object({ key: z.string().min(2).max(64).regex(/^[a-z0-9_.-]+$/) }).safeParse(request.params);
  const body = z.object({ value: z.unknown() }).strict().safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid setting" });
  const allowed = new Set(["site.name","site.description","registration.enabled","support.url","links.discord","links.youtube","links.website"]);
  if (!allowed.has(params.data.key)) return reply.code(400).send({ error: "This setting key is not editable through this endpoint" });
  const value = JSON.stringify(body.data.value);
  if (value.length > 4000) return reply.code(413).send({ error: "Setting value is too large" });
  const result = await pool!.query("INSERT INTO panel_settings(setting_key,setting_value,updated_by) VALUES($1,$2::jsonb,$3) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING setting_key,setting_value,updated_at", [params.data.key,value,request.sessionUser!.id]);
  await audit(request.sessionUser!.id, "settings.update", request, "setting", params.data.key);
  return { data: result.rows[0] };
});



app.patch("/api/admin/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
  const body = z.object({ role: z.enum(["admin","user"]).optional(), is_active: z.boolean().optional() }).strict().safeParse(request.body);
  if (!params.success || !body.success || !Object.keys(body.data).length) return reply.code(400).send({ error: "Invalid user update" });
  if (String(params.data.id) === request.sessionUser!.id && (body.data.role === "user" || body.data.is_active === false)) return reply.code(400).send({ error: "You cannot disable or demote your own active session" });
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT id,role,is_active FROM users WHERE id=$1 FOR UPDATE", [params.data.id]);
    if (!found.rowCount) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "User not found" }); }
    const current = found.rows[0];
    if (current.role === "admin" && current.is_active && (body.data.role === "user" || body.data.is_active === false)) {
      const admins = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND is_active=TRUE");
      if (admins.rows[0].count <= 1) { await client.query("ROLLBACK"); return reply.code(409).send({ error: "The last active administrator cannot be demoted or disabled" }); }
    }
    const updated = await client.query("UPDATE users SET role=$1,is_active=$2,updated_at=NOW() WHERE id=$3 RETURNING id,email,username,role,is_active,created_at", [body.data.role ?? current.role, body.data.is_active ?? current.is_active, params.data.id]);
    if (body.data.is_active === false) await client.query("DELETE FROM sessions WHERE user_id=$1", [params.data.id]);
    await client.query("COMMIT");
    await audit(request.sessionUser!.id, "users.update", request, "user", String(params.data.id));
    return { data: updated.rows[0] };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
app.get("/api/admin/settings", { preHandler: requireAdmin }, async (_request, reply) => {
  if (!dbRequired(reply)) return;
  const rows = await pool!.query("SELECT setting_key,setting_value,updated_at FROM panel_settings ORDER BY setting_key");
  return { data: rows.rows };
});
app.put("/api/admin/settings/:key", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply) || !originGuard(request, reply)) return;
  const params = z.object({ key: z.string().min(2).max(64).regex(/^[a-z0-9_.-]+$/) }).safeParse(request.params);
  const body = z.object({ value: z.unknown() }).strict().safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid setting" });
  const allowed = new Set(["site.name","site.description","registration.enabled","support.url","links.discord","links.youtube","links.website"]);
  if (!allowed.has(params.data.key)) return reply.code(400).send({ error: "This setting key is not editable through this endpoint" });
  const value = JSON.stringify(body.data.value);
  if (value.length > 4000) return reply.code(413).send({ error: "Setting value is too large" });
  const result = await pool!.query("INSERT INTO panel_settings(setting_key,setting_value,updated_by) VALUES($1,$2::jsonb,$3) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING setting_key,setting_value,updated_at", [params.data.key,value,request.sessionUser!.id]);
  await audit(request.sessionUser!.id, "settings.update", request, "setting", params.data.key);
  return { data: result.rows[0] };
});


app.get("/api/admin/redeem-codes", { preHandler: requireAdmin }, async (request, reply) => {
  if (!dbRequired(reply)) return;
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid limit" });
  const result = await pool!.query("SELECT id,plan_key,duration_days,max_uses,uses,expires_at,created_at FROM redeem_codes ORDER BY id DESC LIMIT $1", [parsed.data.limit]);
  return { data: result.rows };
});

app.setErrorHandler((error, _request, reply) => { app.log.error(error); reply.code(500).send({ error: "Internal server error" }); });
try { await migrate(); await app.listen({ host: config.API_HOST, port: config.API_PORT }); }
catch (error) { app.log.error(error); process.exit(1); }
for (const signal of ["SIGINT","SIGTERM"] as const) process.on(signal, async () => { await app.close(); await pool?.end(); process.exit(0); });
