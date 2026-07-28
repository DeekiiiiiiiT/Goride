/** Minimal shape — do not import apps/fleet/src/types/data (Deno edge packager / BOOT_ERROR). */
type CashPaymentLike = {
  amount?: number;
  category?: string;
  type?: string;
  description?: string;
  paymentMethod?: string;
  status?: string;
  metadata?: { workPeriodStart?: string };
};

/** Fleet forgives cash still owed — never counts as Cash Returned / cash collected. */
export function isCashWriteOffTransaction(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;
  if (t.type === 'Cash_Write_Off' || t.category === 'Cash Write Off') return true;
  return false;
}

/** Fleet → driver settlement payout — never counts as Cash Returned. */
export function isDriverPayoutTransaction(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;
  if (t.type === 'Payout' || t.category === 'Driver Payouts') return true;
  return false;
}

/** Cleared write-off (Completed / Verified; blank status treated as completed). */
export function isClearedCashWriteOff(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'status'> | null | undefined,
): boolean {
  if (!isCashWriteOffTransaction(t)) return false;
  const status = String(t!.status || '').toLowerCase().trim();
  return status === 'completed' || status === 'verified' || status === '';
}

/** Cleared fleet→driver payout (Cash: Completed/Verified/blank; bank/mobile: Completed/Verified only). */
export function isClearedDriverPayout(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'paymentMethod' | 'status'> | null | undefined,
): boolean {
  if (!isDriverPayoutTransaction(t)) return false;
  const status = String(t!.status || '').toLowerCase().trim();
  const pm = String(t!.paymentMethod || 'Cash').toLowerCase().trim();
  const cleared = status === 'completed' || status === 'verified';
  if (pm === 'cash' || pm === '') {
    return cleared || status === '';
  }
  return cleared;
}

/** Driver → fleet cash handoff (Payments Log, wallet totals, weekly settlement). */
export function isDriverCashPaymentTransaction(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'description' | 'paymentMethod'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;

  // Hard wall: write-offs / payouts must never inflate Cash Returned / BF cash collected.
  if (isCashWriteOffTransaction(t)) return false;
  if (isDriverPayoutTransaction(t)) return false;

  if (t.paymentMethod === 'Tag Balance') return false;
  if (t.description?.toLowerCase().includes('top-up')) return false;

  const cat = (t.category || '').toLowerCase();
  const type = (t.type || '').toLowerCase();
  const desc = (t.description || '').toLowerCase();

  if (cat === 'toll usage' || cat === 'toll' || cat === 'tolls') return false;
  if (cat.includes('fuel') || desc.includes('fuel') || type.includes('fuel')) return false;

  if (t.category === 'Cash Collection' || t.type === 'Payment_Received') return true;

  // Legacy rows: type Revenue + cash category before Payment_Received existed
  if (type === 'revenue' && cat.includes('cash')) return true;

  // Legacy manual logs keyed by description
  if (desc.includes('cash payment from driver') || desc.includes('cash collection from driver')) {
    return true;
  }

  return false;
}

/**
 * Cash Returned gate: money must be cleared.
 * - Cash: Completed / Verified (legacy blank status treated as completed)
 * - Bank / Mobile Money / Check: Completed or Verified only — never Pending
 */
export function isClearedDriverCashPayment(
  t: Pick<
    CashPaymentLike,
    'amount' | 'category' | 'type' | 'description' | 'paymentMethod' | 'status'
  > | null | undefined,
): boolean {
  if (!isDriverCashPaymentTransaction(t)) return false;
  const status = String(t!.status || '').toLowerCase().trim();
  const pm = String(t!.paymentMethod || 'Cash').toLowerCase().trim();

  const cleared = status === 'completed' || status === 'verified';
  if (pm === 'cash' || pm === '') {
    return cleared || status === '';
  }
  return cleared;
}

/** Settlement Week Monday key (yyyy-MM-dd) from workPeriodStart metadata. */
export function cashPaymentWeekKey(
  t: Pick<CashPaymentLike, 'metadata'> | null | undefined,
): string | null {
  const raw = t?.metadata?.workPeriodStart;
  if (!raw) return null;
  const ymd = String(raw).split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** True when cleared payment is tagged exactly to this Settlement Week Monday. */
export function isCashReturnedForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isClearedDriverCashPayment(t)) return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}

/** True when cleared write-off is tagged exactly to this Settlement Week Monday. */
export function isCashWriteOffForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isClearedCashWriteOff(t)) return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}

/** True when cleared Driver Payout is tagged exactly to this Settlement Week Monday. */
export function isSettlementPaidForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isClearedDriverPayout(t)) return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}

/** Pending (uncleared) Driver Payout tagged to this Settlement Week Monday. */
export function isPendingDriverPayoutForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isDriverPayoutTransaction(t)) return false;
  if (isClearedDriverPayout(t)) return false;
  const status = String(t.status || '').toLowerCase().trim();
  if (status !== 'pending') return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}
