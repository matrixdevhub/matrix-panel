import assert from "node:assert/strict";
import test from "node:test";
import { InvalidServerPathError, normalizeServerPath } from "./server-path-security.js";

test("normalizes root, relative, and absolute server paths", () => {
  assert.equal(normalizeServerPath("/", { allowRoot: true }), "/");
  assert.equal(normalizeServerPath("plugins"), "/plugins");
  assert.equal(normalizeServerPath("/plugins/example.jar"), "/plugins/example.jar");
  assert.equal(normalizeServerPath("//plugins///example.jar"), "/plugins/example.jar");
});

test("rejects traversal segments instead of silently rewriting them", () => {
  assert.throws(() => normalizeServerPath("../etc/passwd"), InvalidServerPathError);
  assert.throws(() => normalizeServerPath("/plugins/../../etc/passwd"), InvalidServerPathError);
  assert.throws(() => normalizeServerPath("/plugins/./example.jar"), InvalidServerPathError);
});

test("rejects Windows separators and control characters", () => {
  assert.throws(() => normalizeServerPath("plugins\\..\\secrets"), InvalidServerPathError);
  assert.throws(() => normalizeServerPath("/plugins/evil\u0000.jar"), InvalidServerPathError);
  assert.throws(() => normalizeServerPath("/plugins/line\nfeed.jar"), InvalidServerPathError);
});

test("requires a non-root path for file reads and writes", () => {
  assert.throws(() => normalizeServerPath("/"), InvalidServerPathError);
  assert.throws(() => normalizeServerPath(""), InvalidServerPathError);
});
