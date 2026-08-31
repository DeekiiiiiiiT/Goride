/**
 * Shared settlement helpers — single source for finalize/sync idempotency keys.
 * App settlementService wrappers may differ; this formula must not.
 */

export function enterpriseFuelSyncIdempotencyKey(
  reportId: string,
  entryId: string,
  kind: 'credit' | 'deduction',
): string {
  return `enterprise_fuel_sync:${reportId}:${entryId}:${kind}:v1`;
}

/** Calendar day YYYY-MM-DD from stored date/datetime strings. */
export function fuelSettlementEntryYmd(d: string | undefined | null): string {
  if (!d || typeof d !== 'string') return '';
  return d.split('T')[0]?.split(' ')[0] || '';
}
