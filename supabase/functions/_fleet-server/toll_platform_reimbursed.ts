/**
 * Plaza/tag tolls reimbursed by Uber / InDrive / Roam are a wash — not a
 * fleet cost and not a driver bill. Write-off and Business stay fleet cost.
 * Personal stays the Charge Driver path (P&L offset is emitted elsewhere).
 */

export function isPersonalTollResolution(resolution?: string | null): boolean {
  return String(resolution || "").toLowerCase() === "personal";
}

/** Explicit "charge to fleet" or write-off — real unrecovered fleet loss. */
export function isFleetAbsorbingTollResolution(resolution?: string | null): boolean {
  const r = String(resolution || "").toLowerCase();
  return r === "write_off" || r === "business";
}

export type PlazaTollReimbursedLike = {
  resolution?: string | null;
  tripId?: string | null;
  isReconciled?: boolean;
  status?: string | null;
  type?: string | null;
};

function isUsageLike(type?: string | null): boolean {
  const t = String(type || "").toLowerCase().replace("-", "_");
  if (!t) return true;
  return t === "usage" || t === "toll_usage";
}

/**
 * True when this plaza/tag row was matched to a rider-paid trip (or marked
 * refunded) and is not personal / write-off / business.
 */
export function isPlatformReimbursedPlazaToll(e: PlazaTollReimbursedLike): boolean {
  if (!isUsageLike(e.type)) return false;
  if (isPersonalTollResolution(e.resolution)) return false;
  if (isFleetAbsorbingTollResolution(e.resolution)) return false;
  if (String(e.resolution || "").toLowerCase() === "refunded") return true;
  const tripId = String(e.tripId || "").trim();
  const reconciled =
    !!e.isReconciled || String(e.status || "").toLowerCase() === "reconciled";
  return !!tripId && reconciled;
}
