/**
 * Soft-dedup for fuel_entries.
 * 1) Re-submits of the same fill (same vehicle + odometer + same day within a short window)
 * 2) Gas-card statement rows should never create odometer anchors (they have no real odo)
 */
import { queryFleet } from "./repos/baseRepo.ts";

const SOFT_DUP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — matches "same fill, multiple times"

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

function isGasCardCsv(entry: Record<string, unknown>): boolean {
  const meta = (entry.metadata && typeof entry.metadata === "object"
    ? entry.metadata as Record<string, unknown>
    : {}) as Record<string, unknown>;
  const importSrc = String(meta.importSource || entry.metadata?.importSource || "");
  const entrySource = String(
    meta.entrySource || entry.entrySource || (entry as any).source || "",
  ).toLowerCase();
  return (
    importSrc === "jaa_raw" ||
    importSrc === "fuel_statement" ||
    importSrc === "jaa_statement_details" ||
    entrySource.includes("fuel-card") ||
    String(entry.paymentSource || meta.paymentSource || "").toLowerCase() === "gas_card"
  );
}

/**
 * Prefer keeping a real odometer fuel fill over a gas-card CSV row that only
 * carries a station/vendor name (issuer mileage is never a Roam odometer).
 */
export function isGasCardCsvFuelEntry(entry: Record<string, unknown>): boolean {
  return isGasCardCsv(entry);
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

  const day = ymd(entry.date);
  if (!day) return null;

  const clock = entryClockMs(entry);
  if (!clock) return null;

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

  const candidateIsCsv = isGasCardCsv(entry);
  for (const row of res.data as Record<string, unknown>[]) {
    if (String(row.id) === String(excludeId || entry.id)) continue;
    if (!sameOdometer(row.odometer, odo)) continue;
    if (ymd(row.date) !== day) continue;
    const rowClock = entryClockMs(row);
    if (!rowClock || Math.abs(rowClock - clock) > SOFT_DUP_WINDOW_MS) continue;

    // Prefer a non-CSV row when both are gas card CSV re-submits — keep first real fill
    const rowIsCsv = isGasCardCsv(row);
    if (candidateIsCsv && !rowIsCsv) {
      // Candidate is pure CSV; keep the real fill (row)
      return row;
    }
    if (!candidateIsCsv && rowIsCsv) {
      // Prefer the real fill over CSV noise
      continue;
    }

    // Prefer payment-source match so dual payment methods (cash vs card) stay separate
    const candPay = String(
      entry.paymentSource
      || (entry.metadata as any)?.paymentSource
      || "",
    ).toLowerCase();
    const rowPay = String(
      row.paymentSource
      || (row.metadata as any)?.paymentSource
      || "",
    ).toLowerCase();
    if (candPay && rowPay && candPay !== rowPay) continue;

    // Same soft window + odo + vehicle + day is a soft-dup
    return row;
  }
  return null;
}
