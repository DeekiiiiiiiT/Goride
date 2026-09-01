/** 2dp JMD rounding — every money surface must use this. */
export function round2(n: number): number {
  const x = Number(n) || 0;
  const sign = x < 0 ? -1 : 1;
  // toFixed(6) on cents avoids IEEE edges (1.005*100 → 100.4999…) then half-up away from zero.
  const cents = Math.round(parseFloat((Math.abs(x) * 100).toFixed(6)));
  return (sign * cents) / 100;
}

export const MONEY_EPS = 0.005;

/** Status bands: money compares use MONEY_EPS; settled residual may use STATUS_SETTLED_EPS. */
export const STATUS_SETTLED_EPS = 0.01;
export const STATUS_CASH_HELD_EPS = 0.5;
