/**
 * Shared settlement helpers — single source for finalize/sync idempotency keys.
 * App settlementService wrappers may differ; this formula must not.
 */

// One-week rule (ADR 0007): settlement entry day must be tz-explicit so a UTC
// timestamp near midnight never buckets into the wrong fleet week.
import { fleetCalendarDay, DEFAULT_FLEET_TZ } from '../../finance-core/src/periodKey.ts';

export function enterpriseFuelSyncIdempotencyKey(
  reportId: string,
  entryId: string,
  kind: 'credit' | 'deduction',
): string {
  return `enterprise_fuel_sync:${reportId}:${entryId}:${kind}:v1`;
}

/**
 * Fleet-calendar day (YYYY-MM-DD, America/Jamaica) from stored date/datetime.
 * A bare YMD passes through; a UTC timestamp is projected into the fleet tz so
 * an 11:30pm-UTC entry stays on the correct Jamaica day / settlement week.
 */
export function fuelSettlementEntryYmd(
  d: string | undefined | null,
  fleetTz: string = DEFAULT_FLEET_TZ,
): string {
  if (!d || typeof d !== 'string') return '';
  const bare = d.split(' ')[0] || '';
  if (!bare) return '';
  return fleetCalendarDay(bare, fleetTz);
}
