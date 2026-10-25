import type { CanonicalLedgerEventInput } from '../types/ledgerCanonical';
import type { Trip, OrganizationMetrics, DisputeRefund } from '../types/data';
import type { UberSsotTotals } from './uberSsot';
import { orgBankLedgerDriverId } from './fleetOrgIdentity';
import {
  importMoneyIdempotencyKey,
  periodEndForAnchor,
  periodKeyFor,
  splitAmountByStatementWeeks,
  statementWeekWeightsFromTrips,
} from '@roam/finance-core';

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

/**
 * The organization CSV has no dates. A one-day stamp, or a span that starts after the
 * trips, is the folder end (the next Monday). That must not become the earning week.
 * The week is the Monday–Sunday that contains the trips in this upload.
 */
export function earningWeekForOrgStatement(
  orgStart: string,
  orgEnd: string,
  tripDay: string,
): { periodStart: string; periodEnd: string } {
  const tripWeek = periodKeyFor(tripDay);
  if (!tripWeek) return { periodStart: orgStart, periodEnd: orgEnd };
  const tripWeekEnd = periodEndForAnchor(tripWeek);
  const start = orgStart.slice(0, 10);
  const end = orgEnd.slice(0, 10);
  const sameDay = !start || !end || start === end;
  const overlapsTrips = start <= tripWeekEnd && end >= tripWeek;
  if (sameDay || !overlapsTrips) {
    return { periodStart: tripWeek, periodEnd: tripWeekEnd };
  }
  return { periodStart: start, periodEnd: end };
}

