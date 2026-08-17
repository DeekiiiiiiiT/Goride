/**
 * Block duplicate admin/driver gas-card anchors when the fill is already linked to a statement.
 */
import { queryFleet } from "./repos/baseRepo.ts";

function entryMeta(e: Record<string, unknown>): Record<string, unknown> {
  const m = e.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function sameVehicle(a?: unknown, b?: unknown): boolean {
  const va = String(a || "").trim();
  const vb = String(b || "").trim();
  return va.length > 0 && va === vb;
}

function sameOdometer(a?: unknown, b?: unknown): boolean {
  const oa = Number(a);
  const ob = Number(b);
  return Number.isFinite(oa) && oa > 0 && oa === ob;
}

/** Returns conflict id when a new Gas Card anchor would duplicate an existing linked fill. */
export async function findConflictingGasCardAnchor(
  entry: Record<string, unknown>,
): Promise<{ id: string; reason: string } | null> {
  const pay = entry.paymentSource ?? entryMeta(entry).paymentSource;
  if (pay !== "Gas_Card" && pay !== "company_card") return null;

  const vehicleId = entry.vehicleId;
  const odo = Number(entry.odometer);
  if (!vehicleId || !Number.isFinite(odo) || odo <= 0) return null;

  const res = await queryFleet("fuel_entries", {
    eq: { payment_source: "Gas_Card" },
    filters: [{ op: "eq", col: "vehicle_id", value: vehicleId }],
    limit: 500,
    order: { col: "date", ascending: false },
  });
  if (res.error) throw res.error;

  for (const row of res.data as Record<string, unknown>[]) {
    if (String(row.id) === String(entry.id)) continue;
    if (!sameOdometer(row.odometer, odo)) continue;

    const meta = entryMeta(row);
    if (meta.jaaMatchedStatementId) {
      return {
        id: String(row.id),
        reason: "A gas-card fill with this odometer is already linked to a card statement.",
      };
    }
    if (String(meta.importSource || "") === "jaa_raw" && meta.jaaMatchedDriverEntryId) {
      return {
        id: String(row.id),
        reason: "Card statement for this fill is already linked to an odometer anchor.",
      };
    }
  }

  return null;
}
