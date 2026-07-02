/**
 * tollTagLedger — canonical "does this toll belong to the prepaid TAG ledger?"
 *
 * A toll tag is a prepaid transponder. Its ledger is a running balance made of:
 *   • tag-balance usage  (type `usage`,  paymentMethod `tag_balance`, amount < 0)
 *   • top-ups            (type `top_up`,  amount > 0)  — credit to the tag
 *   • refunds            (type `refund`,  amount > 0)  — credit to the tag
 *
 * Everything else is OFF-tag and must never appear on the tag screen:
 *   • cash tolls   (paymentMethod `cash`, or legacy category `Tolls`/`Toll`, or a receipt)
 *   • card tolls   (paymentMethod `card`)
 *   • fleet-account / geofence tolls (paymentMethod `fleet_account`)
 *
 * Why payment method and not `tollTagId`? On existing data `tollTagId`/`tagNumber`
 * are null on virtually all records, and the ledger→tx mapper always stamps
 * `category: "Toll Usage"` regardless of type. The reliable, canonical signal is
 * `paymentMethod` (cash tolls are explicitly `cash`; genuine tag activity defaults
 * to `tag_balance`). These predicates operate on the tx shape returned by
 * `GET /toll-logs` (see tollLedgerToTxShape on the server), where `paymentMethod`
 * is the display string "Tag Balance" | "Cash" | "Card" | "Fleet Account".
 */

/** Minimal shape needed to classify a toll transaction. */
export interface TagTxLike {
  category?: string | null;
  paymentMethod?: string | null;
  amount?: number | null;
  receiptUrl?: string | null;
  type?: string | null;
}

const normPm = (tx: TagTxLike): string => (tx.paymentMethod || '').toLowerCase();

/**
 * True when the toll was paid OFF the tag (cash / card / fleet-account / legacy
 * cash category / receipt-backed) and therefore is not part of the tag ledger.
 */
export function isOffTagToll(tx: TagTxLike): boolean {
  const cat = (tx.category || '').toLowerCase();
  // Legacy cash tolls carry category "tolls"/"toll" (never "toll usage").
  if (cat === 'tolls' || cat === 'toll') return true;
  // A receipt means it was paid manually (cash), off the tag.
  if (tx.receiptUrl) return true;
  // Explicit non-tag payment methods.
  const pm = normPm(tx);
  if (pm.includes('cash') || pm.includes('card') || pm.includes('fleet') || pm.includes('account')) {
    return true;
  }
  return false;
}

/**
 * True when the transaction belongs to the prepaid tag ledger (tag-balance usage
 * or a top-up/refund credit). The ledger default `tag_balance` and legacy
 * `Toll Top-up` category both pass here.
 */
export function isTagLedgerTx(tx: TagTxLike): boolean {
  return !isOffTagToll(tx);
}

/** Tag-balance deduction (a transponder read at a gantry). */
export function isTagUsage(tx: TagTxLike): boolean {
  return isTagLedgerTx(tx) && (tx.amount ?? 0) < 0;
}

/** Credit to the tag balance (top-up or refund). */
export function isTagCredit(tx: TagTxLike): boolean {
  return isTagLedgerTx(tx) && (tx.amount ?? 0) > 0;
}