/** Min/max trip `date` (YYYY-MM-DD) across a batch — used for Import History period matching. */
export function tripDateBounds(trips: Trip[]): { min: string; max: string } {
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
    idempotencyKey: importMoneyIdempotencyKey(
      p.sourceFileHash,
      p.batchId,
      `stmt|${p.driverId}|${p.lineCode}`,
    ),
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
 * - payout_bank org deposit from payments_organization (recipient: org)
 * - payout_cash / payout_bank driver share from payments_driver (bankRole: driver_share)
 * - toll refund lines (REFUNDS_TOLL)
 * - toll_support_adjustment / dispute_refund events
 *
 * Idempotency keys follow sourceFileHash when present so a re-import of the same CSV
 * cannot mint a second copy (C1).
 */
export function buildCanonicalImportEvents(
  params: BuildCanonicalImportEventsParams,
): CanonicalLedgerEventInput[] {
  const { batchId, sourceFileHash, trips, organizationMetrics, disputeRefunds, uberStatementsByDriverId } =
    params;
  const org = organizationMetrics ?? null;
  const bounds = tripDateBounds(trips);
  const rawPeriodStart = org ? toYmd(org.periodStart, bounds.min) : bounds.min;
  const rawPeriodEnd = org ? toYmd(org.periodEnd, bounds.max) : bounds.max;
  /**
   * Ledger `date` for import_batch rows (promotion, payouts, REFUNDS_TOLL): **earliest trip day** in the batch.
   * The organization file has no week inside it. Use the trip week, not the folder's end Monday.
   */
  const ledgerPostingDate = bounds.min;
  const earningWeek = earningWeekForOrgStatement(rawPeriodStart, rawPeriodEnd, ledgerPostingDate);
  const periodStart = earningWeek.periodStart;
  const periodEnd = earningWeek.periodEnd;
  const weekWeights = statementWeekWeightsFromTrips(trips);

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
      date: ledgerPostingDate,
      periodStart,
      periodEnd,
      description: 'Organization statement: toll refunds',
    });
  }

  // Payments-driver "Total Earnings : Promotions" is already inside trip fare.
  // Uber's earnings screen has no promotions line (Oct 5 and Oct 12, 2026). Do not post it again.
  const ssot = uberStatementsByDriverId ?? null;

  // ─── ORG BANK DEPOSIT (payments_organization — fleet account wire, not a driver) ─
  if (org) {
    const orgBank = Math.abs(Number(org.bankTransfer) || 0);
    if (orgBank > 1e-9) {
      const orgLedgerId = orgBankLedgerDriverId(org.organizationUuid);
      out.push({
        idempotencyKey: importMoneyIdempotencyKey(
          sourceFileHash,
          batchId,
          `payout|bank|org|${orgLedgerId.toLowerCase()}`,
        ),
        date: periodStart !== periodEnd ? periodStart : ledgerPostingDate,
        driverId: 'org-bank',
        eventType: 'payout_bank',
        direction: 'inflow',
        netAmount: orgBank,
        grossAmount: orgBank,
        currency: 'JMD',
        sourceType: 'import_batch',
        sourceId: batchId,
        batchId,
        sourceFileHash,
        periodStart,
        periodEnd,
        platform: 'Uber',
        description: 'Fleet bank deposit (payments_organization)',
        metadata: {
          source: 'payments_organization',
          recipient: 'org',
          bankRole: 'statement_net',
          weekKey: periodStart !== periodEnd ? periodStart : undefined,
          organizationUuid: org.organizationUuid || orgLedgerId,
          organizationName: org.organizationName || undefined,
        },
      });
    }
  }

  // ─── DRIVER PAYOUT SHARES (payments_driver — allocation / cash risk, not org wire) ─
  if (ssot && Object.keys(ssot).length > 0) {
    const driverIds = Object.keys(ssot).sort((a, b) => a.localeCompare(b));
    for (const driverId of driverIds) {
      const totals = ssot[driverId];
      if (!totals) continue;
      const did = String(driverId).trim();
      if (!did) continue;
      const cash = Math.abs(Number(totals.cashCollected) || 0);
      const bank = Math.abs(Number(totals.bankTransferred) || 0);
      if (cash < 1e-9 && bank < 1e-9) continue;
      if (cash > 1e-9) {
        const cashSlices = splitAmountByStatementWeeks(cash, weekWeights, ledgerPostingDate);
        for (const slice of cashSlices) {
          const multi = cashSlices.length > 1;
          out.push({
            idempotencyKey: importMoneyIdempotencyKey(
              sourceFileHash,
              batchId,
              multi
                ? `payout|cash|${did.toLowerCase()}|${slice.weekKey}`
                : `payout|cash|${did.toLowerCase()}`,
            ),
            date: slice.date,
            driverId: did,
            eventType: 'payout_cash',
            direction: 'inflow',
            netAmount: slice.amount,
            grossAmount: slice.amount,
            currency: 'JMD',
            sourceType: 'import_batch',
            sourceId: batchId,
            batchId,
            sourceFileHash,
            periodStart,
            periodEnd,
            platform: 'Uber',
            description: 'Cash collected (payments_driver)',
            metadata: { source: 'payments_driver', weekKey: slice.weekKey },
          });
        }
      }
      // Driver bank share — informational allocation for Settlement; not the fleet wire.
      if (bank > 1e-9) {
        const bankSlices = splitAmountByStatementWeeks(bank, weekWeights, ledgerPostingDate);
        for (const slice of bankSlices) {
          const multi = bankSlices.length > 1;
          out.push({
            idempotencyKey: importMoneyIdempotencyKey(
              sourceFileHash,
              batchId,
              multi
                ? `payout|bank|share|${did.toLowerCase()}|${slice.weekKey}`
                : `payout|bank|share|${did.toLowerCase()}`,
            ),
            date: slice.date,
            driverId: did,
            eventType: 'payout_bank',
            direction: 'inflow',
            netAmount: slice.amount,
            grossAmount: slice.amount,
            currency: 'JMD',
            sourceType: 'import_batch',
            sourceId: batchId,
            batchId,
            sourceFileHash,
            periodStart,
            periodEnd,
            platform: 'Uber',
            description: 'Bank allocation (payments_driver share)',
            metadata: {
              source: 'payments_driver',
              bankRole: 'driver_share',
              recipient: 'driver_share',
              weekKey: slice.weekKey,
            },
          });
        }
      }
    }
  }

  // ─── TOLL SUPPORT ADJUSTMENTS / DISPUTE REFUNDS ─────────────────────────────
  const sortedDr = [...disputeRefunds].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id),
  );
  for (const ref of sortedDr) {
    const driverId = String(ref.driverId || '').trim();
    if (!driverId) continue;
    const d = toYmd(ref.date, ledgerPostingDate);
    const useTollSupport =
      ref.source === 'platform_import' ||
      ref.source === 'toll_usage';
    out.push({
      idempotencyKey: importMoneyIdempotencyKey(
        sourceFileHash,
        batchId,
        useTollSupport ? `toll_support|${ref.id}` : `dispute_refund|${ref.id}`,
      ),
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
