/**
 * Soft-dedup for fuel_entries.
 * 1) Re-submits of the same fill (same vehicle + odometer + same day within a short window)
 * 2) Gas-card *statement* CSV rows should never create odometer anchors (they have no real odo)
 *
 * IMPORTANT: Real Gas Card fills (driver portal / Known fill / admin-manual) are NOT CSV rows.
 * Treating paymentSource === Gas_Card as "CSV" caused Known fills to silently collapse onto a
 * nearby RideShare Cash fill at the same odometer (same pump stop, two payment methods).
 */
import { queryFleet } from "./repos/baseRepo.ts";

const SOFT_DUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — matches "same fill, multiple times"

function entryMeta(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function entryClockMs(entry: Record<string, unknown>): number {
  const dateRaw = String(entry.date || entry.recordedAt || "").trim();
  if (!dateRaw) return 0;
  const timeRaw = String(entry.time || "").trim();
  try {
    if (dateRaw.includes("T") || /T\d{1,2}:\d{2}/.test(dateRaw)) {
      const d = new Date(dateRaw.replace(" ", "T"));
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      const [y, m, day] = dateRaw.split("-").map(Number);
      const hh = timeRaw.match(/^(\d{1,2}):(\d{2})/);
      const hour = hh ? Number(hh[1]) : 0;
      const minute = hh ? Number(hh[2]) : 0;
      return new Date(y, m - 1, day, hour, minute, 0).getTime();
    }
  } catch {
    /* fall through */
  }
  return 0;
}

function sameOdometer(a?: unknown, b?: unknown): boolean {
  const oa = Number(a);
  const ob = Number(b);
  return Number.isFinite(oa) && Number.isFinite(ob) && oa === ob && oa > 0;
}

function ymd(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  const s = String(isoOrDate).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

/** Issuer statement / CSV import only — never real odometer anchors. */
export function isGasCardCsvFuelEntry(entry: Record<string, unknown>): boolean {
  const meta = entryMeta(entry);
  const importSrc = String(meta.importSource || "");
  if (
    importSrc === "jaa_raw" ||
    importSrc === "fuel_statement" ||
    importSrc === "jaa_statement_details"
  ) {
    return true;
  }
  const entrySource = String(
    meta.entrySource || entry.entrySource || (entry as { source?: unknown }).source || "",
  ).toLowerCase();
  // Statement ledger rows stamped as fuel-card (not admin-manual / driver-portal)
  if (entrySource === "fuel-card" && (meta.jaaReceiptNumber || meta.jaaImportId || meta.jaaRowKind)) {
    return true;
  }
  return false;
}

/** Normalize payment labels so Gas_Card / company_card / gas card compare equal. */
export function normalizeFuelPaymentKey(raw: unknown): string {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!s) return "";
  if (s === "gas_card" || s === "company_card" || s === "card" || s === "gascard") return "gas_card";
  if (s === "rideshare_cash" || s === "rideshare" || s === "ride_share_cash") return "rideshare_cash";
  if (s === "personal" || s === "driver_cash" || s === "cash") return "personal";
  if (s === "petty_cash" || s === "other") return "petty_cash";
  return s;
}

function paymentKeyOf(entry: Record<string, unknown>): string {
  const meta = entryMeta(entry);
  return normalizeFuelPaymentKey(
    entry.paymentSource ||
      (entry as { payment_source?: unknown }).payment_source ||
      meta.paymentSource,
  );
}

/** Admin-manual backfills often lack a reliable clock — match on day + odo only. */
export function isAdminManualFuelEntry(entry: Record<string, unknown>): boolean {
  const meta = entryMeta(entry);
  const src = String(
    meta.entrySource || entry.entrySource || (entry as { source?: unknown }).source || "",
  ).toLowerCase();
  return src === "admin-manual";
}

/**
 * Pure pair check (no DB) — used by findSoftDuplicateFuelEntry + unit tests.
 * Returns true when candidate should reuse `row` instead of inserting.
 *
 * Clock window: 15 minutes for driver-portal / default.
 * Admin-manual: same calendar day + odometer + payment family (ignore clock / missing time).
 */
export function isSoftDuplicatePair(
  candidate: Record<string, unknown>,
  row: Record<string, unknown>,
  windowMs: number = SOFT_DUP_WINDOW_MS,
): boolean {
  if (!sameOdometer(candidate.odometer, row.odometer)) return false;
  if (ymd(String(candidate.date || "")) !== ymd(String(row.date || ""))) return false;

  // Dual payment at the same pump (cash + card) must stay as two ledger rows.
  const candPay = paymentKeyOf(candidate);
  const rowPay = paymentKeyOf(row);
  if (candPay && rowPay && candPay !== rowPay) return false;

  const adminDayMatch =
    isAdminManualFuelEntry(candidate) || isAdminManualFuelEntry(row);

  if (!adminDayMatch) {
    const candClock = entryClockMs(candidate);
    const rowClock = entryClockMs(row);
    if (!candClock || !rowClock || Math.abs(rowClock - candClock) > windowMs) return false;
  }

  const candidateIsCsv = isGasCardCsvFuelEntry(candidate);
  const rowIsCsv = isGasCardCsvFuelEntry(row);

  // CSV statement re-submit against a real fill → reuse the real fill
  if (candidateIsCsv && !rowIsCsv) return true;
  // Real fill against CSV noise → do not treat CSV as the keeper (caller continues)
  if (!candidateIsCsv && rowIsCsv) return false;

  // Same soft window + odo + vehicle + day (+ same payment family)
  return true;
}

/**
 * Find an existing fuel_entry that is a soft-duplicate of the candidate.
 * Matching: same vehicle + odometer + calendar day + within soft window.
 * Prefer keeping a non-CSV row when payment sources differ only by source.
 */
export async function findSoftDuplicateFuelEntry(
  entry: Record<string, unknown>,
  excludeId?: string | null,
): Promise<Record<string, unknown> | null> {
  const vehicleId = String(entry.vehicleId || "").trim();
  const odo = Number(entry.odometer);
  if (!vehicleId || !Number.isFinite(odo) || odo <= 0) return null;

  const day = ymd(entry.date as string);
  if (!day) return null;

  // Driver / default path needs a clock; admin-manual may backfill with empty time.
  if (!isAdminManualFuelEntry(entry)) {
    const clock = entryClockMs(entry);
    if (!clock) return null;
  }

  // Scope to same calendar day — avoids scanning the full vehicle history
  const res = await queryFleet("fuel_entries", {
    dateFrom: day,
    dateTo: day,
    filters: [
      { op: "eq", col: "vehicle_id", value: vehicleId },
    ],
    limit: 100,
    order: { col: "date", ascending: false },
  });
  if (res.error) throw res.error;

  for (const row of res.data as Record<string, unknown>[]) {
    if (String(row.id) === String(excludeId || entry.id)) continue;
    if (isSoftDuplicatePair(entry, row)) return row;
  }
  return null;
}
