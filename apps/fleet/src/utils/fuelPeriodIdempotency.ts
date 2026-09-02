/**
 * Stable fuel period job idempotency keys (NEW-5) — never include Date.now().
 */
export function fuelPeriodFinalizeIdempotencyKey(periodId: string, version: number): string {
  return `finalize:${periodId}:v${Number(version) || 1}`;
}

export function fuelPeriodReopenIdempotencyKey(periodId: string, version: number): string {
  return `reopen:${periodId}:v${Number(version) || 1}`;
}
