/**
 * Server-side FinalizedFuelReport snapshot builder for auto-close.
 * Emergency / entries-mode path: shared fuel-core assembler with explicit 50% default rule
 * (stamped entry ratios still win via resolveEntryDriverRatio).
 */
import * as kv from "./kv_store.tsx";
import { filterByOrg } from "./org_scope.ts";
import { assembleWeekSnapshotsFromRawEntries } from "../_shared/fuelCore.ts";

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

function entryDriverShareRatio(e: Record<string, unknown>): number | null {
  const meta = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<
    string,
    unknown
  >;
  const stamped = Number(meta.driverShareRatio ?? meta.driver_share_ratio);
  if (Number.isFinite(stamped) && stamped >= 0 && stamped <= 1) return stamped;
  return null;
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
 * Money math via @roam/fuel-core (50% company default when no stamped ratio / rule).
 */
export function assembleSnapshotsFromEntries(
  entries: Record<string, unknown>[],
  weekStart: string,
  weekEnd: string,
  orgId: string,
): BuiltSnapshot[] {
  const snaps = assembleWeekSnapshotsFromRawEntries({
    weekStart,
    weekEnd,
    orgId,
    entries: entries.map((e) => ({
      id: String(e.id),
      amount: entryAmount(e),
      date: ymd(e.date),
      driverId: resolveDriverId(e),
      vehicleId: String(e.vehicleId || e.vehicle_id || ""),
      reconciliationStatus: String(e.reconciliationStatus || e.reconciliation_status || "Pending"),
      driverShareRatio: entryDriverShareRatio(e),
    })),
    builtBy: "fuel_period_build_snapshots",
  });
  return snaps as BuiltSnapshot[];
}

/** Full build for a period week — used by route + auto-close. */
export async function buildFuelPeriodSnapshots(input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
}): Promise<BuildSnapshotsResult> {
  const { buildFuelPeriodSnapshotsFull } = await import("./fuel_week_engine.ts");
  return buildFuelPeriodSnapshotsFull(input);
}
