/**
 * Full week snapshot engine for Deno build-snapshots (Program 5 / Flawless Wave 1).
 * Loads org week context → scenario pick → shared @roam/fuel-core assembler → optional cycle close.
 * Falls back to entry-only assembler when FUEL_BUILD_SNAPSHOTS_ENGINE=entries.
 * Coverage / ratio math lives only in packages/fuel-core (via _shared/fuelCore twin).
 */
import * as kv from "./kv_store.tsx";
import { filterRecordsByOrganizationId } from "./org_scope.ts";
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

// N-9: do not statically import fuel_cycle_stamp (pulls fuel_logic KV builder debt into CI deno check).
async function closeOpenCyclesForWeekSafe(vehicleId: string, weekEnd: string): Promise<void> {
  const { closeOpenCyclesForWeek } = await import("./fuel_cycle_stamp.ts");
  await closeOpenCyclesForWeek(vehicleId, weekEnd);
}

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
  return filterRecordsByOrganizationId(raw, orgId);
}

async function loadOrgDrivers(orgId: string): Promise<Record<string, unknown>[]> {
  const raw = ((await kv.getByPrefix("driver:")) || []) as Record<string, unknown>[];
  return filterRecordsByOrganizationId(raw, orgId);
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
 * H-11: callers that need closed/publishable money must supply categoryCosts via
 * a full Engine A path; this entry path is draft-only without them.
 */
function snapshotHasCategoryCosts(snap: BuiltSnapshot): boolean {
  const top = snap.categoryCosts;
  const meta = (snap.metadata && typeof snap.metadata === "object"
    ? snap.metadata
    : {}) as Record<string, unknown>;
  const nested = meta.categoryCosts;
  const cats = (top && typeof top === "object" ? top : nested) as Record<string, unknown> | null;
  if (!cats || typeof cats !== "object") return false;
  return (
    "rideShareCost" in cats ||
    "companyUsageCost" in cats ||
    "deadheadCost" in cats ||
    "personalUsageCost" in cats
  );
}

export function assembleSnapshotsWithScenarios(input: {
  entries: Record<string, unknown>[];
  weekStart: string;
  weekEnd: string;
  orgId: string;
  scenarios: Record<string, unknown>[];
  drivers: Record<string, unknown>[];
  vehicles?: Record<string, unknown>[];
  brainByDriver?: Map<string, Record<string, unknown>>;
  /** When true (default), refuse snapshots without categoryCosts (publish path). */
  requireCategoryCosts?: boolean;
}): BuiltSnapshot[] {
  const {
    entries,
    weekStart,
    weekEnd,
    orgId,
    scenarios,
    drivers,
    brainByDriver,
    requireCategoryCosts = true,
  } = input;
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

  const snaps = withScenarioMetadata(
    assembleWeekSnapshotsFromRawEntries({
      weekStart,
      weekEnd,
      orgId,
      entries: toRawEntries(entries),
      fuelRuleByDriver,
      brainByDriver,
      builtBy: "fuel_week_engine",
    }),
    scenarioByDriver,
  );
  if (!requireCategoryCosts) return snaps;
  if (entries.length === 0) return snaps;
  const allHaveCosts = snaps.length > 0 && snaps.every((s) => snapshotHasCategoryCosts(s));
  if (!allHaveCosts) return [];
  return snaps;
}

/** P-6: do not invent all-zero brain metadata on closed snapshots. */
async function attachBrainHints(_input: {
  orgId: string;
  weekStart: string;
  weekEnd: string;
  driverIds: string[];
}): Promise<Map<string, Record<string, unknown>>> {
  return new Map();
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
      // H-11: entry-only path records misc=0 — refuse for auto-close publish.
      return {
        ok: false,
        snapshots: [],
        totalSpend: 0,
        error: "missing_category_costs",
      };
    }

    // P-5: do not scan vehicles — assembler never reads them.
    const [scenarios, drivers] = await Promise.all([
      loadOrgScenarios(input.orgId),
      loadOrgDrivers(input.orgId),
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
      brainByDriver,
      requireCategoryCosts: true,
    });

    if (snapshots.length === 0 && entries.length > 0) {
      return {
        ok: false,
        snapshots: [],
        totalSpend: 0,
        error: "missing_category_costs",
      };
    }

    const vehicleIds = [
      ...new Set(
        snapshots.flatMap((s) => (Array.isArray(s.vehicleIds) ? s.vehicleIds : [s.vehicleId])),
      ),
    ].filter(Boolean) as string[];
    for (const vid of vehicleIds) {
      try {
        await closeOpenCyclesForWeekSafe(String(vid), weekEnd);
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
      if (entries.length > 0) {
        return {
          ok: false,
          snapshots: [],
          totalSpend: 0,
          error: "missing_category_costs",
        };
      }
      const snapshots = assembleSnapshotsFromEntries(entries, weekStart, weekEnd, input.orgId);
      const totalSpend = snapshots.reduce((s, snap) => s + (Number(snap.totalGasCardCost) || 0), 0);
      return { ok: true, snapshots, totalSpend };
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
