/**
 * A-5: per-source projection feature flags (env-gated incremental cutover).
 *
 * Wired flags (changing env var affects rebuild behavior):
 * - PROJECTION_EVENTS_FUEL — fuel from financial_events (default ON)
 * - PROJECTION_ALLOW_FUEL_SNAPSHOT — opt-in finalized_report fallback
 * - PROJECTION_EVENTS_FARES — disable trip gross fallback when true
 * - PROJECTION_EVENTS_TOLLS — toll money from toll_usage events when true
 *
 * Reserved (documented but NOT wired — env var has no effect):
 * - PROJECTION_EVENTS_CASH — deferred; cash uses trips + payout_cash ledger + A-11 mirror.
 *   See docs/adr/settlement-cash-events-deferred.md. Rollback for cash txs: SETTLEMENT_TX_TABLE_READ.
 *
 * Separate from A-5: SETTLEMENT_TX_TABLE_READ controls settlement transaction storage (mirror vs KV).
 */
export function projectionReadsEventsForFuel(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_FUEL") !== "false";
}

/** Opt-in only — finalized_report snapshot must not silently return. */
export function projectionAllowsFuelSnapshotFallback(): boolean {
  return Deno.env.get("PROJECTION_ALLOW_FUEL_SNAPSHOT") === "true";
}

/** When true, toll spend/cash/tag totals come from toll_usage financial_events. Workflow counts still use toll_ledger. */
export function projectionReadsEventsForTolls(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_TOLLS") === "true";
}

/**
 * RESERVED — not wired. Cash collected/returned uses trips + ledger + settlement mirror.
 * Setting PROJECTION_EVENTS_CASH=false has no effect until Phase 3C event writers land.
 */
export function projectionReadsEventsForCash(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_CASH") !== "false";
}

/** When true, trip gross fallback is disabled (ledger fare_earning only). */
export function projectionReadsEventsForFares(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_FARES") === "true";
}

/** Flags that must have a call site in driver_financial_periods.ts (E-1 guard). */
export const WIRED_PROJECTION_FLAG_EXPORTS = [
  "projectionReadsEventsForFuel",
  "projectionAllowsFuelSnapshotFallback",
  "projectionReadsEventsForFares",
  "projectionReadsEventsForTolls",
] as const;

/** Exported but intentionally unwired until event writers exist. */
export const RESERVED_PROJECTION_FLAG_EXPORTS = [
  "projectionReadsEventsForCash",
] as const;
