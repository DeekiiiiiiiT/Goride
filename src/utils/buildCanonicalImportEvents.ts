import type { CanonicalLedgerEventInput } from '../types/ledgerCanonical';
import type { Trip, OrganizationMetrics, DisputeRefund } from '../types/data';
import type { UberSsotTotals } from './uberSsot';

const LINE = {
  /** From `OrganizationMetrics.refundsToll` (payments_organization). */
  REFUNDS_TOLL: 'REFUNDS_TOLL',
} as const;

function isUberTrip(t: Trip): boolean {
  return String(t.platform ?? '').toLowerCase() === 'uber';
}

function toYmd(iso: string | undefined, fallback: string): string {
  if (!iso || typeof iso !== 'string') return fallback;
  const s = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function tripDateBounds(trips: Trip[]): { min: string; max: string } {
  let min = '9999-12-31';
  let max = '0000-01-01';
  for (const t of trips) {
    const d = toYmd(t.date as string, '');
    if (!d) continue;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  if (min === '9999-12-31') {
    const today = new Date().toISOString().slice(0, 10);
    return { min: today, max: today };
  }
  return { min, max };
}

/** Dominant completed-Uber-trip driver UUID (for org-level payouts when no per-driver statement owner). */
export function pickPrimaryUberDriverId(trips: Trip[]): string | null {
  const counts = new Map<string, number>();
  for (const t of trips) {
    if (!isUberTrip(t)) continue;
    if (String(t.status ?? '').toLowerCase() !== 'completed') continue;
    const id = String(t.driverId || '').trim();
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [id, c] of counts) {
    if (c > n) {
      best = id;
      n = c;
    }
  }
  return best || null;
}

function pushStatementLine(
  out: CanonicalLedgerEventInput[],
  p: {
    batchId: string;
    sourceFileHash?: string;
    driverId: string;
    lineCode: string;
    netAmount: number;
    direction: 'inflow' | 'outflow';
    date: string;
    periodStart?: string;
    periodEnd?: string;
    description: string;
  },
): void {
  out.push({
    idempotencyKey: `${p.batchId}|stmt|${p.driverId}|${p.lineCode}`,
    date: p.date,
    driverId: p.driverId,
    eventType: 'statement_line',
    direction: p.direction,
    netAmount: p.netAmount,
    grossAmount: Math.abs(p.netAmount),
    currency: 'JMD',
    sourceType: 'import_batch',
    sourceId: p.batchId,
    batchId: p.batchId,
    sourceFileHash: p.sourceFileHash,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    platform: 'Uber',
    description: p.description,
    metadata: { lineCode: p.lineCode },
  });
}

export interface BuildCanonicalImportEventsParams {
  batchId: string;
  sourceFileHash?: string;
  trips: Trip[];
  organizationMetrics: OrganizationMetrics | null | undefined;
  uberStatementsByDriverId: Record<string, UberSsotTotals> | null | undefined;
  disputeRefunds: DisputeRefund[];
}

/**
 * Phase 3–4: deterministic canonical events from merged import preview data.
 * 
 * IMPORTANT: Fare-related statement_line events (TOTAL_EARNINGS, NET_FARE, PROMOTIONS, TIPS, REFUNDS_EXPENSES)
 * are NO LONGER created here. Uber trips generate fare_earning, tip, toll, prior_period via
 * buildCanonicalTripFareEventsFromTrip. Promotions use the exact **payments_driver** total per driver as
 * one `promotion` event per import batch (no per-trip split).
 *
 * This function creates:
 * - promotion (driver statement total from uberStatementsByDriverId / payments_driver)
 * - payout_cash / payout_bank (actual cash/bank payout totals from org)
 * - toll refund lines (REFUNDS_TOLL)
 * - toll_support_adjustment / dispute_refund events
 * 
 * Idempotency keys are stable for the same batchId + logical fact.
 */
export function buildCanonicalImportEvents(
  params: BuildCanonicalImportEventsParams,
): CanonicalLedgerEventInput[] {
  const { batchId, sourceFileHash, trips, organizationMetrics, disputeRefunds, uberStatementsByDriverId } =
    params;
  const org = organizationMetrics ?? null;
  const bounds = tripDateBounds(trips);
  const periodStart = org ? toYmd(org.periodStart, bounds.min) : bounds.min;
  const periodEnd = org ? toYmd(org.periodEnd, bounds.max) : bounds.max;
  /** Ledger `date` for payout rows — use period **start** so driver UI ranges match. */
  const reportingDate = periodStart;

  const primary = pickPrimaryUberDriverId(trips);
  const out: CanonicalLedgerEventInput[] = [];

  // ─── TOLL REFUNDS (org-level, not trip-level) ───────────────────────────────
  if (org && primary && org.refundsToll != null && Math.abs(org.refundsToll) > 1e-9) {
    pushStatementLine(out, {
      batchId,
      sourceFileHash,
      driverId: primary,
      lineCode: LINE.REFUNDS_TOLL,
      netAmount: Math.abs(org.refundsToll),
      direction: 'inflow',
      date: reportingDate,
      periodStart,
      periodEnd,
      description: 'Organization statement: toll refunds',
    });
  }

  // ─── PROMOTIONS (exact payments_driver total per driver, one row per batch) ─
  const ssot = uberStatementsByDriverId ?? null;
  if (ssot && Object.keys(ssot).length > 0) {
    const driverIds = Object.keys(ssot).sort((a, b) => a.localeCompare(b));
    for (const driverId of driverIds) {
      const totals = ssot[driverId];
      if (!totals) continue;
      const promo = Number(totals.promotions) || 0;
      if (Math.abs(promo) < 1e-9) continue;
      const did = String(driverId).trim();
      if (!did) continue;
      out.push({
        idempotencyKey: `${batchId}|driver_promotion|${did.toLowerCase()}`,
        date: reportingDate,
        driverId: did,
        eventType: 'promotion',
        direction: 'inflow',
        netAmount: promo,
        grossAmount: promo,
        currency: 'JMD',
        sourceType: 'import_batch',
        sourceId: batchId,
        batchId,
        sourceFileHash,
        periodStart,
        periodEnd,
        platform: 'Uber',
        description: 'Promotions (payments_driver statement total)',
        metadata: { source: 'payments_driver' },
      });
    }
  }

  // ─── PAYOUTS (actual cash/bank payout totals) ───────────────────────────────
  if (org && primary) {
    const cash = org.totalCashExposure ?? 0;
    const bank = org.bankTransfer ?? 0;
    if (Math.abs(cash) > 1e-9) {
      out.push({
        idempotencyKey: `${batchId}|payout|CASH`,
        date: reportingDate,
        driverId: primary,
        eventType: 'payout_cash',
        direction: 'inflow',
        netAmount: Math.abs(cash),
        grossAmount: Math.abs(cash),
        currency: 'JMD',
        sourceType: 'import_batch',
        sourceId: batchId,
        batchId,
        sourceFileHash,
        periodStart,
        periodEnd,
        platform: 'Uber',
        description: 'Cash collected (organization import)',
      });
    }
    if (Math.abs(bank) > 1e-9) {
      out.push({
        idempotencyKey: `${batchId}|payout|BANK`,
        date: reportingDate,
        driverId: primary,
        eventType: 'payout_bank',
        direction: 'inflow',
        netAmount: Math.abs(bank),
        grossAmount: Math.abs(bank),
        currency: 'JMD',
        sourceType: 'import_batch',
        sourceId: batchId,
        batchId,
        sourceFileHash,
        periodStart,
        periodEnd,
        platform: 'Uber',
        description: 'Bank transfer (organization import)',
      });
    }
  }

  // ─── TOLL SUPPORT ADJUSTMENTS / DISPUTE REFUNDS ─────────────────────────────
  const sortedDr = [...disputeRefunds].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id),
  );
  for (const ref of sortedDr) {
    const driverId = String(ref.driverId || '').trim();
    if (!driverId) continue;
    const d = toYmd(ref.date, reportingDate);
    const useTollSupport =
      ref.source === 'platform_import' ||
      ref.source === 'toll_usage';
    out.push({
      idempotencyKey: useTollSupport
        ? `${batchId}|toll_support|${ref.id}`
        : `${batchId}|dispute_refund|${ref.id}`,
      date: d,
      driverId,
      eventType: useTollSupport ? 'toll_support_adjustment' : 'dispute_refund',
      direction: 'inflow',
      netAmount: Math.abs(ref.amount),
      grossAmount: Math.abs(ref.amount),
      currency: 'JMD',
      sourceType: 'import_batch',
      sourceId: batchId,
      batchId,
      sourceFileHash,
      platform: ref.platform?.trim() || 'Uber',
      description: useTollSupport
        ? `Toll support adjustment (case ${ref.supportCaseId})`
        : `Dispute refund (case ${ref.supportCaseId})`,
      metadata: { supportCaseId: ref.supportCaseId, disputeRefundId: ref.id, source: ref.source },
    });
  }

  return out;
}
