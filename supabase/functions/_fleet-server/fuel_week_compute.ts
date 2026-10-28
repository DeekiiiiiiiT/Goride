/**
 * Server week compute: shared fuel-core snapshots + saved distances.
 * The screen reviews this result. It does not recompute the week.
 */
import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";
import { loadPriorWeekCredit, prepareFuelWeekReports } from "./fuel_week_prepare.ts";
import type { PriorWeekFact } from "../../../packages/fuel-core/src/priorWeekCredit.ts";
import { loadWeekFuelEntries } from "./fuel_period_build_snapshots.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import { filterFuelScenariosForOrg } from "./fuel_scenario_scope.ts";
import { loadOrgPreferences } from "./fuel_org_preferences.ts";
import { listOdometerLedger } from "./odometer_ledger.ts";
import { orgVersion, weekSummary } from "../_shared/unifiedLedger/readApi.ts";
import { FUEL_ENGINE_VERSION, fuelShadowDrift } from "../../../packages/fuel-core/src/fuelEngine.ts";
import { addDaysYmd } from "../../../packages/fuel-core/src/fleetTime.ts";

function hashParts(parts: string[]): string {
  let h = 2166136261;
  const text = parts.sort().join("|");
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function ymd(value: unknown): string {
  return String(value || "").split("T")[0];
}

function stable(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value) ?? "";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${key}:${stable(obj[key])}`).join(",")}}`;
}

async function loadOrgRows(
  domain: Parameters<typeof queryFleet>[0],
  orgId: string,
  extra: Record<string, unknown> = {},
) {
  const page = 1000;
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const res = await queryFleet(domain, { org: orgId, limit: page, offset, ...extra });
    if (res.error) throw res.error;
    const chunk = (res.data || []) as Record<string, unknown>[];
    rows.push(...chunk);
    if (chunk.length < page) break;
    offset += chunk.length;
    if (offset > 20000) break;
  }
  return rows;
}

export type FuelWeekHashSources = {
  entries: Array<Record<string, unknown>>;
  trips: Array<Record<string, unknown>>;
  adjustments: Array<Record<string, unknown>>;
  scenarios: Array<Record<string, unknown>>;
  policies: Array<Record<string, unknown>>;
  drivers: Array<Record<string, unknown>>;
  vehicles: Array<Record<string, unknown>>;
  prefs: Record<string, unknown>;
  /** Ledger fare fingerprint: org entry_seq + week_summary fare rows (not raw fare events). */
  fareFingerprintParts: string[];
  distances: Array<Record<string, unknown>>;
  anchors: Array<Record<string, unknown>>;
  leftoverOverride?: unknown;
  /** Previous 3 weeks, oldest first. Open weeks are included so a recompute moves this hash. */
  priorWeeks?: PriorWeekFact[];
};

