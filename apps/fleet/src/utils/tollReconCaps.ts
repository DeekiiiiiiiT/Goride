/**
 * Central pagination / fetch caps for Toll Reconciliation.
 * Keep client + server aligned; surface truncation when a cap is hit.
 */

export const TOLL_RECON_CAPS = {
  /** Unreconciled page size (wizard fetchAllUnreconciled). */
  unreconciledPageSize: 250,
  /** Max pages for unreconciled / trips loops before stop + truncate flag. */
  maxFetchPages: 40,
  /** Trips page size. */
  tripsPageSize: 500,
  /** Single-shot reconciled / unclaimed-refunds limit (paginate later). */
  reconciledLimit: 1000,
  unclaimedRefundsLimit: 1000,
  /** Periods endpoint canonical fleet-loss max rows. */
  periodsFleetLossMaxRows: 100_000,
  /** Legacy wizard client refetch cap (removed; kept for docs/tests). */
  wizardCanonicalMaxRows: 20_000,
} as const;

export type TollReconTruncation = {
  unreconciledHasMore?: boolean;
  tripsHasMore?: boolean;
  reconciledCapped?: boolean;
  unclaimedRefundsCapped?: boolean;
};

export function tollReconTruncationMessage(t: TollReconTruncation): string | null {
  const parts: string[] = [];
  if (t.unreconciledHasMore) parts.push('unreconciled tolls');
  if (t.tripsHasMore) parts.push('trips');
  if (t.reconciledCapped) parts.push('reconciled history');
  if (t.unclaimedRefundsCapped) parts.push('unclaimed refunds');
  if (!parts.length) return null;
  return `Some ${parts.join(', ')} were truncated. Narrow the period or driver filter, or raise caps in tollReconCaps.`;
}
