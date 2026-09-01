/**
 * A-5: per-source projection feature flags (env-gated incremental cutover).
 *
 * Defaults after 2026-09-01 finish program:
 * - Fuel events ON; snapshot fallback OFF (prod had 0 snapshot periods).
 * - Fares: trip fallback remains until PROJECTION_EVENTS_FARES=true.
 * - Cash via settlement mirror (A-11) ON by default — see settlementTxTableReadEnabled.
 * - Toll money still from toll_ledger until PROJECTION_EVENTS_TOLLS=true.
 */
export function projectionReadsEventsForFuel(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_FUEL") !== "false";
}

/** Opt-in only — finalized_report snapshot must not silently return. */
export function projectionAllowsFuelSnapshotFallback(): boolean {
  return Deno.env.get("PROJECTION_ALLOW_FUEL_SNAPSHOT") === "true";
}

export function projectionReadsEventsForTolls(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_TOLLS") === "true";
}

export function projectionReadsEventsForCash(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_CASH") !== "false";
}

/** When true, trip gross fallback is disabled (ledger fare_earning only). */
export function projectionReadsEventsForFares(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_FARES") === "true";
}
