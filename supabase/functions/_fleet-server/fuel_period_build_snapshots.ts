/**
 * Server-side FinalizedFuelReport snapshot builder for auto-close (Program 4).
 * Builds settleable snapshots from org-scoped pending fuel entries when none exist.
 *
 * Shares: prefer entry metadata driverShareRatio; else blended from scenario-less 50% default
 * matching settle path needs (settledEntries amounts drive wallet posts).
 */
import * as kv from "./kv_store.tsx";
import { filterByOrg } from "./org_scope.ts";
import { blendedDriverShareRatio } from "./fuel_blended_ratio.ts";

const EPS = 0.009;

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

function inWeek(dateYmd: string, weekStart: string, weekEnd: string): boolean {
  return Boolean(dateYmd) && dateYmd >= weekStart && dateYmd <= weekEnd;
}

export type BuiltSnapshot = Record<string, unknown>;

export type BuildSnapshotsResult = {
  ok: boolean;
  snapshots: BuiltSnapshot[];
  totalSpend: number;
  error?: string;
};

function entryAmount(e: Record<string, unknown>): number {
  return Number(e.amount) || Number(e.cost) || 0;
}

function resolveDriverId(e: Record<string, unknown>): string {
  return String(e.driverId || e.driver_id || e.currentDriverId || "").trim();
}

/** Org-scoped week entries eligible for settlement. */
export async function loadWeekFuelEntries(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<Record<string, unknown>[]> {
  const raw = ((await kv.getByPrefix("fuel_entry:")) || []) as Record<string, unknown>[];
  const scoped = filterByOrg(raw, orgId);
  return scoped.filter((e) => {
    const d = ymd(e.date);
    if (!inWeek(d, weekStart, weekEnd)) return false;
    const status = String(e.reconciliationStatus || e.reconciliation_status || "Pending");
    return status === "Pending" || status === "Verified" || Boolean((e.metadata as any)?.finalizedByReport);
  });
}

/**
 * Build one FinalizedFuelReport-shaped snapshot per driver with pending fills.
 * This is the Deno settle input shape expected by persistFinalizedSnapshot.
 */
export function assembleSnapshotsFromEntries(
  entries: Record<string, unknown>[],
  weekStart: string,
  weekEnd: string,
  orgId: string,
): BuiltSnapshot[] {
  const byDriver = new Map<string, Record<string, unknown>[]>();
  for (const e of entries) {
    const driverId = resolveDriverId(e) || `vehicle:${String(e.vehicleId || e.vehicle_id || "unknown")}`;
    const list = byDriver.get(driverId) || [];
    list.push(e);
    byDriver.set(driverId, list);
  }

  const snapshots: BuiltSnapshot[] = [];
  for (const [driverId, weekEntries] of byDriver) {
    const pending = weekEntries.filter((e) => {
      const status = String(e.reconciliationStatus || e.reconciliation_status || "Pending");
      return status === "Pending" || status === "Verified";
    });
    const settlePool = pending.length ? pending : weekEntries;
    if (!settlePool.length) continue;

    const totalGasCardCost = settlePool.reduce((s, e) => s + entryAmount(e), 0);
    if (totalGasCardCost <= EPS) continue;

    // Prefer per-entry ratio metadata; else default half share (safe settle denominator).
    let weightedDriver = 0;
    for (const e of settlePool) {
      const amt = entryAmount(e);
      const meta = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<
        string,
        unknown
      >;
      const ratioRaw = Number(meta.driverShareRatio ?? meta.driver_share_ratio);
      const ratio = Number.isFinite(ratioRaw) && ratioRaw >= 0 && ratioRaw <= 1 ? ratioRaw : 0.5;
      weightedDriver += amt * ratio;
    }
    const driverShare = weightedDriver;
    const companyShare = Math.max(0, totalGasCardCost - driverShare);
    const vehicleId = String(settlePool[0].vehicleId || settlePool[0].vehicle_id || "");
    const vehicleIds = [
      ...new Set(
        settlePool.map((e) => String(e.vehicleId || e.vehicle_id || "")).filter(Boolean),
      ),
    ];

    const postedDriverShare = settlePool.reduce((sum, e) => {
      const amt = entryAmount(e);
      const meta = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<
        string,
        unknown
      >;
      const ratioRaw = Number(meta.driverShareRatio ?? meta.driver_share_ratio);
      const ratio = Number.isFinite(ratioRaw) && ratioRaw >= 0 && ratioRaw <= 1 ? ratioRaw : 0.5;
      return sum + amt * ratio;
    }, 0);

    snapshots.push({
      weekStart,
      weekEnd,
      driverId,
      vehicleId: vehicleId || vehicleIds[0] || "",
      vehicleIds,
      totalGasCardCost,
      gasCardSpend: totalGasCardCost,
      driverSpend: 0,
      companyShare,
      driverShare,
      miscellaneousCost: 0,
      pendingCount: settlePool.length,
      status: "Finalized",
      finalizedAt: new Date().toISOString(),
      postedDriverShare,
      postedCompanyShare: Math.max(0, totalGasCardCost - postedDriverShare),
      netPay: 0 - driverShare,
      fuelCycles: [],
      orgId,
      org_id: orgId,
      metadata: {
        builtBy: "fuel_period_build_snapshots",
        settledEntries: settlePool.map((e) => ({
          id: String(e.id),
          amount: entryAmount(e),
          date: ymd(e.date),
          driverId: resolveDriverId(e) || driverId,
          vehicleId: String(e.vehicleId || e.vehicle_id || vehicleId),
        })),
        blendedRatio: blendedDriverShareRatio(driverShare, totalGasCardCost),
      },
    });
  }
  return snapshots;
}

/** Full build for a period week — used by route + auto-close (Program 5 full engine). */
export async function buildFuelPeriodSnapshots(input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
}): Promise<BuildSnapshotsResult> {
  const { buildFuelPeriodSnapshotsFull } = await import("./fuel_week_engine.ts");
  return buildFuelPeriodSnapshotsFull(input);
}
