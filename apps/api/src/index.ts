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
