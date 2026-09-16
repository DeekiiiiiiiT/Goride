/**
 * Phase G1 — repoint non-fuel API_ENDPOINTS.fuel callers to .fleet
 */
import fs from "node:fs";

const MOVE_PREFIXES = [
  "unverified-vendors",
  "maintenance-logs",
  "maintenance-schedule",
  "maintenance-fleet-summary",
  "maintenance-fleet-bootstrap",
  "toll-plazas",
  "toll-tags",
  "odometer-history",
  "odometer/",
  "anchors",
  "audit-config",
  "migrate-legacy-vendors",
  "process-migration-transaction",
  "fuel-disputes",
  "scenarios",
  "earnings-policies",
];

const files = [
  "apps/admin/src/services/api.ts",
  "apps/driver/src/services/api.ts",
  "apps/fleet/src/services/api.ts",
  "apps/admin/src/services/fuelDisputeService.ts",
  "apps/fleet/src/services/fuelDisputeService.ts",
  "apps/admin/src/services/fuelService.ts",
  "apps/fleet/src/services/fuelService.ts",
  "apps/driver/src/services/fuelService.ts",
  "apps/admin/src/services/settlementService.ts",
  "apps/fleet/src/services/settlementService.ts",
  "apps/driver/src/services/settlementService.ts",
  "apps/fleet/src/services/earningsPolicyService.ts",
  "packages/platform-ops-ui/src/services/stationOpsApi.ts",
];

let total = 0;
for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log("missing", file);
    continue;
  }
  let text = fs.readFileSync(file, "utf8");
  const orig = text;
  for (const p of MOVE_PREFIXES) {
    const from = "${API_ENDPOINTS.fuel}/" + p;
    const to = "${API_ENDPOINTS.fleet}/" + p;
    let n = 0;
    let idx = 0;
    while ((idx = text.indexOf(from, idx)) !== -1) {
      n++;
      idx += from.length;
    }
    if (n) {
      text = text.split(from).join(to);
      total += n;
      console.log(`${file}: ${p} x${n}`);
    }
  }
  if (text !== orig) {
    fs.writeFileSync(file, text);
    console.log(`wrote ${file}`);
  }
}
console.log("TOTAL replacements", total);
