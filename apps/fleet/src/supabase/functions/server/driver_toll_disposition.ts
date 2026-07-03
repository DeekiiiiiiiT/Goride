/**
 * Pure toll-disposition classifier — the single policy for how a toll_ledger
 * entry affects a driver's financial settlement. Locked policy:
 *
 *   - cash toll (driver paid company cash)              → cashWash (credit vs owed)
 *   - tag toll resolved Personal                        → personal (billed to driver)
 *   - tag toll business / write_off / refunded / matched→ fleet (no driver effect)
 *   - otherwise                                          → unresolved (pending)
 *
 * Pure + dependency-free so it is unit-testable (Deno) and can be hand-mirrored
 * to the client. Consumed by the earnings-history endpoint (per-period
 * disposition) and /driver-toll-charges. Only surfaces when the
 * unifiedTollSettlementEnabled flag is ON.
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
  const res = (e.resolution || "").toLowerCase();
  if (res === "personal") return "personal";
  if (res === "business" || res === "write_off" || res === "refunded") return "fleet";

  // Cash tolls the driver paid out of company cash → wash.
  const pm = (e.paymentMethod || "").toLowerCase();
  const isCash = pm === "cash" || !!e.receiptUrl;
  if (isCash) return "cashWash";

  // Tag / fleet-account with no explicit resolution:
  if (e.tripId || e.isReconciled) return "fleet"; // matched to a trip (platform reimbursed)
  return "unresolved";
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
