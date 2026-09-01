/**
 * A-5: per-source projection feature flags (env-gated incremental cutover).
 */
export function projectionReadsEventsForFuel(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_FUEL") !== "false";
}

export function projectionReadsEventsForTolls(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_TOLLS") === "true";
}

export function projectionReadsEventsForCash(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_CASH") === "true";
}

export function projectionReadsEventsForFares(): boolean {
  return Deno.env.get("PROJECTION_EVENTS_FARES") === "true";
}
