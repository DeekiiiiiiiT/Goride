// ── Toll Ledger Types ───────────────────────────────────────────────────────
// Matches the flat shape returned by GET /toll-reconciliation/export

export type TollReconciliationStatus = 'Matched' | 'Unmatched' | 'Dismissed' | 'Approved';

export interface TollLedgerEntry {
  // Core
  id: string;
  date: string;
  time: string;
  vehicleId: string;
  vehiclePlate: string;
  driverId: string;
  driverName: string;

  // Toll Details
  plaza: string;
  type: string;
  paymentMethod: string;
  amount: number;
  absAmount: number;
  status: string;
  description: string;

  // Reference
  referenceTagId: string;
  batchId: string;

  // Reconciliation
  reconciliationStatus: TollReconciliationStatus | string;
  resolution: string;

  // Matched Trip (populated only for "Matched" status)
  matchedTripId: string;
  matchedTripDate: string;
  matchedTripPlatform: string;
  matchedTripPickup: string;
  matchedTripDropoff: string;
  reconciledAt: string;
  reconciledBy: string;

  // Financial (populated only for "Matched" status)
  tripTollCharges: number;
  refundAmount: number;
  lossAmount: number;

  // Suggestions (populated only for "Unmatched" status)
  hasSuggestions: string;
  isAmbiguous: string;
  topSuggestionScore: number;
  topSuggestionTripId: string;
  suggestionCount: number;
}

/**
 * Normalizes a raw export row from the server into a TollLedgerEntry.
 * Converts empty-string numeric fields to 0.
 */
export function normalizeTollLedgerEntry(raw: Record<string, any>): TollLedgerEntry {
  const toNum = (v: any): number => {
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };

  return {
    id: raw.id || '',
    date: raw.date || '',
    time: raw.time || '',
    vehicleId: raw.vehicleId || '',
    vehiclePlate: raw.vehiclePlate || '',
    driverId: raw.driverId || '',
    driverName: raw.driverName || '',

    plaza: raw.plaza || '',
    type: raw.type || '',
    paymentMethod: raw.paymentMethod || '',
    amount: toNum(raw.amount),
    absAmount: toNum(raw.absAmount),
    status: raw.status || '',
    description: raw.description || '',

    referenceTagId: raw.referenceTagId || '',
    batchId: raw.batchId || '',

    reconciliationStatus: raw.reconciliationStatus || '',
    resolution: raw.resolution || '',

    matchedTripId: raw.matchedTripId || '',
    matchedTripDate: raw.matchedTripDate || '',
    matchedTripPlatform: raw.matchedTripPlatform || '',
    matchedTripPickup: raw.matchedTripPickup || '',
    matchedTripDropoff: raw.matchedTripDropoff || '',
    reconciledAt: raw.reconciledAt || '',
    reconciledBy: raw.reconciledBy || '',

    tripTollCharges: toNum(raw.tripTollCharges),
    refundAmount: toNum(raw.refundAmount),
    lossAmount: toNum(raw.lossAmount),

    hasSuggestions: raw.hasSuggestions || '',
    isAmbiguous: raw.isAmbiguous || '',
    topSuggestionScore: toNum(raw.topSuggestionScore),
    topSuggestionTripId: raw.topSuggestionTripId || '',
    suggestionCount: toNum(raw.suggestionCount),
  };
}
