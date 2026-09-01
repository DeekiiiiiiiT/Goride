/**
 * Pure toll-disposition classifier — the single policy for how a toll_ledger
 * entry affects a driver's financial settlement. Locked policy:
 *
 *   - cash toll (driver paid company cash)              → cashWash (credit vs owed)
 *   - tag toll resolved Personal                        → personal (billed to driver)
 *   - tag toll business / write_off / refunded / matched→ fleet (no driver effect)
 *   - otherwise                                          → unresolved (pending)
 *
 * Receipt image is documentation only — paymentMethod controls cash wash.
 *
 * Cash stays cashWash even when resolution is personal: the Charge Driver
 * wallet debit is the personal bill. Moving cash into disposition.personal
 * would drop the wash and double-count alongside that debit.
 */

export type TollDispositionClass = "cashWash" | "personal" | "fleet" | "unresolved";

export interface TollLedgerLike {
  resolution?: string | null;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  isReconciled?: boolean;
  tripId?: string | null;
  amount?: number;
}

/** Classify one toll_ledger entry into its settlement bucket. */
export function classifyTollLedgerEntry(e: TollLedgerLike): TollDispositionClass {
  const pm = (e.paymentMethod || "").toLowerCase();
  const isCash = pm.includes("cash");
  if (isCash) return "cashWash";

  const res = (e.resolution || "").toLowerCase();
  if (res === "personal") return "personal";
  if (res === "business" || res === "write_off" || res === "refunded") return "fleet";

  if (e.tripId || e.isReconciled) return "fleet";
  return "unresolved";
}

/** Payment-source split — receipt URL alone never counts as cash. */
export function isCashPaidToll(e: Pick<TollLedgerLike, "paymentMethod" | "receiptUrl">): boolean {
  const pm = (e.paymentMethod || "").toLowerCase();
  return pm.includes("cash");
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

/** Accumulate an entry's |amount| into the matching bucket. */
export function addToTollDisposition(d: TollDisposition, e: TollLedgerLike): void {
  const amt = Math.abs(Number(e.amount) || 0);
  d[classifyTollLedgerEntry(e)] += amt;
}

/** Round each bucket to cents (for JSON responses). */
export function roundTollDisposition(d: TollDisposition): TollDisposition {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { cashWash: r(d.cashWash), personal: r(d.personal), fleet: r(d.fleet), unresolved: r(d.unresolved) };
}
