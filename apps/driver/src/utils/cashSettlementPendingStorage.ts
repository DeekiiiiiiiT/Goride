const STORAGE_KEY = 'roam-driver-cash-settlement-pending';

export type CashSettlementPending = {
  rideId: string;
  idempotencyKey: string;
  cashReceivedMinor: number;
  attemptedAt: string;
};

export function readCashSettlementPending(): CashSettlementPending | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CashSettlementPending;
    if (!parsed?.rideId || !parsed?.idempotencyKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCashSettlementPending(pending: CashSettlementPending): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export function clearCashSettlementPending(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
