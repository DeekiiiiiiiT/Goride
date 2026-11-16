/**
 * Repeat-save guard for driver fuel expenses (POST /transactions).
 *
 * A driver whose phone never shows "saved" presses Save again. Each press is a new
 * transaction id, so without this guard every press books another cash fill
 * (5179KZ, 8 Nov 2026: one J$4,000 fill saved three times in three minutes).
 *
 * Same driver + vehicle + day + amount + odometer + liters, saved within 15 minutes,
 * is the same fill: the route returns the first save instead of booking a new one.
 */
import { fromKvStore } from "./fleet_sql_bridge.ts";

export const REPEAT_FUEL_SAVE_WINDOW_MS = 15 * 60 * 1000;

type Rec = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function ymd(v: unknown): string {
  const s = str(v);
  return s.includes("T") ? s.split("T")[0] : s.slice(0, 10);
}

function savedAtMs(tx: Rec): number {
  const t = Date.parse(str(tx.timestamp));
  return Number.isFinite(t) ? t : NaN;
}

/** Liters: top-level quantity once saved, metadata.fuelVolume on the way in. */
function litersOf(tx: Rec): number {
  const q = num(tx.quantity);
  if (Number.isFinite(q)) return q;
  const m = tx.metadata;
  return m && typeof m === "object" ? num((m as Rec).fuelVolume) : NaN;
}

function isFuelCategory(tx: Rec): boolean {
  const c = str(tx.category);
  return c === "Fuel" || c === "Fuel Reimbursement";
}

/** Pure: is `existing` the same fill as `incoming`, saved moments earlier? */
export function isRepeatFuelSave(incoming: Rec, existing: Rec, nowMs: number): boolean {
  if (str(existing.id) === "" || str(existing.id) === str(incoming.id)) return false;
  if (!isFuelCategory(incoming) || !isFuelCategory(existing)) return false;
  if (str(incoming.type) !== "Expense" || str(existing.type) !== "Expense") return false;

  const driver = str(incoming.driverId);
  const vehicle = str(incoming.vehicleId);
  if (!driver || !vehicle) return false;
  if (str(existing.driverId) !== driver || str(existing.vehicleId) !== vehicle) return false;
  if (ymd(existing.date) !== ymd(incoming.date) || !ymd(incoming.date)) return false;

  const amt = Math.abs(num(incoming.amount));
  if (!(amt > 0) || Math.abs(num(existing.amount)) !== amt) return false;

  const odo = num(incoming.odometer);
  if (!(odo > 0) || num(existing.odometer) !== odo) return false;

  const litersIn = litersOf(incoming);
  const litersEx = litersOf(existing);
  if (Number.isFinite(litersIn) && Number.isFinite(litersEx) && Math.abs(litersIn - litersEx) > 0.01) return false;

  const at = savedAtMs(existing);
  if (!Number.isFinite(at)) return false;
  return nowMs - at >= 0 && nowMs - at <= REPEAT_FUEL_SAVE_WINDOW_MS;
}

/** Pure: a driver re-sent a fuel save whose id is already stored, moments ago. */
export function isSameFuelSaveResent(stored: Rec, nowMs: number): boolean {
  if (!isFuelCategory(stored) || str(stored.type) !== "Expense") return false;
  const at = savedAtMs(stored);
  if (!Number.isFinite(at)) return false;
  return nowMs - at >= 0 && nowMs - at <= REPEAT_FUEL_SAVE_WINDOW_MS;
}

/** Look up an earlier save of the same fill. Returns null when none (or on lookup error). */
export async function findRepeatFuelSave(
  incoming: Rec,
  orgId: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<Rec | null> {
  if (!isFuelCategory(incoming) || str(incoming.type) !== "Expense") return null;
  const driver = str(incoming.driverId);
  const day = ymd(incoming.date);
  if (!driver || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  try {
    let q = fromKvStore()
      .select("value")
      .like("key", "transaction:%")
      .eq("value->>driverId", driver)
      .gte("value->>date", day)
      .lte("value->>date", `${day}￿`)
      .limit(200);
    if (orgId) q = q.eq("value->>organizationId", orgId);
    const { data } = await q;
    const rows = (data || [])
      .map((d: { value?: unknown }) => d?.value)
      .filter((v: unknown): v is Rec => !!v && typeof v === "object");
    const hits = rows
      .filter((r) => isRepeatFuelSave(incoming, r, nowMs))
      .sort((a, b) => savedAtMs(a) - savedAtMs(b));
    return hits[0] ?? null;
  } catch (e) {
    console.warn("[fuel-repeat-save] lookup failed (save continues):", (e as Error)?.message);
    return null;
  }
}
