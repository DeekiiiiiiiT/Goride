/**
 * Deadhead hint hygiene before Fuel Brain classify.
 * Brain math is correct (caps hint to Available); garbage hints still starve Personal
 * when the server ignored trips (KV 1000-row truncate → tripKm=0 → 35% of full odo).
 */

export type DeadheadHintSource = {
  deadheadKm?: number;
  tripKm?: number;
  totalOdometerKm?: number;
  method?: string;
  confidenceLevel?: string;
};

/**
 * When the deadhead service clearly missed trips the recon client can see,
 * never pass an industry-fallback-of-full-odo hint into the brain.
 * Recompute fallback on non-trip residual only (matches fuel_logic intent).
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
  const industryPct = Math.max(0, Math.min(80, Number(opts.industryFallbackPct) || 35));

  const serverMissedTrips =
    Number.isFinite(serverTrip) &&
    serverTrip === 0 &&
    clientTrip > 0 &&
    (server?.method === 'fallback' || server?.confidenceLevel === 'low');

  if (!serverMissedTrips) {
    return rawHint;
  }

  // Available leftover after known Ride Share + Company Ops
  const available = odo > 0 ? Math.max(0, odo - clientTrip - companyOps) : 0;
  // Same industry rail as fuel_logic, but on non-trip km — not full odo
  const corrected = available * (industryPct / 100);
  return Number(Math.min(rawHint, corrected).toFixed(2));
}
