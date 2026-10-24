import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export function randomToken(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function hashPassword(password: string) {
 const salt = randomBytes(16).toString("hex");
 const derived = await scrypt(password, salt, 64) as Buffer;
 return `scrypt:${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
 const [scheme, salt, expectedHex] = stored.split(":");
 // Validate the serialized hash before invoking scrypt; malformed DB data must fail closed.
 if (scheme !== "scrypt" || !salt || !expectedHex
   || !/^[0-9a-f]{32}$/.test(salt)
   || !/^[0-9a-f]{128}$/.test(expectedHex)) return false;
 const expected = Buffer.from(expectedHex, "hex");
 const actual = await scrypt(password, salt, expected.length) as Buffer;
 return actual.length === expected.length && timingSafeEqual(actual, expected);
}