/** Every input prepareFuelWeekReports reads. Distance rows omit computed_at. */
export function buildFuelWeekHashParts(sources: FuelWeekHashSources): string[] {
  const entryParts = sources.entries.map((entry) => {
    const meta = entry.metadata && typeof entry.metadata === "object"
      ? entry.metadata as Record<string, unknown>
      : {};
    return `fill:${entry.id}:${entry.amount}:${entry.odometer}:${entry.liters}:${entry.type || ""}:${meta.jaaMatchedDriverEntryId || ""}:${entry.updated_at || entry.updatedAt || ""}`;
  });
  const tripParts = sources.trips.map((trip) =>
    `trip:${trip.id}:${trip.distance || trip.tripDistance || trip.km || ""}:${trip.status || ""}:${trip.updated_at || trip.updatedAt || ""}`
  );
  const adjustmentParts = sources.adjustments.map((row) =>
    `adj:${row.id}:${ymd(row.date)}:${row.type || ""}:${row.vehicleId || row.vehicle_id || ""}:${row.distance || 0}:${row.updated_at || row.updatedAt || ""}`
  );
  const scenarioParts = sources.scenarios.map((row) => `scenario:${row.id}:${stable(row)}`);
  const policyParts = sources.policies.map((row) =>
    `policy:${row.id}:${row.updated_at || row.updatedAt || ""}:${stable(row)}`
  );
  const driverParts = sources.drivers.map((row) =>
    `driver:${row.id}:${row.fuelScenarioId || row.fuel_scenario_id || ""}:${row.homeLat ?? row.home_lat ?? ""}:${row.homeLng ?? row.home_lng ?? ""}:${row.homePinSource || row.home_pin_source || ""}`
  );
  const vehicleParts = sources.vehicles.map((row) =>
    `vehicle:${row.id}:${row.currentDriverId || row.current_driver_id || ""}:${row.fuelScenarioId || row.fuel_scenario_id || ""}`
  );
  const fareParts = sources.fareFingerprintParts;
  const distanceParts = sources.distances.map((row) =>
    `distance:${row.vehicle_id}:${row.deadhead_km}:${row.trip_km}:${row.personal_km}:${row.stale}`
  );
  const anchorParts = sources.anchors.map((row) =>
    `anchor:${row.id}:${row.date}:${row.odometer}:${row.source || ""}`
  );
  const priorParts = (sources.priorWeeks || []).flatMap((week) => {
    const status = week.status || "none";
    const version = week.version || 0;
    const rows = [...(week.variances || [])].sort((a, b) =>
      `${a.driverId}:${a.vehicleId}`.localeCompare(`${b.driverId}:${b.vehicleId}`)
    );
    if (!rows.length) return [`prior:${week.weekStart}:${status}:${version}`];
    return rows.map((row) =>
      `prior:${week.weekStart}:${status}:${version}:${row.driverId}:${row.vehicleId}:${row.miscellaneousCost}`
    );
  });
  const prefs = sources.prefs || {};
  const prefPart = `prefs:${stable({
    personalAllowance: prefs.personalAllowance || null,
    personalAllowanceBonuses: prefs.personalAllowanceBonuses || null,
    tiers: prefs.tiers || null,
    quotas: prefs.quotas || null,
  })}`;
  return [
    ...entryParts,
    ...tripParts,
    ...adjustmentParts,
    ...scenarioParts,
    ...policyParts,
    ...driverParts,
    ...vehicleParts,
    ...fareParts,
    ...distanceParts,
    ...anchorParts,
    ...priorParts,
    prefPart,
    "shape:fuel-rule-v2",
    `engine:${FUEL_ENGINE_VERSION}`,
    `leftover:${stable(sources.leftoverOverride || null)}`,
  ];
}

