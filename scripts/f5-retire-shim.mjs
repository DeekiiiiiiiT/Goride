#!/usr/bin/env node
/**
 * F5 Phase 7 — retire make-server-37f42386 after soak is green.
 *
 * Guards (unless --force):
 *   1. check-shim-traffic --days 7 exits 0
 *   2. docs/f5-soak-log.json has 7 consecutive ok:true rows ending today or yesterday UTC
 *   3. f5-external-callers-check (inventory cleared + no inventory shimPathSuffix in soak offenders)
 *      — --force still skips 1–2 but NEVER skips external callers (data-loss path)
 *
 * Updates extraction-status shim:null, deploy wiring, and D15 note (fleet-core
 * stays out of FLEET_SLUGS — residual home; comparing it to the residual
 * registrar would false-positive 100%).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOAK_LOG = path.join(ROOT, "docs/f5-soak-log.json");
const force = process.argv.includes("--force");
const NEED = 7;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: true });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status ?? 1;
}

function utcDateOffset(daysBack) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** Require NEED consecutive ok days ending on today or yesterday UTC. */
function assertSoakStreak() {
  if (!fs.existsSync(SOAK_LOG)) {
    throw new Error(`Missing ${path.relative(ROOT, SOAK_LOG)} — run check-shim-traffic --append-log`);
  }
  const doc = JSON.parse(fs.readFileSync(SOAK_LOG, "utf8"));
  const days = Array.isArray(doc.days) ? doc.days : [];
  const byDate = new Map(days.map((d) => [d.date, d]));

  const endCandidates = [utcDateOffset(0), utcDateOffset(1)];
  let streakEnd = null;
  for (const end of endCandidates) {
    const endMs = Date.parse(`${end}T00:00:00.000Z`);
    const streakDates = [];
    for (let i = NEED - 1; i >= 0; i--) {
      const ds = new Date(endMs);
      ds.setUTCDate(ds.getUTCDate() - i);
      streakDates.push(ds.toISOString().slice(0, 10));
    }
    if (
      streakDates.every((date) => {
        const row = byDate.get(date);
        return row && row.ok === true;
      })
    ) {
      streakEnd = end;
      break;
    }
  }

  if (!streakEnd) {
    const recent = days.slice(-10);
    console.error("Soak log streak check failed. Recent rows:");
    for (const r of recent) {
      console.error(`  ${r.date}  ok=${r.ok}  nonHealth=${r.nonHealth}`);
    }
    throw new Error(
      `Need ${NEED} consecutive ok:true days in f5-soak-log.json ending today or yesterday UTC`,
    );
  }
  console.log(`ok  soak log: ${NEED} consecutive green days ending ${streakEnd}`);
}

if (!force) {
  console.log("Precheck: check-shim-traffic --days 7");
  const st = run("node", ["scripts/check-shim-traffic.mjs", "--days", "7"]);
  if (st !== 0) {
    console.error("Abort: shim still has non-health traffic in 7-day window (pass --force to override).");
    process.exit(st);
  }
  try {
    assertSoakStreak();
  } catch (e) {
    console.error(`Abort: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
} else {
  console.warn("WARNING: --force skips traffic + soak-log guards (NOT external callers)");
}

console.log("Precheck: f5-external-callers-check");
{
  const ext = run("node", ["scripts/f5-external-callers-check.mjs"]);
  if (ext !== 0) {
    console.error(
      "Abort: external callers not clear (Uber webhook / inventory). Never skipped by --force.",
    );
    process.exit(ext);
  }
}

{
  const p = path.join(ROOT, "scripts/generate-extraction-status.mjs");
  let t = fs.readFileSync(p, "utf8");
  if (!t.includes("shim: null")) {
    t = t.replace(/shim:\s*"make-server-37f42386"/, "shim: null");
    fs.writeFileSync(p, t);
  }
  console.log("generate-extraction-status: shim null");
}

{
  const p = path.join(ROOT, "scripts/check-edge-manifest-overlap.mjs");
  let t = fs.readFileSync(p, "utf8");
  t = t.replace(
    /note D15: fleet-core excluded \(intentional dual-serve with make-server-37f42386 during soak\)/,
    "note D15: fleet-core excluded (residual home; make-server-37f42386 retired)",
  );
  t = t.replace(
    /note D15: fleet-core excluded \(residual home; make-server-37f42386 retired\)/,
    "note D15: fleet-core excluded (residual home; make-server-37f42386 retired)",
  );
  fs.writeFileSync(p, t);
  console.log("overlap note: make-server retired");
}

{
  const p = path.join(ROOT, ".github/workflows/deploy-supabase-edge.yml");
  let t = fs.readFileSync(p, "utf8");
  t = t.replace(/^\s*make-server-37f42386\s*$/m, "            # retired F5: make-server-37f42386");
  t = t.replace(
    /for dep in make-server-37f42386 fleet-core/,
    "for dep in fleet-core",
  );
  fs.writeFileSync(p, t);
  console.log("workflow: make-server removed from ALL_FNS / deps");
}

{
  const p = path.join(ROOT, "package.json");
  let t = fs.readFileSync(p, "utf8");
  t = t.replace(
    /npx supabase functions deploy make-server-37f42386 --use-api --project-ref csfllzzastacofsvcdsc && node scripts\/smoke-fleet-health\.mjs/,
    "npx supabase functions deploy fleet-core --use-api --project-ref csfllzzastacofsvcdsc && node scripts/smoke-edge-fn.mjs fleet-core",
  );
  fs.writeFileSync(p, t);
  console.log("package.json deploy:edge → fleet-core");
}

run("node", ["scripts/generate-extraction-status.mjs"]);
console.log("Retirement edits applied. Commit and let CI deploy fleet-core only.");
process.exit(0);
