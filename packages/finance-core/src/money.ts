/** 2dp JMD rounding — every money surface must use this. */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export const MONEY_EPS = 0.005;
