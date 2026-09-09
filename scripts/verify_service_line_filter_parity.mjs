#!/usr/bin/env node
/**
 * N-8: list filter ↔ RPC service-line predicate parity.
 * Cases: key present-nonzero, present-zero, absent — list must match RPC match-all rules.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Mirrors public.dfp_service_line_matches (SQL COALESCE) */
function rpcMatchesCoalesce(metadata, serviceLine) {
  if (!serviceLine || !String(serviceLine).trim()) return true;
  const rush = Number(metadata?.rushTripCount ?? 0);
  const ride = Number(metadata?.rideshareTripCount ?? 0);
  if (rush === 0 && ride === 0) return true;
  return serviceLine === "rush_delivery" ? rush > 0 : ride > 0;
}

/**
 * Mirrors applyServiceLineSqlFilter after N-8 fix:
 * match-all when both keys are 0 OR null; else lane count > 0.
 */
function listMatches(metadata, serviceLine) {
  if (!serviceLine) return true;
  const rushRaw = metadata?.rushTripCount;
  const rideRaw = metadata?.rideshareTripCount;
  const rushNull = rushRaw == null;
  const rideNull = rideRaw == null;
  const rushZero = rushNull || Number(rushRaw) === 0;
  const rideZero = rideNull || Number(rideRaw) === 0;
  const matchAll = rushZero && rideZero;
  if (matchAll) return true;
  if (serviceLine === "rush_delivery") return Number(rushRaw) > 0;
  return Number(rideRaw) > 0;
}

const fixtures = [
  { id: "absent-rideshare", meta: {}, line: "rideshare", expect: true },
  { id: "absent-rush", meta: {}, line: "rush_delivery", expect: true },
  { id: "both-zero-rideshare", meta: { rushTripCount: 0, rideshareTripCount: 0 }, line: "rideshare", expect: true },
  { id: "both-zero-rush", meta: { rushTripCount: 0, rideshareTripCount: 0 }, line: "rush_delivery", expect: true },
  { id: "ride-only-rideshare", meta: { rushTripCount: 0, rideshareTripCount: 5 }, line: "rideshare", expect: true },
  { id: "ride-only-rush", meta: { rushTripCount: 0, rideshareTripCount: 5 }, line: "rush_delivery", expect: false },
  { id: "rush-only-rideshare", meta: { rushTripCount: 4, rideshareTripCount: 0 }, line: "rideshare", expect: false },
  { id: "rush-only-rush", meta: { rushTripCount: 4, rideshareTripCount: 0 }, line: "rush_delivery", expect: true },
  { id: "stripped-after-collect", meta: {}, line: "rideshare", expect: true }, // N-8 regression
];

let failed = 0;
for (const f of fixtures) {
  const rpc = rpcMatchesCoalesce(f.meta, f.line);
  const list = listMatches(f.meta, f.line);
  if (rpc !== f.expect) {
    console.error(`[${f.id}] RPC mismatch: got ${rpc}, expected ${f.expect}`);
    failed++;
  }
  if (list !== f.expect) {
    console.error(`[${f.id}] list mismatch: got ${list}, expected ${f.expect}`);
    failed++;
  }
  if (rpc !== list) {
    console.error(`[${f.id}] list vs RPC diverge: list=${list} rpc=${rpc}`);
    failed++;
  }
}

// Source guards: TS filter must include is.null; SQL RPC must COALESCE
const dfpPath = join(root, "supabase/functions/_fleet-server/driver_financial_periods.ts");
const dfp = readFileSync(dfpPath, "utf8");
if (!dfp.includes("metadata->>rushTripCount.is.null")) {
  console.error("driver_financial_periods.ts: applyServiceLineSqlFilter missing rushTripCount.is.null");
  failed++;
}
if (!dfp.includes("metadata->>rideshareTripCount.is.null")) {
  console.error("driver_financial_periods.ts: applyServiceLineSqlFilter missing rideshareTripCount.is.null");
  failed++;
}

const migPath = join(
  root,
  "supabase/migrations/20260908220000_settlement_queue_sql_aggregates.sql",
);
const mig = readFileSync(migPath, "utf8");
if (!mig.includes("dfp_service_line_matches") || !mig.includes("COALESCE((p_metadata->>'rushTripCount')")) {
  console.error("settlement_queue_sql_aggregates.sql: dfp_service_line_matches COALESCE missing");
  failed++;
}

const snapPath = join(root, "packages/finance-core/src/periodSignedSnapshot.ts");
const snap = readFileSync(snapPath, "utf8");
if (!snap.includes("'rushTripCount'") || !snap.includes("'rideshareTripCount'")) {
  console.error("periodSignedSnapshot.ts: PRESERVED_PERIOD_META_KEYS missing trip counts");
  failed++;
}

if (failed > 0) {
  console.error(`\nverify_service_line_filter_parity: FAIL (${failed})`);
  process.exit(1);
}
console.log(`verify_service_line_filter_parity: OK (${fixtures.length} fixtures)`);
