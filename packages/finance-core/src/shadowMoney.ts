import { round2 } from './money.ts';

/** Money fields compared on a nightly recompute. Timestamps are not money. */
export const DRIVER_SHADOW_MONEY_FIELDS = [
  'driver_share',
  'fleet_share',
  'fuel_deduction',
  'fuel_fleet_share',
  'toll_spend',
  'toll_charged_to_driver',
  'cash_collected',
  'settlement_amount',
  'earnings_gross',
] as const;

export const VEHICLE_SHADOW_MONEY_FIELDS = ['totalSpend'] as const;

export type ShadowMoneyDelta = {
  field: string;
  previous: number;
  next: number;
  delta: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Difference above 1 cent between the last stored result and this recompute.
 * No previous row means there is nothing to compare yet.
 */
export function diffShadowMoney(
  previous: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
  fields: readonly string[],
  eps = 0.01,
): ShadowMoneyDelta[] {
  if (!previous || !next) return [];
  const out: ShadowMoneyDelta[] = [];
  for (const field of fields) {
    const before = num(previous[field]);
    const after = num(next[field]);
    const delta = round2(before - after);
    if (Math.abs(delta) > eps) {
      out.push({ field, previous: before, next: after, delta });
    }
  }
  return out;
}
