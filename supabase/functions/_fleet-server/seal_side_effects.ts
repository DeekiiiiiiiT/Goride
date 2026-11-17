/**
 * Post-seal work shared by toll finish and fuel finalize (and heal scripts).
 * Rebuild open driver_financial_periods, refresh recon.week_blockers, refresh desk.
 */
import { getServiceClient } from "./service_client.ts";
import { isPeriodFrozen } from "./settlement_period_freeze.ts";
import { writeDriverWeekBlockers, type ReconServiceLine } from "./recon_week_blockers.ts";

export type SealSideEffectsResult = {
  periodsRebuilt: number;
  rebuildErrors: string[];
  blockersRefreshed: number;
};

/** @deprecated Use SealSideEffectsResult */
export type TollSealSideEffectsResult = SealSideEffectsResult;

export async function runSealSideEffects(opts: {
  organizationId: string;
  weekKey: string;
  actorId?: string | null;
  serviceLine?: ReconServiceLine;
  /** WRA-67: queue driver_week units (e.g. wra67_fuel_finalize, wra67_toll_seal). */
  driverWeekEnqueueReason?: string | null;
}): Promise<SealSideEffectsResult> {
  const orgId = opts.organizationId;
  const weekKey = opts.weekKey;
  const line: ReconServiceLine = opts.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
  const rebuildErrors: string[] = [];
  let periodsRebuilt = 0;
  let blockersRefreshed = 0;

  const sbClient = getServiceClient();
  const { data: periods } = await sbClient
    .from("driver_financial_periods")
    .select("driver_id, settlement_status, metadata")
    .eq("period_anchor", weekKey)
    .eq("organization_id", orgId);

  const openDriverIds = [
    ...new Set(
      (periods || [])
        .filter((p) => {
          const meta = (p.metadata as Record<string, unknown> | null) || null;
          const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
          return !isPeriodFrozen({
            metadata: meta,
            settlementStatus: p.settlement_status ? String(p.settlement_status) : null,
            signedAt: fc.signedAt ? String(fc.signedAt) : null,
          });
        })
        .map((p) => String(p.driver_id || ""))
        .filter(Boolean),
    ),
  ];

  try {
    const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
    for (const driverId of openDriverIds) {
      try {
        periodsRebuilt += await rebuildPeriodsForAnchors(driverId, [weekKey]);
      } catch (re: unknown) {
        const msg = re instanceof Error ? re.message : String(re);
        rebuildErrors.push(`rebuild ${driverId}: ${msg}`);
      }
    }
  } catch (rebuildErr: unknown) {
    const msg = rebuildErr instanceof Error ? rebuildErr.message : String(rebuildErr);
    rebuildErrors.push(`rebuild: ${msg}`);
  }

  const allDriverIds = [
    ...new Set(
      (periods || [])
        .map((p) => String(p.driver_id || ""))
        .filter(Boolean),
    ),
  ];

  for (const driverId of allDriverIds) {
    try {
      await writeDriverWeekBlockers(orgId, weekKey, driverId, line);
      blockersRefreshed += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      rebuildErrors.push(`blockers ${driverId}: ${msg}`);
    }
  }

  const enqueueReason = String(opts.driverWeekEnqueueReason ?? "").trim();
  if (enqueueReason) {
    try {
      const { enqueueDriverWeekUnitsForWeek } = await import("./recon_enqueue_driver_weeks.ts");
      const queued = await enqueueDriverWeekUnitsForWeek(orgId, weekKey, enqueueReason);
      for (const err of queued.errors) {
        rebuildErrors.push(`enqueue ${err}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[seal-side-effects] driver_week enqueue failed", weekKey, msg);
      rebuildErrors.push(`enqueue: ${msg}`);
    }
  }

  try {
    const { publishWeekDesk } = await import("./recon_routes.ts");
    await publishWeekDesk(orgId, line, weekKey, opts.actorId ?? undefined);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[seal-side-effects] desk refresh failed", weekKey, msg);
  }

  return { periodsRebuilt, rebuildErrors, blockersRefreshed };
}

/** @deprecated Use runSealSideEffects */
export const runTollSealSideEffects = runSealSideEffects;
