#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-http://127.0.0.1:3001}"
BASE_URL="${BASE_URL%/}"

if [[ ! "$BASE_URL" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$ ]]; then
  echo "Usage: $0 [http://127.0.0.1:3001]" >&2
  echo "Provide an HTTP(S) origin only (no path, query, credentials, or fragment)." >&2
  exit 2
fi
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required." >&2; exit 2; }

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

check_endpoint() {
  local path="$1"
  local expected="$2"
  local code
  code="$(curl --silent --show-error --max-time 8 --output "$TMP_BODY" --write-out '%{http_code}' "$BASE_URL$path")" || {
    echo "FAIL $path: request failed (is the API running and reachable?)" >&2
    return 1
  }

  if ! node - "$path" "$code" "$expected" "$TMP_BODY" <<'NODE'
const fs = require("node:fs");
const [path, rawCode, expected, file] = process.argv.slice(2);
const code = Number(rawCode);
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  console.error(`FAIL ${path}: response was not valid JSON (HTTP ${code})`);
  process.exit(1);
}
const fail = message => { console.error(`FAIL ${path}: ${message}`); process.exit(1); };
if (expected === "live") {
  if (code !== 200 || data.status !== "alive" || data.service !== "matrix-panel-api") {
    fail(`expected HTTP 200 and alive status; got HTTP ${code}, status=${String(data.status)}`);
  }
} else if (expected === "health") {
  if (![200, 503].includes(code) || !["ok", "degraded"].includes(data.status) ||
      !["connected", "unavailable", "not_configured"].includes(data.database)) {
    fail(`unexpected health response (HTTP ${code})`);
  }
  if ((data.status === "degraded") !== (code === 503)) fail("HTTP status does not match health state");
} else if (expected === "ready") {
  if (![200, 503].includes(code) || !["ready", "not_ready"].includes(data.status) ||
      !["connected", "unavailable", "not_configured"].includes(data.database)) {
    fail(`unexpected readiness response (HTTP ${code})`);
  }
  if ((code === 200 && (data.status !== "ready" || data.database !== "connected")) ||
      (code === 503 && data.status !== "not_ready")) {
    fail("HTTP status does not match readiness/dependency state");
  }
}
console.log(`PASS ${path}: HTTP ${code}, ${data.status}, database=${data.database ?? "n/a"}`);
NODE
  then
    return 1
  fi
}

check_endpoint "/api/live" "live"
check_endpoint "/api/health" "health"
check_endpoint "/api/ready" "ready"

echo "Smoke checks complete. A green result verifies HTTP health endpoints only; it does not prove Pterodactyl actions, console, file operations, or billing workflows."
