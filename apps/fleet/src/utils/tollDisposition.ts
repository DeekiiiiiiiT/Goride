/**
 * Pure toll-disposition classifier (client mirror of the server module
 * apps/fleet/src/supabase/functions/server/driver_toll_disposition.ts).
 *
 * Single policy for how a toll affects a driver's settlement:
 *   - cash toll (driver paid company cash)               → cashWash (credit vs owed)
 *   - tag toll resolved Personal                         → personal (billed to driver)
 *   - tag toll business / write_off / refunded / matched → fleet (no driver effect)
 *   - otherwise                                          → unresolved (pending)
 *
 * Cash stays cashWash even when resolution is personal: the Charge Driver
 * wallet debit is the personal bill. Moving cash into disposition.personal
 * would drop the wash and double-count alongside that debit.
 *
 * Kept byte-for-byte in behavior with the server copy (guarded by matching
 * tests). The client consumes the server's per-period disposition numbers at
 * runtime; this mirror exists so the policy is unit-testable in Vitest.
 */

export type TollDispositionClass = 'cashWash' | 'personal' | 'fleet' | 'unresolved';

export interface TollLedgerLike {
  resolution?: string | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  isReconciled?: boolean;
  tripId?: string | null;
  amount?: number;
}

export function classifyTollLedgerEntry(e: TollLedgerLike): TollDispositionClass {
  const pm = (e.paymentMethod || '').toLowerCase();
  const isCash = pm === 'cash' || !!e.receiptUrl;
  // Cash plaza spend always washes — personal cash liability is Toll Charge rows.
  if (isCash) return 'cashWash';

  const res = (e.resolution || '').toLowerCase();
  if (res === 'personal') return 'personal';
  if (res === 'business' || res === 'write_off' || res === 'refunded') return 'fleet';

  if (e.tripId || e.isReconciled) return 'fleet';
  return 'unresolved';
}

/**
 * Payment-source split for Cash vs Tag spend columns.
 * Ignores settlement resolution (personal / business) — a cash plaza payment
 * stays Cash even when later charged to the driver as personal.
 */
export function isCashPaidToll(e: Pick<TollLedgerLike, 'paymentMethod' | 'receiptUrl'>): boolean {
  const pm = (e.paymentMethod || '').toLowerCase();
  return pm === 'cash' || !!e.receiptUrl;
}

export interface TollDisposition {
  cashWash: number;
  personal: number;
  fleet: number;
  unresolved: number;
}

export function emptyTollDisposition(): TollDisposition {
  return { cashWash: 0, personal: 0, fleet: 0, unresolved: 0 };
}

export function addToTollDisposition(d: TollDisposition, e: TollLedgerLike): void {
  const amt = Math.abs(Number(e.amount) || 0);
  d[classifyTollLedgerEntry(e)] += amt;
}
