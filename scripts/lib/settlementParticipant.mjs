/**
 * Pure JS mirror of isSettlementParticipantTransaction / periodKeyFor Monday bucketing.
 * Kept in sync by packages/finance-core/src/settlementParticipantParity.test.ts
 * — do not diverge from finance-core predicates.
 */

export function isCashWriteOffTransaction(t) {
  if (!t || !Number.isFinite(t.amount) || t.amount <= 0) return false;
  return t.type === "Cash_Write_Off" || t.category === "Cash Write Off";
}

export function isDriverPayoutTransaction(t) {
  if (!t || !Number.isFinite(t.amount) || t.amount <= 0) return false;
  return t.type === "Payout" && t.category === "Driver Payouts";
}

export function isDriverCashPaymentTransaction(t) {
  if (!t || !Number.isFinite(t.amount) || t.amount <= 0) return false;
  if (isCashWriteOffTransaction(t)) return false;
  if (isDriverPayoutTransaction(t)) return false;
  if (t.paymentMethod === "Tag Balance") return false;
  if (String(t.description || "")
    .toLowerCase()
    .includes("top-up")) {
    return false;
  }
  const cat = String(t.category || "").toLowerCase();
  const type = String(t.type || "").toLowerCase();
  const desc = String(t.description || "").toLowerCase();
  if (cat === "toll usage" || cat === "toll" || cat === "tolls") return false;
  if (cat.includes("fuel") || desc.includes("fuel") || type.includes("fuel")) return false;
  if (t.category === "Cash Collection" || t.type === "Payment_Received") return true;
  if (type === "revenue" && cat.includes("cash")) return true;
  if (desc.includes("cash payment from driver") || desc.includes("cash collection from driver")) {
    return true;
  }
  return false;
}

export function isTollChargeTransaction(t) {
  return String(t?.category || "") === "Toll Charge";
}

export function isSettlementParticipantTransaction(t) {
  if (!t) return false;
  if (isTollChargeTransaction(t)) return true;
  if (isCashWriteOffTransaction(t)) return true;
  if (isDriverPayoutTransaction(t)) return true;
  if (isDriverCashPaymentTransaction(t)) return true;
  return false;
}

/** Monday week key in local calendar (America/Jamaica-aligned for bare YYYY-MM-DD). */
export function periodKeyFor(dateStr, _tz = "America/Jamaica") {
  const raw = String(dateStr || "").trim();
  if (!raw) return null;
  let day = raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw);
    if (isNaN(date.getTime())) return null;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: _tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const y = parts.find((p) => p.type === "year")?.value;
      const m = parts.find((p) => p.type === "month")?.value;
      const d = parts.find((p) => p.type === "day")?.value;
      day = y && m && d ? `${y}-${m}-${d}` : raw.slice(0, 10);
    } catch {
      day = raw.slice(0, 10);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  const dow = local.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  local.setDate(local.getDate() + delta);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function resolveTransactionPeriodAnchor(tx, timezone = "America/Jamaica") {
  const meta = tx?.metadata || {};
  const start = meta.workPeriodStart || meta.periodAnchor || meta.settlementWeek;
  if (start) return String(start).slice(0, 10);
  if (!tx?.date) return null;
  return periodKeyFor(String(tx.date), timezone);
}
