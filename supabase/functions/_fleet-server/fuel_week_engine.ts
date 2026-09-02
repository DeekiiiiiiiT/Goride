/**
 * Full week snapshot engine for Deno build-snapshots (Program 5 / Flawless Wave 1).
 * Loads org week context → scenario pick → shared @roam/fuel-core assembler → optional cycle close.
 * Falls back to entry-only assembler when FUEL_BUILD_SNAPSHOTS_ENGINE=entries.
 * Coverage / ratio math lives only in packages/fuel-core (via _shared/fuelCore twin).
 */
import * as kv from "./kv_store.tsx";
import { filterByOrg } from "./org_scope.ts";
import { classifyFuelWeek } from "../fuel-brain/classify.ts";
import { closeOpenCyclesForWeek } from "./fuel_cycle_stamp.ts";
import {
  assembleWeekSnapshotsFromRawEntries,
  type BuiltWeekSnapshot,
  type WeekSnapFuelRule,
} from "../_shared/fuelCore.ts";
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

function pickFuelRule(scenario: Record<string, unknown> | null): WeekSnapFuelRule | null {
  if (!scenario) return null;
  const rules = Array.isArray(scenario.rules) ? scenario.rules : [];
  const fuel = rules.find((r: any) => String(r?.category || "").toLowerCase() === "fuel");
  return (fuel as WeekSnapFuelRule) || null;
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

function entryDriverShareRatio(e: Record<string, unknown>): number | null {
  const meta = (e.metadata && typeof e.metadata === "object" ? e.metadata : {}) as Record<
    string,
    unknown
  >;
  const stamped = Number(meta.driverShareRatio ?? meta.driver_share_ratio);
  if (Number.isFinite(stamped) && stamped >= 0 && stamped <= 1) return stamped;
  return null;
}

function toRawEntries(entries: Record<string, unknown>[]) {
  return entries.map((e) => ({
    id: String(e.id),
    amount: entryAmount(e),
    date: ymd(e.date),
    driverId: resolveDriverId(e),
    vehicleId: String(e.vehicleId || e.vehicle_id || ""),
    reconciliationStatus: String(e.reconciliationStatus || e.reconciliation_status || "Pending"),
    driverShareRatio: entryDriverShareRatio(e),
  }));
}

function withScenarioMetadata(
  snaps: BuiltWeekSnapshot[],
  scenarioByDriver: Map<string, Record<string, unknown> | null>,
): BuiltSnapshot[] {
  return snaps.map((snap) => {
    const scenario = scenarioByDriver.get(snap.driverId) || null;
    return {
      ...snap,
      metadata: {
        ...snap.metadata,
        appliedScenario: scenario ? { id: scenario.id, name: scenario.name } : null,
      },
    };
  });
}

/**
 * Scenario-aware snapshot assembly — orchestration only; money math via fuel-core.
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
  const fuelRuleByDriver = new Map<string, WeekSnapFuelRule | null>();
  const scenarioByDriver = new Map<string, Record<string, unknown> | null>();

  const driverIds = new Set(
    entries.map((e) => resolveDriverId(e) || `vehicle:${String(e.vehicleId || e.vehicle_id || "unknown")}`),
  );
  for (const driverId of driverIds) {
    const driver = drivers.find((d) => String(d.id) === driverId || String(d.driverId) === driverId);
    const scenario = resolveScenarioForDriver(scenarios, driver);
    scenarioByDriver.set(driverId, scenario);
    fuelRuleByDriver.set(driverId, pickFuelRule(scenario));
  }

  const snaps = assembleWeekSnapshotsFromRawEntries({
    weekStart,
    weekEnd,
    orgId,
    entries: toRawEntries(entries),
    fuelRuleByDriver,
    brainByDriver,
    builtBy: "fuel_week_engine",
  });
  return withScenarioMetadata(snaps, scenarioByDriver);
}

async function attachBrainHints(input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
  driverIds: string[];
}): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
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

    if (snapshots.length === 0 && entries.length > 0) {
      snapshots = assembleSnapshotsFromEntries(entries, weekStart, weekEnd, input.orgId);
    }

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
