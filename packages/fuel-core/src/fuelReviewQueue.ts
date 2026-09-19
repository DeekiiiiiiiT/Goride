/**
 * Shared fuel Review Queue predicates — one source of truth for queue UI,
 * Finalize hard-blockers, and nav badge counts.
 *
 * Queue ≠ ledger: queue predicates ignore date windows; window filters apply
 * only via listUnapprovedFuelTxInWindow (finalize) and ledger helpers.
 *
 * Awaiting-cash split halves are excluded from finalize blockers (C1 re-home);
 * visibility is owned by listAwaitingCashStatement / the Awaiting-statement tab.
 */
import {
  isAwaitingCashTx,
  isStaleAwaitingCash,
  AWAITING_CASH_STALE_DAYS,
} from './fuelSplitCashLifecycle.ts';

/** Classify fields only — no identity required (R9). */
export type FuelClassifyFields = {
  date?: string;
  status?: string;
  type?: string;
  category?: string;
  description?: string;
  paymentMethod?: string;
  amount?: number;
  odometer?: number;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  metadata?: Record<string, unknown> | null;
  entrySource?: string;
  matchedStationId?: string;
};

/** Minimal tx shape with id — works with FinancialTransaction and server KV rows. */
export type FuelReviewQueueTx = FuelClassifyFields & {
  id: string;
};

export type FuelUnapprovedHoldReason = 'log_review' | 'pending_review' | 'station_hold';

export type FuelUnapprovedTxBlocker = {
  id: string;
  dateYmd: string;
  amount: number;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehiclePlate?: string;
  holdReason: FuelUnapprovedHoldReason;
};

export type FuelReviewQueueCounts = {
  logReview: number;
  pendingReady: number;
  /** Unresolved gas-card+cash statement mismatches. */
  splitVariance: number;
  /** Cash half still waiting on Dominion statement. */
  awaitingCash: number;
  /** Awaiting cash older than AWAITING_CASH_STALE_DAYS. */
  staleAwaitingCash: number;
  /** logReview + pendingReady + splitVariance + awaitingCash (station holds excluded). */
  total: number;
};

export function metaFlagOn(v: unknown): boolean {
  return v === true || v === 'true';
}

export function isStationGateHeld(t: FuelClassifyFields): boolean {
  return metaFlagOn(t.metadata?.stationGateHold);
}

/** Expense rows that belong in fuel/driver-merge context. */
export function isLedgerFuelExpenseRow(t: FuelClassifyFields): boolean {
  const typ = String(t.type || '').toLowerCase();
  if (typ !== 'expense') return false;
  const cat = String(t.category || '').toLowerCase();
  if (cat.includes('fuel')) return true;
  const desc = String(t.description || '').toLowerCase();
  if (desc.includes('fuel expense') || desc.startsWith('fuel:') || desc.includes('fuel —')) return true;
  return false;
}

export function isFuelCategory(t: FuelClassifyFields): boolean {
  return t.category === 'Fuel' || t.category === 'Fuel Reimbursement';
}

/** Closed/history filter — non-automated fuel reimbursement-ish rows. */
export function isFuelReimbursement(t: FuelClassifyFields): boolean {
  const isStandardSource =
    !t.metadata?.automated ||
    t.metadata?.source === 'Manual' ||
    t.metadata?.source === 'Bulk Manual';
  const isReimbursementType =
    t.type === 'Reimbursement' ||
    t.type === 'Fuel_Manual_Entry' ||
    t.type === 'Manual_Entry' ||
    (t.type === 'Expense' &&
      (t.paymentMethod === 'Cash' ||
        t.paymentMethod === 'RideShare Cash' ||
        isFuelCategory(t)));
  return Boolean(isStandardSource && isReimbursementType && isFuelCategory(t));
}

/** All Pending fuel rows for Review Queue (includes station-gate-held). */
export function isPendingFuelQueueRow(t: FuelClassifyFields): boolean {
  if (t.status !== 'Pending') return false;
  if (!isFuelCategory(t)) return false;
  return (
    t.type === 'Reimbursement' ||
    t.type === 'Fuel_Manual_Entry' ||
    t.type === 'Manual_Entry' ||
    (t.type === 'Expense' &&
      (t.paymentMethod === 'Cash' ||
        t.paymentMethod === 'RideShare Cash' ||
        isFuelCategory(t)))
  );
}

/** Matches server: admin manual fuel with odometer > 0 skips Log Review. */
export function isAdminManualFuelWithProvidedOdometer(t: FuelClassifyFields): boolean {
  const odo = Number(t.odometer);
  if (!Number.isFinite(odo) || odo <= 0) return false;
  const m = t.metadata || {};
  const entrySrc = m.entrySource ?? t.entrySource;
  if (entrySrc === 'admin-manual' || entrySrc === 'bulk-import') return true;
  const src = m.source;
  if (src === 'Manual' || src === 'Bulk Manual' || src === 'Fuel Log' || src === 'Bulk Log') return true;
  if (t.type === 'Fuel_Manual_Entry' && (m.portal_type === 'Manual_Entry' || m.isManual === true)) {
    return true;
  }
  return false;
}

/** Log Review tab eligibility. */
export function isLogReviewEligible(t: FuelClassifyFields): boolean {
  if (!isPendingFuelQueueRow(t)) return false;
  if (isStationGateHeld(t)) return false;
  if (isAdminManualFuelWithProvidedOdometer(t)) return false;
  if (t.metadata?.needsLogReview) return true;
  const method = t.metadata?.odometerMethod;
  if (isFuelCategory(t) && (!method || method !== 'ai_verified')) return true;
  return false;
}

