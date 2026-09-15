/**
 * CI probe round 2 — test steps added/touched by 5991c60.
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const LOG = join(process.cwd(), "debug-688129.log");
const ENDPOINT = "http://127.0.0.1:7418/ingest/a3d13dc6-6745-44ac-a4fd-f2bafc5169ae";

function emit(hypothesisId, location, message, data) {
  const payload = {
    sessionId: "688129",
    runId: "ci-probe-2",
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
  {
    id: "F",
    name: "deno-fuel-n17",
    cmd: "deno",
    args: ["test", "--allow-read", "--allow-env", "supabase/functions/_fleet-server/fuel_week_n17_pa.test.ts"],
  },
  {
    id: "G",
    name: "deno-fuel-phase4",
    cmd: "deno",
    args: [
      "test",
      "--allow-read",
      "--allow-env",
      "supabase/functions/_fleet-server/fuel_week_phase4_server_cats.test.ts",
    ],
  },
  {
    id: "F+G",
    name: "deno-fuel-rev3-full",
    cmd: "deno",
    args: [
      "test",
      "--allow-read",
      "--allow-env",
      "supabase/functions/_fleet-server/fuel_rev2_phase1_controls.test.ts",
      "supabase/functions/_fleet-server/fuel_nightly_statement_ledger.test.ts",
      "supabase/functions/_fleet-server/fuel_week_seal_h7.test.ts",
      "supabase/functions/_fleet-server/fuel_week_category_loader.test.ts",
      "supabase/functions/_fleet-server/fuel_week_category_loader_enforce.test.ts",
      "supabase/functions/_fleet-server/fuel_week_closable_gate_n12.test.ts",
      "supabase/functions/_fleet-server/fuel_week_n17_pa.test.ts",
      "supabase/functions/_fleet-server/fuel_week_phase4_server_cats.test.ts",
    ],
  },
  {
    id: "H",
    name: "fuel-core-test",
    cmd: "pnpm",
    args: ["--filter", "@roam/fuel-core", "test"],
  },
  {
    id: "H2",
    name: "fuel-core-typecheck",
    cmd: "pnpm",
    args: ["--filter", "@roam/fuel-core", "typecheck"],
  },
  {
    id: "I",
    name: "fleet-typecheck-money",
    cmd: "pnpm",
    args: ["--filter", "@roam/fleet", "typecheck:money"],
    env: {
      VITE_SUPABASE_URL: "https://ci-placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
    },
  },
  {
    id: "I2",
    name: "check-drivers",
    cmd: "pnpm",
    args: ["--filter", "@roam/fleet", "check:drivers"],
    env: {
      VITE_SUPABASE_URL: "https://ci-placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: "ci-placeholder-anon-key",
    },
  },
];

emit("setup", "ci-probe2:start", "Starting probe round 2", { stepCount: steps.length });

let firstFail = null;
for (const step of steps) {
  const r = spawnSync(step.cmd, step.args, {
    encoding: "utf8",
    env: { ...process.env, ...(step.env || {}) },
    maxBuffer: 8_000_000,
    shell: process.platform === "win32",
  });
  const ok = r.status === 0;
  const combined = ((r.stderr || "") + "\n" + (r.stdout || "")).replace(/\x1b\[[0-9;]*m/g, "");
  const tail = combined.slice(-1200);
  emit(step.id, `ci-probe2:${step.name}`, ok ? "step passed" : "step failed", {
    name: step.name,
    status: r.status,
    ok,
    tail,
  });
  console.log(ok ? "PASS" : "FAIL", step.name, "status=", r.status);
  if (!ok && !firstFail) firstFail = { name: step.name, status: r.status, tail };
}

emit("summary", "ci-probe2:end", firstFail ? "found failure" : "all green", { firstFail });
if (firstFail) {
  console.error("\nFIRST_FAIL:", firstFail.name);
  console.error(firstFail.tail);
  process.exit(1);
}
console.log("ALL_PROBE2_OK");
