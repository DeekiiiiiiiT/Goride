/**
 * §1.3 — backfill missing toll_charge (+ personal offset) for Sep 11/12 personal
 * tolls so Business Finance P&L Tolls shows the pair. toll_charged_to_driver may
 * already exist; emitters are idempotent.
 */
import { getServiceClient } from "./service_client.ts";
import { appendCanonicalTollIfEligible } from "./canonical_from_ops.ts";
import { emitDriverTollCharge } from "./driver_toll_charge.ts";
import { emitTollChargeOffset } from "./toll_pnl_offset.ts";

export const SEP11_PERSONAL_TOLL_IDS = [
  "090bd599-309f-4949-aab5-f83dc214aedf", // 2026-09-11
  "ea0380fb-bc98-47fd-b597-e1d1ca0a0027", // 2026-09-12
] as const;

export type HealPersonalTollPnlResult = {
  tollId: string;
  tollCharge: "written" | "skipped" | "error";
  chargedToDriver: "written" | "skipped" | "error";
  personalOffset: "written" | "skipped" | "error" | "skipped_no_charge";
  error?: string;
};

type TollRow = {
  id: string;
  date: string;
  amount: number | string;
  type: string;
  driver_id: string | null;
  vehicle_id: string | null;
  trip_id: string | null;
  plaza: string | null;
  resolution: string | null;
  status: string | null;
};

export async function healPersonalTollPnlEvents(opts?: {
  tollIds?: readonly string[];
  stubCtx?: unknown;
}): Promise<{ results: HealPersonalTollPnlResult[] }> {
  const tollIds = opts?.tollIds?.length ? opts.tollIds : SEP11_PERSONAL_TOLL_IDS;
  const c = opts?.stubCtx ?? ({ get: () => undefined } as never);
  const sb = getServiceClient();
  const results: HealPersonalTollPnlResult[] = [];

  for (const tollId of tollIds) {
    const row: HealPersonalTollPnlResult = {
      tollId,
      tollCharge: "skipped",
      chargedToDriver: "skipped",
      personalOffset: "skipped",
    };
    try {
      const { data, error } = await sb
        .from("fleet_toll_ledger")
        .select("id, date, amount, type, driver_id, vehicle_id, trip_id, plaza, resolution, status")
        .eq("id", tollId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("toll not found");
      const toll = data as TollRow;
      const amountAbs = Math.abs(Number(toll.amount) || 0);
      const driverId = String(toll.driver_id || "");
      if (!driverId) throw new Error("toll missing driver_id");

      const ledgerLike = {
        id: toll.id,
        date: String(toll.date).slice(0, 10),
        amount: Number(toll.amount) || 0,
        type: toll.type,
        driverId,
        vehicleId: toll.vehicle_id || undefined,
        tripId: toll.trip_id || undefined,
        description: toll.plaza
          ? `Toll crossing: ${toll.plaza}`
          : "Toll charge (personal backfill)",
      };

      try {
        await appendCanonicalTollIfEligible(ledgerLike, c as never);
        row.tollCharge = "written";
      } catch (e: unknown) {
        row.tollCharge = "error";
        row.error = e instanceof Error ? e.message : String(e);
      }

      try {
        const charge = await emitDriverTollCharge(
          {
            tollId,
            claimId: `heal-personal-pnl:${tollId}`,
            driverId,
            vehicleId: toll.vehicle_id || undefined,
            tripId: toll.trip_id,
            amount: amountAbs,
            date: String(toll.date).slice(0, 10),
            description: ledgerLike.description,
            source: "heal_personal_toll_pnl",
          },
          c,
        );
        row.chargedToDriver = charge.alreadyProjected ? "skipped" : "written";
      } catch (e: unknown) {
        row.chargedToDriver = "error";
        row.error = [row.error, e instanceof Error ? e.message : String(e)].filter(Boolean).join("; ");
      }

      try {
        const offset = await emitTollChargeOffset(
          {
            sourceType: "toll_ledger",
            sourceId: tollId,
            driverId,
            vehicleId: toll.vehicle_id,
            date: String(toll.date).slice(0, 10),
            amount: amountAbs,
            reason: "personal",
          },
          c,
        );
        if (offset.skippedNoOriginalCharge) row.personalOffset = "skipped_no_charge";
        else row.personalOffset = offset.written ? "written" : "skipped";
      } catch (e: unknown) {
        row.personalOffset = "error";
        row.error = [row.error, e instanceof Error ? e.message : String(e)].filter(Boolean).join("; ");
      }
    } catch (e: unknown) {
      row.tollCharge = "error";
      row.chargedToDriver = "error";
      row.personalOffset = "error";
      row.error = e instanceof Error ? e.message : String(e);
    }
    results.push(row);
  }

  return { results };
}
