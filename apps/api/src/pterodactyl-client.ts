import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

function encryptionKey() {
  if (!config.CREDENTIAL_ENCRYPTION_KEY) throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(config.CREDENTIAL_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}
export function encryptCredential(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return { encrypted_token: encrypted.toString("base64"), iv: iv.toString("base64"), auth_tag: cipher.getAuthTag().toString("base64") };
}
export function decryptCredential(record: { encrypted_token: string; iv: string; auth_tag: string }) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(record.encrypted_token, "base64")), decipher.final()]).toString("utf8");
}
export async function clientRequest<T = unknown>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  if (!config.PTERODACTYL_URL) throw Object.assign(new Error("PTERODACTYL_URL is not configured"), { statusCode: 503 });
  const response = await fetch(config.PTERODACTYL_URL.replace(/\/+$/, "") + "/api/client" + path, {
    method,
    headers: { Authorization: "Bearer " + token, Accept: "Application/vnd.pterodactyl.v1+json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    const statusCode = response.status === 401 || response.status === 403 ? 403 : response.status === 404 ? 404 : response.status >= 500 ? 502 : response.status;
    const message = response.status === 401 || response.status === 403 ? "Pterodactyl rejected this user's Client API key or server permission." : response.status === 404 ? "Pterodactyl server or endpoint was not found." : "Pterodactyl Client API request failed (HTTP " + response.status + ").";
    throw Object.assign(new Error(message), { statusCode });
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}
