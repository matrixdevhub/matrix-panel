import assert from "node:assert/strict";
import test from "node:test";
import { normalizeClientServer, normalizePowerSignal } from "./pterodactyl-server-data.js";

const sample = {
  id: 12,
  identifier: "abc123",
  uuid: "server-uuid",
  name: "Survival",
  description: null,
  node: 2,
  limits: { memory: 4096, disk: 20480, cpu: 200 },
};

test("maps real Pterodactyl server metadata and live state into panel data", () => {
  assert.deepEqual(normalizeClientServer(sample, "user-1", "running"), {
    id: "abc123",
    uuid: "server-uuid",
    identifier: "abc123",
    name: "Survival",
    description: "",
    node: 2,
    ownerId: "user-1",
    status: "running",
    limits: { memory: 4096, disk: 20480, cpu: 200 },
  });
});

test("suspended and installing states take priority over live state", () => {
  assert.equal(normalizeClientServer({ ...sample, is_suspended: true }, "u", "running").status, "suspended");
  assert.equal(normalizeClientServer({ ...sample, is_installing: true }, "u", "offline").status, "installing");
});

test("uses unknown when the panel does not provide a status", () => {
  assert.equal(normalizeClientServer(sample, "u").status, "unknown");
});

test("allows only start, stop, and restart power signals", () => {
  assert.equal(normalizePowerSignal("start"), "start");
  assert.equal(normalizePowerSignal("stop"), "stop");
  assert.equal(normalizePowerSignal("restart"), "restart");
  assert.equal(normalizePowerSignal("kill"), null);
  assert.equal(normalizePowerSignal("shutdown"), null);
  assert.equal(normalizePowerSignal(undefined), null);
});