export async function hashFuelWeekInputs(orgId: string, weekStart: string, weekEnd: string): Promise<string> {
  const entries = await loadWeekFuelEntries(orgId, weekStart, weekEnd);
  const [trips, adjustments, policies, drivers, vehicles, scenariosRaw, prefs, ver, fareSummary] =
    await Promise.all([
      loadOrgRows("trips", orgId, { dateFrom: addDaysYmd(weekStart, -1), dateTo: weekEnd }),
      loadOrgRows("fuel_adjustments", orgId),
      loadOrgRows("earnings_policies", orgId),
      loadOrgRows("drivers", orgId),
      loadOrgRows("vehicles", orgId),
      kv.getByPrefix("fuel_scenario:"),
      loadOrgPreferences(orgId),
      orgVersion(orgId),
      weekSummary({
        organizationId: orgId,
        from: `${String(weekStart).slice(0, 10)}T00:00:00.000Z`,
        to: `${String(weekEnd).slice(0, 10)}T23:59:59.999Z`,
        entryTypes: ["fare_earning"],
        products: ["roam_driver", "roam_fleet"],
      }),
    ]);
  const fareFingerprintParts = [
    `org_seq:${ver?.entry_seq ?? 0}:${ver?.changed_at ?? ""}`,
    ...fareSummary.map(
      (r) =>
        `fare_sum:${r.week_start}:${r.driver_id || ""}:${r.gross_minor}:${r.entry_count}:${r.sum_minor}`,
    ),
  ];
  const weekAdjustments = adjustments.filter((row) => {
    const day = ymd(row.date);
    return day >= weekStart && day <= weekEnd;
  });
  const scenarios = filterFuelScenariosForOrg(
    ((scenariosRaw || []) as Record<string, unknown>[]),
    orgId,
  );
  const vehicleIds = [...new Set(entries.map((entry) => String(entry.vehicleId || "")).filter(Boolean))];
  const sb = getServiceClient();
  const saved = vehicleIds.length
    ? await sb
      .from("vehicle_week_distance")
      .select("vehicle_id, deadhead_km, trip_km, personal_km, stale")
      .eq("organization_id", orgId)
      .eq("week_start", weekStart)
      .in("vehicle_id", vehicleIds)
    : { data: [], error: null };
  if (saved.error) throw new Error(saved.error.message);
  const anchors: Array<Record<string, unknown>> = [];
  for (const vehicleId of vehicleIds) {
    const history = await listOdometerLedger(vehicleId, { limit: 5000 });
    for (const row of history.data || []) {
      if (!row.isVerified || !row.isAnchorPoint) continue;
      anchors.push({
        id: String(row.id || ""),
        date: ymd(row.date || row.recordedAt),
        odometer: Number(row.value) || 0,
        source: row.source ? String(row.source) : "",
      });
    }
  }
  const period = await sb
    .from("fuel_reconciliation_period")
    .select("leftover_split_override")
    .eq("org_id", orgId)
    .eq("week_start", weekStart)
    .maybeSingle();
  const leftoverOverride = period.error ? null : period.data?.leftover_split_override ?? null;
  const priorCredit = await loadPriorWeekCredit(sb, orgId, weekStart);
  return hashParts(buildFuelWeekHashParts({
    entries: entries as unknown as Array<Record<string, unknown>>,
    trips,
    adjustments: weekAdjustments,
    scenarios,
    policies,
    drivers,
    vehicles,
    prefs: prefs as Record<string, unknown>,
    fareFingerprintParts,
    distances: (saved.data || []) as Array<Record<string, unknown>>,
    anchors,
    leftoverOverride,
    priorWeeks: priorCredit.weeks,
  }));
}

/**
 * A new snapshot stores the hash taken after prepare wrote distance rows.
 * The before-hash only reuses a snapshot that already matches the saved rows.
 */
function reportRoutingFailed(report: unknown): boolean {
  if (!report || typeof report !== "object") return false;
  const meta = (report as { metadata?: { routingHealth?: { ok?: boolean } } }).metadata;
  return meta?.routingHealth?.ok === false;
}

/** True when a saved snapshot recorded a failed route. A missing flag is not a failure. */
export function snapshotRoutingFailed(money: unknown): boolean {
  if (!money || typeof money !== "object") return false;
  const reports = (money as { reports?: unknown[] }).reports;
  if (!Array.isArray(reports)) return false;
  return reports.some(reportRoutingFailed);
}

/**
 * A failed route must be tried again. If the retry also fails, keep the saved snapshot
 * instead of writing a new copy with the same bad result.
 */
export function shouldReuseFuelSnapshot(args: {
  planReuse: boolean;
  savedRoutingFailed: boolean;
  freshRoutingFailed: boolean;
}): boolean {
  if (!args.planReuse) return false;
  if (!args.savedRoutingFailed) return true;
  return args.freshRoutingFailed;
}

function moneyCents(value: unknown): number {
  return Math.round((Number(value) || 0) * 100);
}

