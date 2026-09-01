/**
 * Trip toll predicates shared by fleet UI and edge projection (A-9).
 */
export type PeriodTripLike = {
  id?: string | null;
  tollCharges?: number | null;
  tollRefundResolution?: { status?: string | null } | null;
};

export function isTripCashWashSpend(
  trip: PeriodTripLike,
  linkedTripIds: Set<string>,
): boolean {
  if (!trip?.id || linkedTripIds.has(String(trip.id))) return false;
  const amt = Math.abs(Number(trip.tollCharges) || 0);
  if (amt <= 0.005) return false;
  const status = trip?.tollRefundResolution?.status;
  if (status === 'phantom' || status === 'expense_logged') return false;
  return status === 'cash_wash';
}

export function isTripTollActionable(
  trip: PeriodTripLike,
  linkedTripIds: Set<string>,
): boolean {
  if (!trip?.id || linkedTripIds.has(String(trip.id))) return false;
  const amt = Math.abs(Number(trip.tollCharges) || 0);
  if (amt <= 0.005) return false;
  const status = trip?.tollRefundResolution?.status;
  if (status === 'phantom' || status === 'expense_logged' || status === 'cash_wash') {
    return false;
  }
  return !status || status === 'pending';
}
