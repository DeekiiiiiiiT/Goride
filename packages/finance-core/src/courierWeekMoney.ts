import { round2 } from './money.ts';

/**
 * Delivery week money, calculated once per courier-week by the same background
 * worker as rideshare. Shared cost follows the trip mix. Payout is earnings
 * minus that courier's fuel and toll shares. Toll closing balance carries
 * forward: opening + top-ups − usage.
 */
export function allocateSharedCost(
  total: number,
  weights: { rideshare: number; delivery: number },
): { rideshare: number; delivery: number } {
  const rideshare = Math.max(0, Number(weights.rideshare) || 0);
  const delivery = Math.max(0, Number(weights.delivery) || 0);
  const sum = rideshare + delivery;
  const amount = round2(Number(total) || 0);
  if (!(sum > 0) || amount === 0) return { rideshare: 0, delivery: 0 };
  const deliveryShare = round2(amount * (delivery / sum));
  return { rideshare: round2(amount - deliveryShare), delivery: deliveryShare };
}

export function netCourierPayout(earnings: number, fuelShare: number, tollShare: number): number {
  return round2((Number(earnings) || 0) - (Number(fuelShare) || 0) - (Number(tollShare) || 0));
}

export function tollClosingBalance(opening: number, topUps: number, usage: number): number {
  return round2((Number(opening) || 0) + (Number(topUps) || 0) - (Number(usage) || 0));
}
