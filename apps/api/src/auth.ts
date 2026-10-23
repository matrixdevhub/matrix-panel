import type { FastifyReply, FastifyRequest } from "fastify";
import { pool } from "./database.js";
import { hashToken } from "./security.js";
export type SessionUser = { id: string; email: string; username: string; role: "admin" | "user" };
declare module "fastify" { interface FastifyRequest { sessionUser: SessionUser | null } }
export async function authenticate(request: FastifyRequest) {
 request.sessionUser = null;
 const token = request.cookies?.matrix_session;
 if (!token || !pool) return;
 const result = await pool.query("SELECT u.id,u.email,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=TRUE LIMIT 1", [hashToken(token)]);
 if (result.rowCount) request.sessionUser = result.rows[0] as SessionUser;
}
export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
 if (!request.sessionUser) return reply.code(401).send({ error: "Authentication required" });
}
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
 if (!request.sessionUser) return reply.code(401).send({ error: "Authentication required" });
 if (request.sessionUser.role !== "admin") return reply.code(403).send({ error: "Administrator access required" });
}
