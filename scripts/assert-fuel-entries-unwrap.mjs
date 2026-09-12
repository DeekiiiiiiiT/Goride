#!/usr/bin/env node
/**
 * V-01 class guard — fleet/admin/driver fuel list callers must unwrap
 * GET /fuel-entries via unwrapFuelEntriesPayload (array or { data, total }).
 * Fails if a client spreads/returns raw json() without the helper.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const FILES = [
  "apps/fleet/src/services/api.ts",
  "apps/admin/src/services/api.ts",
  "apps/driver/src/services/api.ts",
  "apps/fleet/src/services/fuelService.ts",
  "apps/admin/src/services/fuelService.ts",
  "apps/driver/src/services/fuelService.ts",
  "apps/fleet/src/services/settlementService.ts",
  "apps/fleet/src/components/vehicles/KmLTracking.tsx",
  "apps/admin/src/services/data-export.ts",
];

const SWALLOW = [
  "apps/fleet/src/hooks/useDriverFuelEntries.ts",
  "apps/driver/src/components/fleet/DriverExpenses.tsx",
];

let failed = false;

for (const rel of FILES) {
  const text = await readFile(join(root, rel), "utf8");
  if (!text.includes("unwrapFuelEntriesPayload")) {
    console.error(`[V-01] ${rel} missing unwrapFuelEntriesPayload`);
    failed = true;
  }
  // Raw spread of fuel-entries json without unwrap is the original bug
  if (
    /fuel-entries/.test(text) &&
    /\[\s*\.\.\.(dataUnderscore|dataHyphen|entries)/.test(text) &&
    !text.includes("unwrapFuelEntriesPayload")
  ) {
    console.error(`[V-01] ${rel} still spreads raw fuel-entries payload`);
    failed = true;
  }
}

for (const rel of SWALLOW) {
  const text = await readFile(join(root, rel), "utf8");
  if (
    /getFuelEntriesByVehicle\([^)]*\)\.catch\(\s*\(\)\s*=>\s*\[\]/.test(text) ||
    /getAllFuelEntries\([^)]*\)\.catch\(\s*\(\)\s*=>\s*\[\]/.test(text)
  ) {
    console.error(`[V-01] ${rel} still swallows fuel fetch errors into []`);
    failed = true;
  }
}

const controller = await readFile(
  join(root, "supabase/functions/_fleet-server/fuel_controller.tsx"),
  "utf8",
);
if (!/wantEnvelope/.test(controller) || !/shape.*envelope/i.test(controller)) {
  console.error("[V-01] fuel_controller GET /fuel-entries missing opt-in envelope gate");
  failed = true;
}

if (failed) {
  console.error("assert-fuel-entries-unwrap: FAILED");
  process.exit(1);
}
console.log("assert-fuel-entries-unwrap: OK");