/** Fuel totals the lock is allowed to keep when only the fingerprint moved. */
export function fuelSnapshotMoneyKey(money: unknown): string {
  const body = money && typeof money === "object"
    ? money as { reports?: unknown[]; totalSpend?: number }
    : {};
  const reports = Array.isArray(body.reports) ? body.reports : [];
  const parts = reports.map((report) => {
    const row = report && typeof report === "object" ? report as Record<string, unknown> : {};
    return [
      String(row.vehicleId || ""),
      moneyCents(row.totalGasCardCost),
      moneyCents(row.driverShare),
      moneyCents(row.companyShare),
      moneyCents(row.miscellaneousCost),
    ].join(":");
  }).sort();
  return `${moneyCents(body.totalSpend)}|${parts.join("|")}`;
}

export function fuelSnapshotWritePlan(args: {
  latestHash: string | null | undefined;
  beforeHash: string;
  afterHash: string;
}): { reuse: boolean; hash: string } {
  const latest = String(args.latestHash || "");
  if (latest && (latest === args.beforeHash || latest === args.afterHash)) {
    return { reuse: true, hash: latest };
  }
  return { reuse: false, hash: args.afterHash };
}

export async function computeFuelWeekSnapshot(args: {
  orgId: string;
  periodId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const sb = getServiceClient();
  const beforeHash = await hashFuelWeekInputs(args.orgId, args.weekStart, args.weekEnd);
  const { data: latest } = await sb
    .from("fuel_week_snapshot")
    .select("id, version, inputs_hash, money")
    .eq("org_id", args.orgId)
    .eq("period_id", args.periodId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const savedRoutingFailed = snapshotRoutingFailed(latest?.money);
  if (latest && latest.inputs_hash === beforeHash && !savedRoutingFailed) {
    await rememberPeriodTotals(sb, args, latest.money);
    return { snapshot: latest, reused: true };
  }
  const built = await prepareFuelWeekReports({
    orgId: args.orgId,
    weekStart: args.weekStart,
    weekEnd: args.weekEnd,
  });
  if (!built.ok) {
    throw new Error(built.error || "fuel week compute failed");
  }
  const afterHash = await hashFuelWeekInputs(args.orgId, args.weekStart, args.weekEnd);
  const plan = fuelSnapshotWritePlan({
    latestHash: latest?.inputs_hash,
    beforeHash,
    afterHash,
  });
  const freshRoutingFailed = built.reports.some(reportRoutingFailed);
  if (shouldReuseFuelSnapshot({
    planReuse: plan.reuse && !!latest,
    savedRoutingFailed,
    freshRoutingFailed,
  }) && latest) {
    await rememberPeriodTotals(sb, args, latest.money);
    return { snapshot: latest, reused: true };
  }
  const version = (Number(latest?.version) || 0) + 1;
  const money = { reports: built.reports, totalSpend: built.totalSpend };
  const { data: inserted, error } = await sb
    .from("fuel_week_snapshot")
    .insert({
      org_id: args.orgId,
      period_id: args.periodId,
      week_start: args.weekStart,
      version,
      inputs_hash: plan.hash,
      money,
      blockers: [],
      provenance: { engine: "generateDriverFleetReport", engineVersion: FUEL_ENGINE_VERSION },
    })
    .select("id, version, inputs_hash, money")
    .single();
  if (error) throw new Error(error.message);
  await rememberPeriodTotals(sb, args, money);

  return { snapshot: inserted, reused: false };
}

function moneySum(reports: Array<Record<string, unknown>>, key: string): number {
  const total = reports.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  return Math.round(total * 100) / 100;
}

/** Copy the snapshot onto the period row so the week list shows the server total. */
async function rememberPeriodTotals(
  sb: ReturnType<typeof getServiceClient>,
  args: { orgId: string; periodId: string },
  money: unknown,
) {
  const body = money && typeof money === "object" ? money as { reports?: unknown[]; totalSpend?: number } : {};
  const reports = (Array.isArray(body.reports) ? body.reports : []) as Array<Record<string, unknown>>;
  const vehicleIds = new Set(reports.map((row) => String(row.vehicleId || "")).filter(Boolean));
  const driverIds = new Set(reports.map((row) => String(row.driverId || "")).filter(Boolean));
  const now = new Date().toISOString();
  const { error } = await sb
    .from("fuel_reconciliation_period")
    .update({
      total_spend: Math.round((Number(body.totalSpend) || moneySum(reports, "totalGasCardCost")) * 100) / 100,
      gas_card_spend: moneySum(reports, "totalGasCardCost"),
      company_share: moneySum(reports, "companyShare"),
      driver_share: moneySum(reports, "driverShare"),
      unexplained: moneySum(reports, "miscellaneousCost"),
      vehicle_count: vehicleIds.size,
      driver_count: driverIds.size,
      computed_at: now,
      updated_at: now,
    })
    .eq("id", args.periodId)
    .eq("org_id", args.orgId);
  if (error) throw new Error(error.message);
}

export async function loadLatestFuelWeekSnapshot(orgId: string, periodId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("fuel_week_snapshot")
    .select("id, version, inputs_hash, money")
    .eq("org_id", orgId)
    .eq("period_id", periodId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadFuelWeekSnapshotVersion(args: {
  orgId: string;
  periodId: string;
  version: number;
}) {
  const sb = getServiceClient();
  const { data: row, error } = await sb
    .from("fuel_week_snapshot")
    .select("id, version, inputs_hash, money, week_start")
    .eq("org_id", args.orgId)
    .eq("period_id", args.periodId)
    .eq("version", args.version)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false as const, status: 409, body: { error: "snapshot_stale" } };
  const { data: newer } = await sb
    .from("fuel_week_snapshot")
    .select("version")
    .eq("org_id", args.orgId)
    .eq("period_id", args.periodId)
    .gt("version", args.version)
    .limit(1);
  if (newer && newer.length) {
    return { ok: false as const, status: 409, body: { error: "snapshot_stale", currentVersion: newer[0].version } };
  }
  return { ok: true as const, row };
}

/**
 * Compare the saved snapshot with the new engine for recent weeks.
 * Does not write a snapshot and does not lock a week.
 */
export async function shadowFuelEngineDrift(args: {
  orgId: string;
  weeks?: number;
  weekStart?: string;
  status?: string;
}) {
  const sb = getServiceClient();
  const limit = Math.max(1, Math.min(8, args.weeks || 8));
  const oneWeek = String(args.weekStart || "").slice(0, 10);
  const status = String(args.status || "").trim();
  let query = sb
    .from("fuel_reconciliation_period")
    .select("id, week_start, week_end, status")
    .eq("org_id", args.orgId)
    .order("week_start", { ascending: false });
  if (status) query = query.eq("status", status);
  if (oneWeek) query = query.eq("week_start", oneWeek).limit(1);
  else query = query.limit(limit);
  const { data: periods, error } = await query;
  if (error) throw new Error(error.message);
  const weeks = [];
  for (const period of periods || []) {
    const weekStart = String(period.week_start);
    const weekEnd = String(period.week_end);
    const { data: snap } = await sb
      .from("fuel_week_snapshot")
      .select("money, version, provenance")
      .eq("org_id", args.orgId)
      .eq("period_id", period.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const built = await prepareFuelWeekReports({
      orgId: args.orgId,
      weekStart,
      weekEnd,
      persistDistance: false,
    });
    const oldReports = (snap?.money?.reports || []) as Array<Record<string, unknown>>;
    const newReports = (built.ok ? built.reports : []) as Array<Record<string, unknown>>;
    weeks.push({
      periodId: period.id,
      weekStart,
      status: period.status,
      locked: period.status === "locked",
      engineVersion: FUEL_ENGINE_VERSION,
      error: built.ok ? null : built.error,
      drivers: fuelShadowDrift(oldReports, newReports),
    });
  }
  return { engineVersion: FUEL_ENGINE_VERSION, weeks };
}
