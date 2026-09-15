/**
 * Post-fix probe — verify fleet typecheck:money after FinalizedFuelReport PA field.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const LOG = join(process.cwd(), "debug-688129.log");
const ENDPOINT = "http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae";

function emit(hypothesisId, location, message, data) {
  const payload = {
    sessionId: "688129",
    runId: "post-fix",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  appendFileSync(LOG, JSON.stringify(payload) + "\n");
  fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "688129",
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

emit("H1", "postfix:start", "Starting typecheck:money verification", {
  fix: "personalAllowanceEarnedCost on FinalizedFuelReport",
});

const result = spawnSync("pnpm", ["--filter", "@roam/fleet", "typecheck:money"], {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
  env: process.env,
});

const stdout = (result.stdout || "").slice(-4000);
const stderr = (result.stderr || "").slice(-4000);
const combined = `${stdout}\n${stderr}`;
const hasPaError = /personalAllowanceEarnedCost/.test(combined);
const ok = result.status === 0;

emit("H1", "postfix:typecheck:money", ok ? "PASS" : "FAIL", {
  status: result.status,
  hasPaError,
  tail: combined.slice(-1500),
});

console.log(ok ? "POSTFIX_PASS" : "POSTFIX_FAIL", "status=", result.status, "hasPaError=", hasPaError);
if (!ok) {
  console.error(combined);
  process.exit(1);
}
