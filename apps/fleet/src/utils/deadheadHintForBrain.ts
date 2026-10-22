/**
 * Deadhead hint hygiene before Fuel Brain classify.
 * Caps a hint to the kilometres that are actually left.
 * Does not raise the hint to an industry percentage.
 */

export const DEFAULT_INDUSTRY_FALLBACK_PCT = 35;

export type DeadheadHintSource = {
  deadheadKm?: number;
  tripKm?: number;
  totalOdometerKm?: number;
  method?: string;
  confidenceLevel?: string;
};

/** Cap a hint at the kilometres left. The percent argument is unused (benchmark only). */
export function applyDeadheadFloor(
  hintKm: number,
  availableKm: number,
  _industryFallbackPct: number = DEFAULT_INDUSTRY_FALLBACK_PCT,
): number {
  const available = Math.max(0, Number(availableKm) || 0);
  const hint = Math.max(0, Number(hintKm) || 0);
  if (!(available > 0)) return 0;
  return Number(Math.min(available, hint).toFixed(2));
}

/**
 * When the deadhead service clearly missed trips the recon client can see,
 * never pass an industry-fallback-of-full-odo hint into the brain.
 * A fallback that ignored the trips is dropped, not rescaled to 35%.
 */
export function resolveDeadheadHintForBrain(opts: {
  server: DeadheadHintSource | undefined;
  clientTripRideshareKm: number;
  companyOpsKm?: number;
  industryFallbackPct?: number;
}): number {
  const server = opts.server;
  const rawHint = Math.max(0, Number(server?.deadheadKm) || 0);
  const clientTrip = Math.max(0, Number(opts.clientTripRideshareKm) || 0);
  const companyOps = Math.max(0, Number(opts.companyOpsKm) || 0);
  const odo = Math.max(0, Number(server?.totalOdometerKm) || 0);
  const serverTrip = Number(server?.tripKm);
  const industryPct = Math.max(
    0,
    Math.min(80, Number(opts.industryFallbackPct) || DEFAULT_INDUSTRY_FALLBACK_PCT),
  );

  const serverMissedTrips =
    Number.isFinite(serverTrip) &&
    serverTrip === 0 &&
    clientTrip > 0 &&
    (server?.method === 'fallback' || server?.confidenceLevel === 'low');

  // Available leftover after known Ride Share + Company Ops
  const available = odo > 0 ? Math.max(0, odo - clientTrip - companyOps) : 0;

  let hygiened = rawHint;
  if (serverMissedTrips || server?.method === 'fallback') {
    hygiened = 0;
  }

  if (!(available > 0)) return hygiened;
  return applyDeadheadFloor(hygiened, available, industryPct);
}
