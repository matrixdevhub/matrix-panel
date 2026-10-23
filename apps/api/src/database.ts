import pg from "pg";
import { config } from "./config.js";
export const pool = config.DATABASE_URL ? new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000 }) : null;
export async function migrate() {
 if (!pool) return;
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users (id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS sessions (id BIGSERIAL PRIMARY KEY,token_hash CHAR(64) NOT NULL UNIQUE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
 CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
 CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY,actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,target_type TEXT,target_id TEXT,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,ip_address INET,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
 CREATE TABLE IF NOT EXISTS user_preferences (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,theme TEXT NOT NULL DEFAULT 'dark',notification_sound BOOLEAN NOT NULL DEFAULT TRUE,about TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS plans (id BIGSERIAL PRIMARY KEY,plan_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',memory_mb INTEGER NOT NULL CHECK(memory_mb>0),disk_mb INTEGER NOT NULL CHECK(disk_mb>0),cpu_percent INTEGER NOT NULL CHECK(cpu_percent>0),price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents>=0),is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS redeem_codes (id BIGSERIAL PRIMARY KEY,code_hash CHAR(64) NOT NULL UNIQUE,plan_key TEXT NOT NULL,duration_days INTEGER NOT NULL CHECK(duration_days>0),max_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_uses>0),uses INTEGER NOT NULL DEFAULT 0 CHECK(uses>=0),expires_at TIMESTAMPTZ,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS user_plans (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,plan_key TEXT NOT NULL,starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,source TEXT NOT NULL DEFAULT 'admin',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS balances (user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,balance_cents BIGINT NOT NULL DEFAULT 0 CHECK(balance_cents>=0),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS balance_transactions (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,amount_cents BIGINT NOT NULL,reason TEXT NOT NULL,actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 `);
}
