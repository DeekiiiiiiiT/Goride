#!/usr/bin/env node
/**
 * ADR-0022 remount rehearsal (toll) — times remount + client revert + restore.
 *
 * Default is --dry-code: edit working tree only, then restore. Does not deploy.
 * Pass --apply to leave remounted (dangerous — do not use in prod without a window).
 *
 * Records wall-clock seconds to stdout for §8.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REG = path.join(
  ROOT,
  "supabase/functions/_fleet-server/register_residual_monolith_routes.tsx",
);
const CONFIGS = [
  "packages/api-client/src/config.ts",
  "apps/fleet/src/services/apiConfig.ts",
  "apps/admin/src/services/apiConfig.ts",
  "apps/driver/src/services/apiConfig.ts",
];

const apply = process.argv.includes("--apply");
const t0 = Date.now();

function remountToll(src) {
  return src
    .replace(
      "// RETIRED: app.route(\"/\", tollApp); — live on fleet-toll",
      "app.route(\"/\", tollApp); // ADR-0022 remount rehearsal",
    )
    .replace(
      "// RETIRED: app.route(\"/\", tollPeriodApp); — live on fleet-toll",
      "app.route(\"/\", tollPeriodApp); // ADR-0022 remount rehearsal",
    );
}

function unmountToll(src) {
  return src
    .replace(
      "app.route(\"/\", tollApp); // ADR-0022 remount rehearsal",
      "// RETIRED: app.route(\"/\", tollApp); — live on fleet-toll",
    )
    .replace(
      "app.route(\"/\", tollPeriodApp); // ADR-0022 remount rehearsal",
      "// RETIRED: app.route(\"/\", tollPeriodApp); — live on fleet-toll",
    );
}

function setTollBase(toFleetCore) {
  const target = toFleetCore ? "fleet-core" : "fleet-toll";
  const other = toFleetCore ? "fleet-toll" : "fleet-core";
  for (const rel of CONFIGS) {
    const abs = path.join(ROOT, rel);
    let t = fs.readFileSync(abs, "utf8");
    t = t.replace(
      new RegExp(`(toll:\\s*\`\\$\\{BASE_URL\\}/)${other}(\`)`),
      `$1${target}$2`,
    );
    fs.writeFileSync(abs, t);
  }
}

const beforeReg = fs.readFileSync(REG, "utf8");
const remounted = remountToll(beforeReg);
if (remounted === beforeReg) {
  console.error("Could not find RETIRED toll mounts to remount");
  process.exit(1);
}
fs.writeFileSync(REG, remounted);
setTollBase(true); // client revert → residual (fleet-core)
const tRemount = Date.now();

console.log(
  `remount+client-revert wall_ms=${tRemount - t0} (code path; deploy not included)`,
);

if (!apply) {
  fs.writeFileSync(REG, unmountToll(fs.readFileSync(REG, "utf8")));
  setTollBase(false); // restore fleet-toll
  const tDone = Date.now();
  console.log(`restored forward cutover wall_ms=${tDone - tRemount}`);
  console.log(`TOTAL rehearsal wall_ms=${tDone - t0} (~${((tDone - t0) / 60000).toFixed(2)} min code-only)`);
  console.log(
    "NOTE: Full ADR-0022 RTO requires edge redeploy + client app ship; schedule staging window to replace this code-only number.",
  );
} else {
  console.log("--apply set: left remounted. Redeploy make-server/fleet-core + ship clients.");
}

process.exit(0);
