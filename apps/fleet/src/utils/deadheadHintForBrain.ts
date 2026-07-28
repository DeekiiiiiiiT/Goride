/**
 * Deadhead hint hygiene before Fuel Brain classify.
 * Brain math caps hint to Available; garbage hints still starve Personal
 * when the server ignored trips (KV 1000-row truncate → tripKm=0 → 35% of full odo).
 *
 * After hygiene, apply industry floor so gap/time under-claims cannot collapse
 * Deadhead below Available × industryFallbackPct (default 35%).
 */

export const DEFAULT_INDUSTRY_FALLBACK_PCT = 35;

export type DeadheadHintSource = {
  deadheadKm?: number;
  tripKm?: number;
  totalOdometerKm?: number;
  method?: string;
  confidenceLevel?: string;
};

/** Deadhead = min(Available, max(hint, Available × pct/100)). */
export function applyDeadheadFloor(
  hintKm: number,
  availableKm: number,
  industryFallbackPct: number = DEFAULT_INDUSTRY_FALLBACK_PCT,
): number {
  const available = Math.max(0, Number(availableKm) || 0);
  const hint = Math.max(0, Number(hintKm) || 0);
  const pct = Math.max(0, Math.min(80, Number(industryFallbackPct) || DEFAULT_INDUSTRY_FALLBACK_PCT));
  if (!(available > 0)) return 0;
  const floor = available * (pct / 100);
  return Number(Math.min(available, Math.max(hint, floor)).toFixed(2));
}

/**
 * When the deadhead service clearly missed trips the recon client can see,
 * never pass an industry-fallback-of-full-odo hint into the brain.
 * Recompute fallback on non-trip residual only (matches fuel_logic intent),
 * then enforce Available × industryFallbackPct floor.
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
  if (serverMissedTrips) {
    // Same industry rail as fuel_logic, but on non-trip km — not full odo
    const corrected = available * (industryPct / 100);
    hygiened = Number(Math.min(rawHint, corrected).toFixed(2));
  }

  // No odo → pass hygiened hint; classify applies floor once Available is known
  if (!(available > 0)) return hygiened;

  return applyDeadheadFloor(hygiened, available, industryPct);
}
