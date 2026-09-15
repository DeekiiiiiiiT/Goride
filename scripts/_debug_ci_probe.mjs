/**
 * Local CI step probe — logs which step fails for debug session 688129.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const LOG = join(process.cwd(), "debug-688129.log");
const ENDPOINT = "http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae";

function emit(hypothesisId, location, message, data) {
  const payload = {
    sessionId: "688129",
    runId: "ci-probe-1",
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

const steps = [
  { id: "A", name: "validate-migration-sql", cmd: "node", args: ["scripts/validate-migration-sql.mjs"] },
  { id: "B", name: "check-courier-fleet-stamp", cmd: "node", args: ["scripts/check-courier-fleet-stamp.mjs"] },
  { id: "D", name: "check-remittance-separation", cmd: "node", args: ["scripts/check-remittance-separation.mjs"], env: { REMITTANCE_S6_DIFF: "1" } },
  { id: "D2", name: "check-fleet-edge-duplicates", cmd: "node", args: ["scripts/check-fleet-edge-duplicates.mjs"] },
  {
    id: "C",
    name: "deno-check-fuel-period",
    cmd: "deno",
    args: [
      "check",
      "supabase/functions/_fleet-server/fuel_week_engine.ts",
      "supabase/functions/_fleet-server/fuel_period_routes.ts",
    ],
  },
  {
    id: "E",
    name: "deno-test-remittance",
    cmd: "deno",
    args: [
      "test",
      "--allow-read",
      "--allow-env",
      "supabase/functions/delivery/remittance/money.test.ts",
      "supabase/functions/delivery/remittance/writeOffRemittance.test.ts",
      "supabase/functions/delivery/remittance/reverseWriteOff.test.ts",
    ],
  },
];

emit("setup", "ci-probe.mjs:start", "Starting CI probe", { stepCount: steps.length });

let firstFail = null;
for (const step of steps) {
  const r = spawnSync(step.cmd, step.args, {
    encoding: "utf8",
    env: { ...process.env, ...(step.env || {}) },
    maxBuffer: 5_000_000,
  });
  const ok = r.status === 0;
  const tail = ((r.stderr || "") + "\n" + (r.stdout || "")).slice(-800);
  emit(step.id, `ci-probe.mjs:${step.name}`, ok ? "step passed" : "step failed", {
    name: step.name,
    status: r.status,
    ok,
    tail,
  });
  if (!ok && !firstFail) firstFail = { name: step.name, status: r.status, tail };
}

emit("summary", "ci-probe.mjs:end", firstFail ? "CI probe found failure" : "CI probe all green", {
  firstFail,
});

if (firstFail) {
  console.error("FIRST_FAIL:", firstFail.name);
  console.error(firstFail.tail);
  process.exit(1);
}
console.log("ALL_PROBE_STEPS_OK");
