/**
 * Full week snapshot engine for Deno build-snapshots (Program 5).
 * Loads org week context → scenario-aware shares + settledEntries → optional cycle close.
 * Falls back to entry-only assembler when FUEL_BUILD_SNAPSHOTS_ENGINE=entries.
 */
import * as kv from "./kv_store.tsx";
import { filterByOrg } from "./org_scope.ts";
import { classifyFuelWeek } from "../fuel-brain/classify.ts";
import { closeOpenCyclesForWeek } from "./fuel_cycle_stamp.ts";
import {
  assembleSnapshotsFromEntries,
  loadWeekFuelEntries,
  type BuildSnapshotsResult,
  type BuiltSnapshot,
} from "./fuel_period_build_snapshots.ts";

const EPS = 0.009;

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

function engineMode(): "full" | "entries" {
  const raw = String(Deno.env.get("FUEL_BUILD_SNAPSHOTS_ENGINE") || "full").toLowerCase();
  return raw === "entries" ? "entries" : "full";
}

function entryAmount(e: Record<string, unknown>): number {
  return Number(e.amount) || Number(e.cost) || 0;
}

function resolveDriverId(e: Record<string, unknown>): string {
  return String(e.driverId || e.driver_id || e.currentDriverId || "").trim();
}

function pickFuelRule(scenario: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!scenario) return null;
  const rules = Array.isArray(scenario.rules) ? scenario.rules : [];
  const fuel = rules.find((r: any) => String(r?.category || "").toLowerCase() === "fuel");
  return (fuel as Record<string, unknown>) || null;
}

function companyCoveragePercent(rule: Record<string, unknown> | null): number {
  if (!rule) return 50;
  if (String(rule.coverageType) === "Full") return 100;
  if (String(rule.coverageType) === "Fixed_Amount") return 50;
  const pct = Number(rule.rideShareCoverage ?? rule.coverageValue ?? 50);
  if (!Number.isFinite(pct)) return 50;
  return Math.min(100, Math.max(0, pct));
}

function driverRatio(rule: Record<string, unknown> | null, entry: Record<string, unknown>): number {
  const meta = (entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}) as Record<
    string,
    unknown
  >;
  const stamped = Number(meta.driverShareRatio ?? meta.driver_share_ratio);
  if (Number.isFinite(stamped) && stamped >= 0 && stamped <= 1) return stamped;
  return 1 - companyCoveragePercent(rule) / 100;
}

async function loadOrgScenarios(orgId: string): Promise<Record<string, unknown>[]> {
  const raw = ((await kv.getByPrefix("fuel_scenario:")) || []) as Record<string, unknown>[];
  return filterByOrg(raw, orgId);
}

async function loadOrgDrivers(orgId: string): Promise<Record<string, unknown>[]> {
  const raw = ((await kv.getByPrefix("driver:")) || []) as Record<string, unknown>[];
  return filterByOrg(raw, orgId);
}

async function loadOrgVehicles(orgId: string): Promise<Record<string, unknown>[]> {
  const raw = ((await kv.getByPrefix("vehicle:")) || []) as Record<string, unknown>[];
  return filterByOrg(raw, orgId);
}

function resolveScenarioForDriver(
  scenarios: Record<string, unknown>[],
  driver: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  const sid = String(driver?.fuelScenarioId || driver?.fuel_scenario_id || "");
  if (sid) {
    const hit = scenarios.find((s) => String(s.id) === sid);
    if (hit) return hit;
  }
  return scenarios.find((s) => Boolean(s.isDefault)) || scenarios[0] || null;
}

/**
 * Scenario-aware snapshot assembly (primary path).
 */
export function assembleSnapshotsWithScenarios(input: {
  entries: Record<string, unknown>[];
  weekStart: string;
  weekEnd: string;
  orgId: string;
  scenarios: Record<string, unknown>[];
  drivers: Record<string, unknown>[];
  vehicles: Record<string, unknown>[];
  brainByDriver?: Map<string, Record<string, unknown>>;
}): BuiltSnapshot[] {
  const { entries, weekStart, weekEnd, orgId, scenarios, drivers, brainByDriver } = input;
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

    const driver = drivers.find((d) => String(d.id) === driverId || String(d.driverId) === driverId);
    const scenario = resolveScenarioForDriver(scenarios, driver);
    const rule = pickFuelRule(scenario);

    const totalGasCardCost = settlePool.reduce((s, e) => s + entryAmount(e), 0);
    if (totalGasCardCost <= EPS) continue;

    let driverShare = 0;
    for (const e of settlePool) {
      driverShare += entryAmount(e) * driverRatio(rule, e);
    }
    const companyShare = Math.max(0, totalGasCardCost - driverShare);
    const vehicleId = String(settlePool[0].vehicleId || settlePool[0].vehicle_id || "");
    const vehicleIds = [
      ...new Set(
        settlePool.map((e) => String(e.vehicleId || e.vehicle_id || "")).filter(Boolean),
      ),
    ];
    const blendedRatio = totalGasCardCost > 0 ? driverShare / totalGasCardCost : 0;

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
      postedDriverShare: driverShare,
      postedCompanyShare: companyShare,
      netPay: 0 - driverShare,
      fuelCycles: [],
      orgId,
      org_id: orgId,
      metadata: {
        builtBy: "fuel_week_engine",
        settledEntries: settlePool.map((e) => ({
          id: String(e.id),
          amount: entryAmount(e),
          date: ymd(e.date),
          driverId: resolveDriverId(e) || driverId,
          vehicleId: String(e.vehicleId || e.vehicle_id || vehicleId),
        })),
        blendedRatio,
        appliedFuelRule: rule,
        appliedScenario: scenario
          ? { id: scenario.id, name: scenario.name }
          : null,
        brain: brainByDriver?.get(driverId) || null,
      },
    });
  }
  return snapshots;
}

