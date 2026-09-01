/**
 * SQL predicate mirror for isSettlementParticipantTransaction.
 * Must stay in sync with packages/finance-core/src/driverCashPayment.ts
 * and scripts/lib/settlementParticipant.mjs — verified by verify_settlement_predicate_parity.mjs
 */
export function sqlSettlementParticipantPredicate(row) {
  const cat = String(row.cat ?? row.category ?? "");
  const typ = String(row.typ ?? row.type ?? "");
  const descr = String(row.descr ?? row.description ?? "").toLowerCase();
  const pm = String(row.pm ?? row.paymentMethod ?? "");
  const amt = Number(row.amt ?? row.amount ?? 0);

  if (cat === "Toll Charge") return true;
  if ((typ === "Cash_Write_Off" || cat === "Cash Write Off") && amt > 0) return true;
  if ((typ === "Payout" || cat === "Driver Payouts") && amt > 0) return true;

  if (pm === "Tag Balance") return false;
  if (descr.includes("top-up")) return false;

  const catL = cat.toLowerCase();
  const typL = typ.toLowerCase();
  if (["toll usage", "toll", "tolls"].includes(catL)) return false;
  if (catL.includes("fuel") || descr.includes("fuel") || typL.includes("fuel")) return false;

  if (cat === "Cash Collection" || typ === "Payment_Received") return amt > 0;
  if (typL === "revenue" && catL.includes("cash")) return amt > 0;
  if (descr.includes("cash payment from driver") || descr.includes("cash collection from driver")) {
    return amt > 0;
  }
  return false;
}
