#!/usr/bin/env node
/**
 * E-1 guard: wired projection flags must be imported and called in driver_financial_periods.ts.
 * Reserved flags must stay documented as RESERVED in period_projection_flags.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flagsPath = join(root, "supabase/functions/_fleet-server/period_projection_flags.ts");
const consumerPath = join(root, "supabase/functions/_fleet-server/driver_financial_periods.ts");

const flagsSrc = readFileSync(flagsPath, "utf8");
const consumerSrc = readFileSync(consumerPath, "utf8");

const wiredMatch = flagsSrc.match(
  /WIRED_PROJECTION_FLAG_EXPORTS\s*=\s*\[([\s\S]*?)\]\s*as const/,
);
const wiredExports = wiredMatch
  ? [...wiredMatch[1].matchAll(/"(\w+)"/g)].map((m) => m[1])
  : [
      "projectionReadsEventsForFuel",
      "projectionAllowsFuelSnapshotFallback",
      "projectionReadsEventsForFares",
      "projectionReadsEventsForTolls",
    ];

const reservedMatch = flagsSrc.match(
  /RESERVED_PROJECTION_FLAG_EXPORTS\s*=\s*\[([\s\S]*?)\]\s*as const/,
);
const reservedExports = reservedMatch
  ? [...reservedMatch[1].matchAll(/"(\w+)"/g)].map((m) => m[1])
  : ["projectionReadsEventsForCash"];

let failed = false;

for (const fn of wiredExports) {
  if (!consumerSrc.includes(fn)) {
    console.error(`[projection-flags] ${fn} is wired but not referenced in driver_financial_periods.ts`);
    failed = true;
  }
}

for (const fn of reservedExports) {
  const fnBlock = flagsSrc.match(new RegExp(`export function ${fn}[\\s\\S]*?\\n\\}`));
  if (!fnBlock || !fnBlock[0].includes("RESERVED")) {
    console.error(`[projection-flags] ${fn} must be marked RESERVED in docblock`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("[projection-flags] wired/reserved flag guard OK");