async function attachBrainHints(input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
  driverIds: string[];
}): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  // Lightweight: classify with odometer=0 when no trip payload — still stamps method for audit.
  for (const driverId of input.driverIds) {
    try {
      const result = classifyFuelWeek({
        totalOdometerKm: 0,
        tripRideshareKm: 0,
        companyOpsKm: 0,
      });
      map.set(driverId, { ...result, source: "fuel_week_engine" });
    } catch {
      /* non-fatal */
    }
  }
  return map;
}

/** Primary export used by routes + auto-close. */
export async function buildFuelPeriodSnapshotsFull(input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
}): Promise<BuildSnapshotsResult> {
  const weekStart = ymd(input.weekStart);
  const weekEnd = ymd(input.weekEnd);
  if (!input.orgId || !weekStart || !weekEnd) {
    return { ok: false, snapshots: [], totalSpend: 0, error: "missing_org_or_week" };
  }

  try {
    const entries = await loadWeekFuelEntries(input.orgId, weekStart, weekEnd);
    if (engineMode() === "entries") {
      const snapshots = assembleSnapshotsFromEntries(entries, weekStart, weekEnd, input.orgId);
      const totalSpend = snapshots.reduce((s, snap) => s + (Number(snap.totalGasCardCost) || 0), 0);
      return { ok: true, snapshots, totalSpend };
    }

    const [scenarios, drivers, vehicles] = await Promise.all([
      loadOrgScenarios(input.orgId),
      loadOrgDrivers(input.orgId),
      loadOrgVehicles(input.orgId),
    ]);

    const driverIds = [
      ...new Set(entries.map((e) => resolveDriverId(e)).filter(Boolean)),
    ];
    const brainByDriver = await attachBrainHints({
      orgId: input.orgId,
      weekStart,
      weekEnd,
      driverIds,
    });

    let snapshots = assembleSnapshotsWithScenarios({
      entries,
      weekStart,
      weekEnd,
      orgId: input.orgId,
      scenarios,
      drivers,
      vehicles,
      brainByDriver,
    });

    // Emergency fallback if scenario path produced nothing for money week
    if (snapshots.length === 0 && entries.length > 0) {
      snapshots = assembleSnapshotsFromEntries(entries, weekStart, weekEnd, input.orgId);
    }

    // Side effect: close open tank cycles (same intent as client finalize)
    const vehicleIds = [
      ...new Set(
        snapshots.flatMap((s) => (Array.isArray(s.vehicleIds) ? s.vehicleIds : [s.vehicleId])),
      ),
    ].filter(Boolean) as string[];
    for (const vid of vehicleIds) {
      try {
        await closeOpenCyclesForWeek(String(vid), weekEnd);
      } catch {
        /* non-fatal — settle still proceeds */
      }
    }

    const totalSpend = snapshots.reduce((s, snap) => s + (Number(snap.totalGasCardCost) || 0), 0);
    if (totalSpend > EPS && snapshots.length === 0) {
      return { ok: false, snapshots: [], totalSpend: 0, error: "no_settleable_entries" };
    }
    return { ok: true, snapshots, totalSpend };
  } catch (e: any) {
    // Hard fail → entry assembler emergency path
    try {
      const entries = await loadWeekFuelEntries(input.orgId, weekStart, weekEnd);
      const snapshots = assembleSnapshotsFromEntries(entries, weekStart, weekEnd, input.orgId);
      const totalSpend = snapshots.reduce((s, snap) => s + (Number(snap.totalGasCardCost) || 0), 0);
      return {
        ok: true,
        snapshots,
        totalSpend,
        error: e?.message ? `full_engine_fallback:${e.message}` : "full_engine_fallback",
      };
    } catch (e2: any) {
      return {
        ok: false,
        snapshots: [],
        totalSpend: 0,
        error: e2?.message || e?.message || "build_failed",
      };
    }
  }
}
