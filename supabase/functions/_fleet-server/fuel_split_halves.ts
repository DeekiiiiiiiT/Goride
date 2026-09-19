/**
 * Detect unlinked Gas Card + Cash halves at the same pump stop.
 * Soft-dedup allows different payment families; without fillGroupId that
 * double-counts liters when the card statement matches. Refuse those writes.
 */
import { queryFleet } from "./repos/baseRepo.ts";
import { isGasCardCsvFuelEntry, normalizeFuelPaymentKey } from "./fuel_soft_dedup.ts";

function entryMeta(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function ymd(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  const s = String(isoOrDate).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

function sameOdometer(a?: unknown, b?: unknown): boolean {
  const oa = Number(a);
  const ob = Number(b);
  return Number.isFinite(oa) && Number.isFinite(ob) && oa === ob && oa > 0;
}

function fillGroupIdOf(entry: Record<string, unknown>): string {
  const meta = entryMeta(entry);
  const raw = meta.fillGroupId ?? entry.fillGroupId;
  return typeof raw === "string" ? raw.trim() : "";
}

function paymentKeyOf(entry: Record<string, unknown>): string {
  const meta = entryMeta(entry);
  return normalizeFuelPaymentKey(
    entry.paymentSource ||
      (entry as { payment_source?: unknown }).payment_source ||
      meta.paymentSource,
  );
}

/** Gas card family vs cash-like family (personal / rideshare / petty). */
export function paymentFamilyBucket(payKey: string): "gas_card" | "cash" | "other" {
  if (payKey === "gas_card") return "gas_card";
  if (payKey === "personal" || payKey === "rideshare_cash" || payKey === "petty_cash") {
    return "cash";
  }
  return "other";
}

/**
 * Pure pair check — true when candidate + row look like unlinked halves of one sale.
 */
export function isUnlinkedSplitHalfPair(
  candidate: Record<string, unknown>,
  row: Record<string, unknown>,
): boolean {
  if (isGasCardCsvFuelEntry(candidate) || isGasCardCsvFuelEntry(row)) return false;
  if (!sameOdometer(candidate.odometer, row.odometer)) return false;
  if (ymd(String(candidate.date || "")) !== ymd(String(row.date || ""))) return false;

  const candGroup = fillGroupIdOf(candidate);
  const rowGroup = fillGroupIdOf(row);
  // Proper split siblings share a fillGroupId — not a conflict.
  if (candGroup && rowGroup && candGroup === rowGroup) return false;
  // Either side already in a split group is not the "manual two-row" pattern.
  if (candGroup || rowGroup) return false;

  const candBucket = paymentFamilyBucket(paymentKeyOf(candidate));
  const rowBucket = paymentFamilyBucket(paymentKeyOf(row));
  if (candBucket === "other" || rowBucket === "other") return false;
  return candBucket !== rowBucket;
}

export type UnlinkedSplitHalfConflict = {
  id: string;
  reason: string;
  code: "UNLINKED_SPLIT_HALVES";
};

/**
 * Find an existing fuel_entry that would form an unlinked Gas Card + Cash pair
 * with the candidate (same vehicle + odometer + calendar day, no fillGroupId).
 */
export async function findUnlinkedSplitHalfConflict(
  entry: Record<string, unknown>,
  excludeId?: string | null,
): Promise<UnlinkedSplitHalfConflict | null> {
  const vehicleId = String(entry.vehicleId || "").trim();
  const odo = Number(entry.odometer);
  if (!vehicleId || !Number.isFinite(odo) || odo <= 0) return null;

  const day = ymd(entry.date as string);
  if (!day) return null;

  const candBucket = paymentFamilyBucket(paymentKeyOf(entry));
  if (candBucket === "other") return null;

  const res = await queryFleet("fuel_entries", {
    dateFrom: day,
    dateTo: day,
    filters: [{ op: "eq", col: "vehicle_id", value: vehicleId }],
    limit: 100,
    order: { col: "date", ascending: false },
  });
  if (res.error) throw res.error;

  for (const row of res.data as Record<string, unknown>[]) {
    if (String(row.id) === String(excludeId || entry.id)) continue;
    if (isUnlinkedSplitHalfPair(entry, row)) {
      return {
        id: String(row.id),
        code: "UNLINKED_SPLIT_HALVES",
        reason:
          "A Gas Card fill and a cash fill at the same vehicle, odometer, and date must be recorded as Gas Card + Cash (one split), not two separate rows. Use Add fuel → Gas Card + Cash, or delete the other half first.",
      };
    }
  }
  return null;
}
