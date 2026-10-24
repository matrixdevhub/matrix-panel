import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, hashToken, randomToken, verifyPassword } from "./security.js";

test("randomToken creates URL-safe tokens of the requested byte length", () => {
  const token = randomToken(24);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.ok(token.length >= 30);
  assert.notEqual(token, randomToken(24));
});

test("hashToken is deterministic and does not return the original token", () => {
  const first = hashToken("example-session-token");
  assert.equal(first, hashToken("example-session-token"));
  assert.notEqual(first, hashToken("different-token"));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, "example-session-token");
});

test("password hashes verify correct passwords and reject incorrect passwords", async () => {
  const stored = await hashPassword("a-long-test-password");
  assert.equal(await verifyPassword("a-long-test-password", stored), true);
  assert.equal(await verifyPassword("a-different-password", stored), false);
  assert.match(stored, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
});

test("malformed stored password hashes fail closed without throwing", async () => {
  for (const stored of [
    "",
    "bcrypt:salt:hash",
    "scrypt::",
    "scrypt:xyz:abcd",
    `scrypt:${"a".repeat(32)}:not-hex`,
    `scrypt:${"a".repeat(32)}:${"a".repeat(127)}`,
    `scrypt:${"a".repeat(32)}:${"a".repeat(130)}`
  ]) {
    assert.equal(await verifyPassword("any-password", stored), false, stored);
  }
});
