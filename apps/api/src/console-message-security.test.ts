import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConsoleCommandMessage } from "./console-message-security.js";

test("accepts a single valid console command and emits a canonical message", () => {
  assert.equal(
    normalizeConsoleCommandMessage(JSON.stringify({ event: "send command", args: ["say hello"] })),
    JSON.stringify({ event: "send command", args: ["say hello"] })
  );
});

test("rejects unsupported events, malformed JSON, and invalid argument shapes", () => {
  assert.equal(normalizeConsoleCommandMessage("not json"), null);
  assert.equal(normalizeConsoleCommandMessage(JSON.stringify({ event: "auth", args: ["forged"] })), null);
  assert.equal(normalizeConsoleCommandMessage(JSON.stringify({ event: "send command", args: [] })), null);
  assert.equal(normalizeConsoleCommandMessage(JSON.stringify({ event: "send command", args: ["say", "hello"] })), null);
});

test("rejects empty, oversized, and multiline commands", () => {
  assert.equal(normalizeConsoleCommandMessage(JSON.stringify({ event: "send command", args: ["  "] })), null);
  assert.equal(normalizeConsoleCommandMessage(JSON.stringify({ event: "send command", args: ["say a\nb"] })), null);
  assert.equal(normalizeConsoleCommandMessage(JSON.stringify({ event: "send command", args: ["x".repeat(5001)] })), null);
  assert.equal(normalizeConsoleCommandMessage("x".repeat(10001)), null);
});
