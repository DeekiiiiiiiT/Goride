type CashPaymentLike = {
  amount?: number;
  category?: string;
  type?: string;
  description?: string;
  paymentMethod?: string;
  status?: string;
  metadata?: { workPeriodStart?: string };
};

export function isCashWriteOffTransaction(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;
  if (t.type === 'Cash_Write_Off' || t.category === 'Cash Write Off') return true;
  return false;
}

export function isDriverPayoutTransaction(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;
  if (t.type === 'Payout' && t.category === 'Driver Payouts') return true;
  return false;
}

export function isClearedCashWriteOff(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'status'> | null | undefined,
): boolean {
  if (!isCashWriteOffTransaction(t)) return false;
  const status = String(t!.status || '').toLowerCase().trim();
  return status === 'completed' || status === 'verified';
}

export function isClearedDriverPayout(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'paymentMethod' | 'status'> | null | undefined,
): boolean {
  if (!isDriverPayoutTransaction(t)) return false;
  const status = String(t!.status || '').toLowerCase().trim();
  const pm = String(t!.paymentMethod || 'Cash').toLowerCase().trim();
  const cleared = status === 'completed' || status === 'verified';
  // Blank status is unverified — never treat as cleared.
  if (pm === 'cash' || pm === '') {
    return cleared;
  }
  return cleared;
}

export function isDriverCashPaymentTransaction(
  t: Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'description' | 'paymentMethod'> | null | undefined,
): boolean {
  if (!t || !Number.isFinite(t.amount) || (t.amount as number) <= 0) return false;
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
  if (type === 'revenue' && cat.includes('cash')) return true;
  if (desc.includes('cash payment from driver') || desc.includes('cash collection from driver')) {
    return true;
  }
  return false;
}

/** Toll Charge rows feed tollChargedToDriver in the period rebuild (not via cash predicates). */
export function isTollChargeTransaction(
  t: Pick<CashPaymentLike, 'category'> | null | undefined,
): boolean {
  return String(t?.category || '') === 'Toll Charge';
}

/**
 * Anything computeWeekCashBase or the Toll Charge filter reads.
 * Mirror, backfill, and parity must all use this — one definition.
 */
export function isSettlementParticipantTransaction(
  t:
    | Pick<CashPaymentLike, 'amount' | 'category' | 'type' | 'description' | 'paymentMethod'>
    | null
    | undefined,
): boolean {
  if (!t) return false;
  if (isTollChargeTransaction(t)) return true;
  if (isCashWriteOffTransaction(t)) return true;
  if (isDriverPayoutTransaction(t)) return true;
  if (isDriverCashPaymentTransaction(t)) return true;
  return false;
}

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
  // Blank status is unverified — never treat as cleared.
  if (pm === 'cash' || pm === '') {
    return cleared;
  }
  return cleared;
}

export function cashPaymentWeekKey(
  t: Pick<CashPaymentLike, 'metadata'> | null | undefined,
): string | null {
  const raw = t?.metadata?.workPeriodStart;
  if (!raw) return null;
  const ymd = String(raw).split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export function isCashReturnedForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isClearedDriverCashPayment(t)) return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}

export function isCashWriteOffForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isClearedCashWriteOff(t)) return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}

export function isSettlementPaidForWeek(
  t: CashPaymentLike | null | undefined,
  weekMondayYmd: string,
): boolean {
  if (!t || !isClearedDriverPayout(t)) return false;
  const key = cashPaymentWeekKey(t);
  return key != null && key === weekMondayYmd;
}

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
