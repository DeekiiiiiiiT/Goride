/**
 * R3-06: coverage hash for recon step stale detection.
 * Day-status alone misses late rows on already-Covered days — include volume.
 * Keep edge twins (recon_routes / week_close_recon) on this helper.
 */
import { codesForStep } from './closeBlockerSteps.ts';
export type CoverageVolume = {
  rowCount?: number | null;
  amountMinor?: number | null;
};

export function coverageInputHash(
  coverage: Record<string, string>,
  volume?: CoverageVolume | null,
): string {
  const keys = Object.keys(coverage).sort();
  const dayPart = keys.map((k) => `${k}:${coverage[k] ?? ''}`).join('|');
  const rowCount = Math.max(0, Math.round(Number(volume?.rowCount) || 0));
  const amountMinor = Math.round(Number(volume?.amountMinor) || 0);
  return `${dayPart}#r${rowCount}#a${amountMinor}`;
}

/** Human decisions that must survive live coverage refresh at close (R3-05). */
export const RECON_HUMAN_SOURCE_STATUSES = ['waived', 'attested_none'] as const;

export function isReconHumanSourceStatus(status: string | null | undefined): boolean {
  return (RECON_HUMAN_SOURCE_STATUSES as readonly string[]).includes(String(status || ''));
}

/** Close-preview codes that keep Trips & Earnings actionable (R3-08). */
export const TRIPS_EARNINGS_BLOCKER_CODES = codesForStep('trips_earnings');

export function countTripsEarningsBlockers(
  blockers: Array<{ code?: string | null }>,
): number {
  const set = new Set<string>(TRIPS_EARNINGS_BLOCKER_CODES);
  return blockers.filter((b) => set.has(String(b.code || '').toUpperCase())).length;
}

/** Money still open on the Settlement step. Completes only when this count is 0. */
export const SETTLEMENT_PREVIEW_BLOCKER_CODES = codesForStep('settlement_preview');

export function countSettlementPreviewBlockers(
  blockers: Array<{ code?: string | null; severity?: string | null }>,
): number {
  const set = new Set<string>(SETTLEMENT_PREVIEW_BLOCKER_CODES);
  return blockers.filter((b) => {
    if (String(b.severity || 'block') === 'warn') return false;
    return set.has(String(b.code || '').toUpperCase());
  }).length;
}
