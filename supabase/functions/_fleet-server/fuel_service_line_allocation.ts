/**
 * Phase 4 — apply trip-mix ratio to unattributed spend (reporting only).
 * Mirrors apps/fleet/src/utils/fuelServiceLineAllocation.ts projectUnattributedSpendByTripMix.
 */

export type TripMixRatio = {
  rideshare: number;
  rush_delivery: number;
};

export type LineSpendProjection = {
  rideshareAttributed: number;
  deliveryAttributed: number;
  unattributed: number;
  rideshareProjected: number;
  deliveryProjected: number;
  rideshareTotal: number;
  deliveryTotal: number;
  ratio: TripMixRatio;
  conserves: boolean;
};

export function projectUnattributedSpendByTripMix(args: {
  rideshareSpend: number;
  deliverySpend: number;
  unattributedSpend: number;
  ratio: TripMixRatio;
  eps?: number;
}): LineSpendProjection {
  const eps = args.eps ?? 0.01;
  const rShare = Number.isFinite(args.ratio.rideshare) ? Math.max(0, args.ratio.rideshare) : 0;
  const dShare = Number.isFinite(args.ratio.rush_delivery)
    ? Math.max(0, args.ratio.rush_delivery)
    : 0;
  const denom = rShare + dShare;
  const ratio: TripMixRatio =
    denom > 0
      ? { rideshare: rShare / denom, rush_delivery: dShare / denom }
      : { rideshare: 1, rush_delivery: 0 };

  const unattributed = Number(args.unattributedSpend) || 0;
  const rideshareAttributed = Number(args.rideshareSpend) || 0;
  const deliveryAttributed = Number(args.deliverySpend) || 0;
  const rideshareProjected = unattributed * ratio.rideshare;
  const deliveryProjected = unattributed * ratio.rush_delivery;
  const rideshareTotal = rideshareAttributed + rideshareProjected;
  const deliveryTotal = deliveryAttributed + deliveryProjected;
  const orgTotal = rideshareAttributed + deliveryAttributed + unattributed;
  const conserves = Math.abs(rideshareTotal + deliveryTotal - orgTotal) < eps;

  return {
    rideshareAttributed,
    deliveryAttributed,
    unattributed,
    rideshareProjected,
    deliveryProjected,
    rideshareTotal,
    deliveryTotal,
    ratio,
    conserves,
  };
}
