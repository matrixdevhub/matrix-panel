import assert from "node:assert/strict";
import test from "node:test";
import { validateConsoleWebSocketUrl } from "./console-websocket-security.js";

test("allows secure console WebSocket URLs in production", () => {
  assert.equal(
    validateConsoleWebSocketUrl("wss://node.example.test/socket", "production").protocol,
    "wss:"
  );
});

test("allows insecure WebSocket URLs only outside production", () => {
  assert.equal(
    validateConsoleWebSocketUrl("ws://localhost:8080/socket", "development").protocol,
    "ws:"
  );
  assert.throws(
    () => validateConsoleWebSocketUrl("ws://node.example.test/socket", "production"),
    /Invalid upstream console URL/
  );
});

test("rejects non-WebSocket protocols", () => {
  assert.throws(
    () => validateConsoleWebSocketUrl("https://node.example.test/socket", "development"),
    /Invalid upstream console URL/
  );
});

test("rejects URLs with embedded credentials", () => {
  assert.throws(
    () => validateConsoleWebSocketUrl("wss://user:password@node.example.test/socket", "production"),
    /Invalid upstream console URL/
  );
});

test("rejects malformed URLs", () => {
  assert.throws(
    () => validateConsoleWebSocketUrl("not a URL", "production"),
    /Invalid upstream console URL/
  );
});