export function isPendingReadyForReview(t: FuelClassifyFields): boolean {
  if (!isPendingFuelQueueRow(t) || isStationGateHeld(t)) return false;
  // Cash half of a split fill waits on Dominion CSV — not reimbursable yet
  if (metaFlagOn(t.metadata?.awaitingCashStatement)) return false;
  // Card-covered or voided $0 split cash must not clog the approval queue (M3)
  if (metaFlagOn(t.metadata?.splitCardCoveredFull)) return false;
  if (metaFlagOn(t.metadata?.splitCashVoided)) return false;
  const amt = Math.abs(Number(t.amount) || 0);
  if (
    amt < 0.005 &&
    metaFlagOn(t.metadata?.splitReconciled) &&
    typeof t.metadata?.fillGroupId === 'string'
  ) {
    return false;
  }
  return true;
}

/** YYYY-MM-DD from tx.date (ISO or date-only). */
export function fuelTxDateYmd(t: FuelClassifyFields): string {
  const raw = String(t.date || '').trim();
  if (!raw) return '';
  if (raw.includes('T')) return raw.split('T')[0] || '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return '';
}

export function holdReasonForUnapprovedTx(t: FuelClassifyFields): FuelUnapprovedHoldReason {
  if (isStationGateHeld(t)) return 'station_hold';
  if (isLogReviewEligible(t)) return 'log_review';
  return 'pending_review';
}

/** Statement vs pump (or legacy claim) disagreement on a split fill. */
export function isUnresolvedSplitVariance(t: FuelClassifyFields): boolean {
  const m = t.metadata || {};
  if (!metaFlagOn(m.splitVariance)) return false;
  if (metaFlagOn(m.splitReconciled)) return false;
  return typeof m.fillGroupId === 'string' && String(m.fillGroupId).length > 0;
}

/**
 * @deprecated Flag-only acknowledge permanently hides unpaid cash (C2).
 * Use resolveSplitCashAcceptDerived / resolveSplitCashManual / resolveSplitCashVoid.
 */
export function acknowledgeSplitVarianceMeta(
  _meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  throw new Error(
    'acknowledgeSplitVarianceMeta_removed: use resolveSplitCashAcceptDerived|Manual|Void',
  );
}

/** All cash halves still waiting on Dominion (non-blocking for finalize). */
export function listAwaitingCashStatement(txs: FuelReviewQueueTx[]): FuelReviewQueueTx[] {
  return txs.filter((t) => isAwaitingCashTx(t));
}

/** Awaiting cash older than threshold (default 14d). */
export function listStaleAwaitingCashStatement(
  txs: FuelReviewQueueTx[],
  now: Date = new Date(),
  thresholdDays: number = AWAITING_CASH_STALE_DAYS,
): FuelReviewQueueTx[] {
  return txs.filter((t) => isStaleAwaitingCash(t, now, thresholdDays));
}

/**
 * Pending fuel reimbursements in [startYmd, endYmd] inclusive — Finalize hard blockers.
 * Does not invent fuel_entry rows; Pending txs have no fuel_entry yet.
 * Awaiting-cash split halves are excluded — money re-homes to the open period (C1).
 * Visibility for those rows is the Awaiting-statement queue, not finalize.
 */
export function listUnapprovedFuelTxInWindow(
  txs: FuelReviewQueueTx[],
  startYmd: string,
  endYmd: string,
): FuelUnapprovedTxBlocker[] {
  const start = String(startYmd || '').slice(0, 10);
  const end = String(endYmd || '').slice(0, 10);
  if (!start || !end) return [];

  const out: FuelUnapprovedTxBlocker[] = [];
  for (const t of txs) {
    if (!isPendingFuelQueueRow(t)) continue;
    if (metaFlagOn(t.metadata?.awaitingCashStatement)) continue;
    const dateYmd = fuelTxDateYmd(t);
    if (!dateYmd || dateYmd < start || dateYmd > end) continue;
    out.push({
      id: t.id,
      dateYmd,
      amount: Number(t.amount) || 0,
      driverId: t.driverId,
      driverName: t.driverName,
      vehicleId: t.vehicleId,
      vehiclePlate: t.vehiclePlate,
      holdReason: holdReasonForUnapprovedTx(t),
    });
  }
  return out;
}

/** Nav badge / queue work counts — station holds excluded from total. */
export function countFuelReviewQueueWork(
  txs: FuelReviewQueueTx[],
  now: Date = new Date(),
): FuelReviewQueueCounts {
  let logReview = 0;
  let pendingReady = 0;
  let splitVariance = 0;
  let awaitingCash = 0;
  let staleAwaitingCash = 0;
  for (const t of txs) {
    if (isUnresolvedSplitVariance(t)) splitVariance += 1;
    if (isAwaitingCashTx(t)) {
      awaitingCash += 1;
      if (isStaleAwaitingCash(t, now)) staleAwaitingCash += 1;
    }
    if (isLogReviewEligible(t)) logReview += 1;
    else if (isPendingReadyForReview(t)) pendingReady += 1;
  }
  return {
    logReview,
    pendingReady,
    splitVariance,
    awaitingCash,
    staleAwaitingCash,
    total: logReview + pendingReady + splitVariance + awaitingCash,
  };
}

/** Count unresolved split variances on fuel_entry rows (card siblings after statement match). */
export function countSplitVarianceFromFuelEntries(
  entries: Array<{ metadata?: Record<string, unknown> | null }>,
): number {
  let n = 0;
  for (const e of entries) {
    if (isUnresolvedSplitVariance({ metadata: e.metadata || {} })) n += 1;
  }
  return n;
}
