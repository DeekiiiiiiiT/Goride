/**
 * Week Reconciliation — landing (P1) + run wizard API (P3).
 */
import type { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  hasPlatformStaffAccess,
  hasPermission,
  platformMfaRequiredResponse,
  type Permission,
  type RbacUser,
} from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { getServiceClient, getServiceClientWithSchema } from "./service_client.ts";
import {
  computeSourceStatusFromCoverage,
  resolveSourceRequirements,
  sourcesForLine,
  weekDayKeys,
  RECON_SOURCES,
  type OrgReconProfile,
  type ReconServiceLine,
  type ReconSourceId,
  type RunStepId,
  type SourceAggregateStatus,
  type SourceRequirement,
} from "./recon_sources_mirror.ts";
import {
  evaluateRun,
  compositeInputsHashForStep,
  RECON_STEP_ORDER,
  type ReconSourceSnapshot,
} from "./evaluate_run_mirror.ts";
import { registerReconImportRoutes } from "./recon_import_routes.ts";
import * as kv from "./kv_store.tsx";
import {
  periodEndForAnchor,
  periodKeyFor,
  DEFAULT_FLEET_TZ,
} from "../../../packages/finance-core/src/periodKey.ts";
import { isSettlementPeriodEnded } from "../../../packages/finance-core/src/settlementPeriodGate.ts";
import {
  computeTagAccountRollForward,
  tagLedgerAmountToRollForwardParts,
} from "../../../packages/finance-core/src/tagAccountRollForward.ts";
import {
  coverageInputHash,
  countTripsEarningsBlockers,
  countSettlementPreviewBlockers,
  isReconHumanSourceStatus,
} from "../../../packages/finance-core/src/coverageInputHash.ts";
import { countBlockersForStep } from "../../../packages/finance-core/src/closeBlockerSteps.ts";
import { sourceVolumeMetrics } from "./recon_volume.ts";
import { isReconWeekFrozen } from "./recon_week_writable.ts";
import { logReconPhase } from "./recon_phase_log.ts";
import type { StoredWeekBlocker } from "./recon_projection_read.ts";

async function refuseFrozenReconWeek(
  c: Context,
  orgId: string,
  weekKey: string,
): Promise<Response | null> {
  if (!(await isReconWeekFrozen(orgId, weekKey))) return null;
  return c.json({ error: "PERIOD_FROZEN", message: "Reopen the week first" }, 409);
}

const BASE = "/make-server-37f42386/recon";
const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

type ReconLine = "rideshare" | "rush_delivery";

type WeekRunRow = {
  id: string;
  organization_id: string;
  service_line: string;
  week_key: string;
  state: string;
  version: number;
  opened_by: string | null;
  opened_at: string;
  closed_at: string | null;
  closed_by: string | null;
  close_run_id: string | null;
  desk_snapshot?: unknown;
  desk_computed_at?: string | null;
  desk_requested_at?: string | null;
};

function reconDb() {
  return getServiceClientWithSchema("recon");
}

function mondayOfToday(): string {
  const now = new Date();
  const dow = now.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  now.setDate(now.getDate() + delta);
  return now.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + days);
  return local.toISOString().slice(0, 10);
}

function recentWeekKeys(count: number, year?: number): string[] {
  const keys: string[] = [];
  let anchor = mondayOfToday();
  for (let i = 0; i < count; i += 1) {
    const y = Number(anchor.slice(0, 4));
    if (year == null || y === year) keys.push(anchor);
    anchor = addDaysYmd(anchor, -7);
  }
  return keys;
}

function markWeekFromDay(
  active: Set<string>,
  candidateSet: Set<string>,
  dayRaw: string,
): void {
  const day = String(dayRaw || "").slice(0, 10);
  if (!WEEK_RE.test(day)) return;
  const monday = periodKeyFor(day, DEFAULT_FLEET_TZ);
  if (monday && candidateSet.has(monday)) active.add(monday);
}

/** Mark every candidate Monday that overlaps [start, end] inclusive. */
function markWeeksOverlappingRange(
  active: Set<string>,
  candidateSet: Set<string>,
  startRaw: string,
  endRaw: string,
): void {
  const startDay = String(startRaw || "").slice(0, 10);
  const endDay = String(endRaw || "").slice(0, 10);
  if (!WEEK_RE.test(startDay) || !WEEK_RE.test(endDay)) return;
  let monday = periodKeyFor(startDay, DEFAULT_FLEET_TZ);
  if (!monday) return;
  while (monday <= endDay) {
    if (candidateSet.has(monday)) active.add(monday);
    monday = addDaysYmd(monday, 7);
  }
}

/**
 * Do not invent empty calendar weeks. Shared org sources (toll usage / top-ups)
 * stay required when tags exist — without this filter every blank Monday shows
 * “Provide Tag account…” with zero line activity.
 *
 * Rideshare activity = completed non-delivery trips and/or rideshare import
 * batches that cover the week. Delivery activity = completed rush_delivery trips.
 */
async function weekKeysWithLineActivity(
  orgId: string,
  line: ReconLine,
  candidates: string[],
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const sorted = [...candidates].filter((k) => WEEK_RE.test(k)).sort();
  if (sorted.length === 0) return [];
  const rangeStart = sorted[0];
  const rangeEnd = periodEndForAnchor(sorted[sorted.length - 1]);
  const candidateSet = new Set(sorted);
  const active = new Set<string>();
  const sb = getServiceClient();

  let tripQuery = sb
    .from("fleet_trips")
    .select("date, service_line")
    .eq("organization_id", orgId)
    .eq("status", "Completed")
    .gte("date", rangeStart)
    .lte("date", rangeEnd)
    .limit(100000);

  if (line === "rush_delivery") {
    tripQuery = tripQuery.eq("service_line", "rush_delivery");
  }

  const { data: trips, error: tripErr } = await tripQuery;
  if (tripErr) {
    console.warn(`[recon-weeks] ${line} trip activity lookup failed`, tripErr.message);
  } else {
    for (const row of trips ?? []) {
      const sl = String((row as { service_line?: string | null }).service_line || "");
      // Null / rideshare / other → rideshare desk; delivery-only → Delivery desk.
      if (line === "rideshare" && sl === "rush_delivery") continue;
      if (line === "rush_delivery" && sl !== "rush_delivery") continue;
      markWeekFromDay(active, candidateSet, String((row as { date?: string }).date || ""));
    }
  }

  if (line === "rideshare") {
    const { data: batches, error: batchErr } = await sb
      .from("fleet_import_batches")
      .select("coverage_start, coverage_end, source_id")
      .eq("organization_id", orgId)
      .in("source_id", ["uber_bundle", "indrive_trips"])
      .in("status", ["completed", "committed"])
      .lte("coverage_start", rangeEnd)
      .gte("coverage_end", rangeStart)
      .limit(500);

    if (batchErr) {
      console.warn("[recon-weeks] rideshare import activity lookup failed", batchErr.message);
    } else {
      for (const b of batches ?? []) {
        const start = String((b as { coverage_start?: string }).coverage_start || "").slice(0, 10);
        const end = String((b as { coverage_end?: string }).coverage_end || "").slice(0, 10);
        if (WEEK_RE.test(start) && WEEK_RE.test(end)) {
          markWeeksOverlappingRange(active, candidateSet, start, end);
        }
      }
    }
  }

  // Keep candidate order (newest first).
  return candidates.filter((k) => active.has(k));
}

function actorFromContext(c: Context): string {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return String(user?.userId ?? user?.email ?? "system");
}

function parseLine(raw: string): ReconLine | null {
  if (raw === "rideshare" || raw === "rush_delivery") return raw;
  return null;
}

const ATTRIBUTION_ROW_CAP = 200;

async function loadUnattributedForWeek(
  orgId: string,
  weekKey: string,
): Promise<{
  rowCount: number;
  amountMajor: number;
  rows: Array<{ id: string; entity: "toll" | "fuel"; amountMajor: number }>;
}> {
  const end = periodEndForAnchor(weekKey);
  const sb = getServiceClient();
  let rowCount = 0;
  let amountMajor = 0;
  const rows: Array<{ id: string; entity: "toll" | "fuel"; amountMajor: number }> = [];

  const { count: tollCount } = await sb
    .from("fleet_toll_ledger")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .is("service_line", null)
    .eq("service_line_source", "unattributed");

  const { data: tollRows, error: tollErr } = await sb
    .from("fleet_toll_ledger")
    .select("id, amount")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .is("service_line", null)
    .eq("service_line_source", "unattributed")
    .limit(ATTRIBUTION_ROW_CAP);
  if (!tollErr && tollRows) {
    rowCount += tollCount ?? tollRows.length;
    for (const r of tollRows) {
      const amt = Math.abs(Number((r as { amount?: number }).amount) || 0);
      amountMajor += amt;
      rows.push({ id: String((r as { id: string }).id), entity: "toll", amountMajor: amt });
    }
  }

  const { count: fuelCount } = await sb
    .from("fleet_fuel_entries")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .is("service_line", null)
    .eq("service_line_source", "unattributed");

  const { data: fuelRows, error: fuelErr } = await sb
    .from("fleet_fuel_entries")
    .select("id, amount")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .is("service_line", null)
    .eq("service_line_source", "unattributed")
    .limit(Math.max(0, ATTRIBUTION_ROW_CAP - rows.length));
  if (!fuelErr && fuelRows) {
    rowCount += fuelCount ?? fuelRows.length;
    for (const r of fuelRows) {
      const amt = Math.abs(Number((r as { amount?: number }).amount) || 0);
      amountMajor += amt;
      rows.push({ id: String((r as { id: string }).id), entity: "fuel", amountMajor: amt });
    }
  }

  return {
    rowCount,
    amountMajor: Math.round(amountMajor * 100) / 100,
    rows,
    truncated: rowCount > rows.length,
  };
}

async function loadOrgReconProfile(orgId: string): Promise<OrgReconProfile> {
  const sb = getServiceClient();
  const { data: orgRow } = await sb
    .from("organizations")
    .select("service_lines, enabled_modules")
    .eq("id", orgId)
    .maybeSingle();

  const serviceLinesRaw = (orgRow?.service_lines as string[] | null) ?? ["rideshare"];
  const serviceLines = serviceLinesRaw.filter(
    (l): l is ReconServiceLine => l === "rideshare" || l === "rush_delivery" || l === "org",
  );
  if (serviceLines.length === 0) serviceLines.push("rideshare");

  const { count: uberTripCount } = await sb
    .from("fleet_trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .ilike("platform", "%uber%");

  const { count: uberBatchCount } = await sb
    .from("fleet_import_batches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("type", "merged_import");

  const { count: indriveCount } = await sb
    .from("fleet_trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .ilike("platform", "%indrive%");

  const { count: tagCount } = await sb
    .from("fleet_toll_tags")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const { count: fuelCardCount } = await sb
    .from("fleet_fuel_cards")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const modules = (orgRow?.enabled_modules as Record<string, boolean> | null) ?? {};
  const rushDeliveryEnabled = Boolean(modules.rush_delivery ?? modules.rush);

  let hasSelfServeJaa = false;
  try {
    const programs = (await kv.getByPrefix("jaa_program:")) || [];
    hasSelfServeJaa = programs.some(
      (p: { organizationId?: string; mode?: string }) =>
        String(p.organizationId || "") === orgId && p.mode === "self_serve",
    );
  } catch {
    hasSelfServeJaa = false;
  }

  return {
    serviceLines,
    hasUberDrivers: (uberTripCount ?? 0) > 0 || (uberBatchCount ?? 0) > 0,
    hasIndriveDrivers: (indriveCount ?? 0) > 0,
    hasTollTags: (tagCount ?? 0) > 0,
    hasRoamFuelCards: (fuelCardCount ?? 0) > 0,
    hasSelfServeJaa,
    rushDeliveryEnabled,
  };
}

async function fetchCoverageMap(
  orgId: string,
  line: ReconLine,
  sourceId: ReconSourceId,
  weekKey: string,
): Promise<Record<string, string>> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc("compute_source_coverage", {
    p_org: orgId,
    p_line: line,
    p_source_id: sourceId,
    p_week_key: weekKey,
  });
  if (error) {
    console.warn("[recon] compute_source_coverage rpc failed", sourceId, weekKey, error.message);
    const days = weekDayKeys(weekKey);
    return Object.fromEntries(days.map((d) => [d, "missing"]));
  }
  return (data as Record<string, string>) ?? {};
}

async function materializeRunSources(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  runId: string,
  profile: OrgReconProfile,
): Promise<
  Array<{
    id: ReconSourceId;
    label: string;
    requirement: SourceRequirement;
    status: SourceAggregateStatus;
    coverage: Record<string, string>;
    inputHash: string;
  }>
> {
  const requirements = resolveSourceRequirements(profile, weekKey);
  const reqById = Object.fromEntries(requirements.map((r) => [r.sourceId, r.requirement]));
  const defs = sourcesForLine(line);
  const out = [];

  const recon = reconDb();
  const { data: priorRows } = await recon
    .from("run_sources")
    .select("source_id, status")
    .eq("run_id", runId);
  const priorStatus = new Map(
    (priorRows ?? []).map((r) => [
      String((r as { source_id: string }).source_id),
      String((r as { status: string }).status),
    ]),
  );

  for (const def of defs) {
    const requirement = reqById[def.id] ?? def.requiredWhen(profile, weekKey);
    const coverageStarted = Date.now();
    const coverage = await fetchCoverageMap(orgId, line, def.id, weekKey);
    logReconPhase(`coverage:${def.id}`, coverageStarted, { weekKey, line });
    let status = computeSourceStatusFromCoverage(coverage, requirement, {
      waitingExternal: def.id === "fuel_card_roam" &&
        requirement === "required" &&
        Object.values(coverage).every((v) => v === "missing"),
      // Keep approver waive across rematerialize (coverage alone cannot express waived).
      waived: priorStatus.get(def.id) === "waived",
    });
    const volumeStarted = Date.now();
    const volume = await sourceVolumeMetrics(orgId, def.id, weekKey);
    logReconPhase(`volume:${def.id}`, volumeStarted, { weekKey, line });
    const inputHash = coverageInputHash(coverage, volume);
    out.push({
      id: def.id,
      label: def.label,
      requirement,
      status,
      coverage,
      inputHash,
    });

    await recon.from("run_sources").upsert(
      {
        run_id: runId,
        source_id: def.id,
        requirement,
        status,
        coverage,
        input_hash: inputHash,
        row_count: volume.rowCount,
        amount_minor: volume.amountMinor,
      },
      { onConflict: "run_id,source_id" },
    );
  }

  return out;
}

async function ensureWeekRun(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  openedBy: string,
): Promise<WeekRunRow> {
  const recon = reconDb();
  const { data: existing } = await recon
    .from("week_runs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("service_line", line)
    .eq("week_key", weekKey)
    .maybeSingle();

  if (existing) return existing as WeekRunRow;

  const { data: inserted, error } = await recon
    .from("week_runs")
    .insert({
      organization_id: orgId,
      service_line: line,
      week_key: weekKey,
      opened_by: openedBy,
    })
    .select("*")
    .single();

  if (error || !inserted) {
    const { data: raced } = await recon
      .from("week_runs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("service_line", line)
      .eq("week_key", weekKey)
      .maybeSingle();
    if (raced) return raced as WeekRunRow;
    throw error ?? new Error("Failed to create week run");
  }

  const run = inserted as WeekRunRow;
  const stepRows = RECON_STEP_ORDER.map((stepId) => ({
    run_id: run.id,
    step_id: stepId,
    actionable: 0,
    informational: 0,
  }));
  await recon.from("run_steps").upsert(stepRows, { onConflict: "run_id,step_id" });
  return run;
}

async function loadRunSteps(runId: string) {
  const { data } = await reconDb()
    .from("run_steps")
    .select("*")
    .eq("run_id", runId);
  return (data ?? []) as Array<{
    step_id: string;
    actionable: number;
    informational: number;
    completed_at: string | null;
    completed_by: string | null;
    inputs_hash_at_complete: string | null;
  }>;
}

function sourcesStepCounts(
  sources: Array<{ requirement: SourceRequirement; status: SourceAggregateStatus }>,
): { actionable: number; informational: number } {
  const actionable = sources.filter(
    (s) =>
      s.requirement === "required" &&
      (s.status === "missing" || s.status === "partial" || s.status === "waiting_external"),
  ).length;
  return { actionable, informational: 0 };
}

/**
 * What the Close step shows: the same saved blockers the steps and the close workflow read.
 * "none" = the calculator has not run for this week yet; "error" = the read failed (Close stays locked).
 */
type CloseCheck =
  | { status: "ok"; blockers: StoredWeekBlocker[] }
  | { status: "none" }
  | { status: "error" };

/** Live lane actionable counts for run_steps + complete gates (R2-11 / R3-04/08/11). */
async function computeLiveStepCounts(
  orgId: string,
  weekKey: string,
  line: ReconLine,
  sources: Array<{ requirement: SourceRequirement; status: SourceAggregateStatus }>,
  runId?: string,
): Promise<{
  counts: Partial<Record<RunStepId, { actionable: number; informational: number }>>;
  closeCheck: CloseCheck;
}> {
  const sb = getServiceClient();
  const attribution = await loadUnattributedForWeek(orgId, weekKey);

  let tollActionable = 0;
  const { data: tollPeriod } = await sb
    .from("toll_reconciliation_period")
    .select("state, blockers")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", line)
    .maybeSingle();
  // R3-04: also treat closed toll week_statement as complete (historical path).
  const { data: tollStmt } = await sb
    .from("week_statements")
    .select("id")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("kind", "toll")
    .eq("status", "closed")
    .limit(1)
    .maybeSingle();
  const tollDoneViaStatement = Boolean(tollStmt);
  if (tollDoneViaStatement) {
    tollActionable = 0;
  } else if (!tollPeriod) {
    tollActionable = 1;
  } else {
    const state = String((tollPeriod as { state?: string }).state || "");
    if (state !== "ready" && state !== "sealed") {
      const blockers = (tollPeriod as { blockers?: unknown }).blockers;
      tollActionable = Array.isArray(blockers) && blockers.length > 0 ? blockers.length : 1;
    }
  }

  let fuelActionable = 0;
  const { data: fuelPeriod } = await sb
    .from("fuel_reconciliation_period")
    .select("status, counts")
    .eq("org_id", orgId)
    .eq("week_start", weekKey)
    .eq("service_line", line)
    .maybeSingle();
  if (!fuelPeriod) {
    fuelActionable = 1;
  } else {
    const status = String((fuelPeriod as { status?: string }).status || "");
    if (status === "locked") {
      fuelActionable = 0;
    } else {
      const counts = (fuelPeriod as { counts?: Record<string, { actionable?: number }> }).counts;
      if (counts && typeof counts === "object") {
        fuelActionable = Object.values(counts).reduce(
          (sum, c) => sum + (Number(c?.actionable) || 0),
          0,
        );
      }
      if (fuelActionable === 0) fuelActionable = 1;
    }
  }

  // Trips, settlement, and close read the saved blockers. No engine on this request.
  // No saved projection yet: settlement stays open so a week cannot be signed blind.
  let tripsActionable = 0;
  let settlementActionable = 1;
  let closeActionable = 0;
  let previewBlockers: Array<{ code?: string | null; severity?: string | null }> = [];
  let closeCheck: CloseCheck = { status: "none" };
  try {
    const { loadWeekBlockerRows, loadWeekProjectionStatus } = await import("./recon_projection_read.ts");
    const projection = await loadWeekProjectionStatus(orgId, weekKey);
    if (projection.totalDrivers > 0) {
      const stored = await loadWeekBlockerRows(orgId, weekKey, line);
      closeCheck = { status: "ok", blockers: stored };
      previewBlockers = stored.map((row) => ({ code: row.code, severity: row.severity }));
      tripsActionable = countTripsEarningsBlockers(previewBlockers);
      settlementActionable = countSettlementPreviewBlockers(previewBlockers);
      closeActionable = countBlockersForStep("close", previewBlockers);
    }
  } catch (e) {
    console.warn("[recon] stored blocker read failed", e);
    // Fail closed: a failed read must not show the week as clear.
    closeCheck = { status: "error" };
    closeActionable = 1;
  }

  // Period probes can read clear while a close rule on that lane is still open.
  fuelActionable = Math.max(fuelActionable, countBlockersForStep("fuel", previewBlockers));
  tollActionable = Math.max(tollActionable, countBlockersForStep("tolls", previewBlockers));

  let tagActionable = 0;
  try {
    const { openingMinor } = await loadPriorTagClosingMinor(orgId, weekKey);
    const { topUpsMinor, tagUsageMinor } = await sumTagLedgerWeekMinor(orgId, weekKey);
    const statementClosingMinor = runId
      ? await loadStoredStatementClosingMinor(runId)
      : null;
    const roll = computeTagAccountRollForward({
      openingMinor,
      topUpsMinor,
      tagUsageMinor,
      statementClosingMinor,
    });
    if (roll.varianceMinor != null && !roll.ties) tagActionable = 1;
  } catch (e) {
    console.warn("[recon] tag_account actionable probe failed", e);
  }

  return {
    counts: {
      sources: sourcesStepCounts(sources),
      attribution: { actionable: attribution.rowCount, informational: 0 },
      trips_earnings: { actionable: tripsActionable, informational: 0 },
      tolls: { actionable: tollActionable, informational: 0 },
      tag_account: { actionable: tagActionable, informational: 0 },
      fuel: { actionable: fuelActionable, informational: 0 },
      settlement_preview: { actionable: settlementActionable, informational: 0 },
      close: { actionable: closeActionable, informational: 0 },
    },
    closeCheck,
  };
}

async function persistLiveStepCounts(
  runId: string,
  live: Partial<Record<RunStepId, { actionable: number; informational: number }>>,
) {
  const existing = await loadRunSteps(runId);
  const byId = new Map(existing.map((r) => [r.step_id, r]));
  const rows = RECON_STEP_ORDER.map((stepId) => {
    const prev = byId.get(stepId);
    return {
      run_id: runId,
      step_id: stepId,
      actionable: live[stepId]?.actionable ?? 0,
      informational: live[stepId]?.informational ?? 0,
      completed_at: prev?.completed_at ?? null,
      completed_by: prev?.completed_by ?? null,
      inputs_hash_at_complete: prev?.inputs_hash_at_complete ?? null,
    };
  });
  await reconDb().from("run_steps").upsert(rows, {
    onConflict: "run_id,step_id",
    ignoreDuplicates: false,
  });
}

async function buildRunPayload(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  openedBy: string,
) {
  const profileStarted = Date.now();
  const profile = await loadOrgReconProfile(orgId);
  logReconPhase("profile", profileStarted, { weekKey, line });
  const ensureStarted = Date.now();
  const run = await ensureWeekRun(orgId, line, weekKey, openedBy);
  logReconPhase("ensure_run", ensureStarted, { weekKey, line });
  const sourcesStarted = Date.now();
  const sources = await materializeRunSources(orgId, line, weekKey, run.id, profile);
  logReconPhase("materialize_sources", sourcesStarted, { weekKey, line, sources: sources.length });
  const stepsStarted = Date.now();
  const { counts: liveCounts, closeCheck } = await computeLiveStepCounts(orgId, weekKey, line, sources, run.id);
  logReconPhase("step_counts", stepsStarted, { weekKey, line });
  const persistStarted = Date.now();
  await persistLiveStepCounts(run.id, liveCounts);
  const stepRows = await loadRunSteps(run.id);
  logReconPhase("persist_steps", persistStarted, { weekKey, line });

  const sourceSnaps: ReconSourceSnapshot[] = sources.map((s) => ({
    id: s.id,
    status: s.status,
    inputHash: s.inputHash,
  }));

  const stepCounts: Partial<Record<RunStepId, { actionable: number; informational: number }>> = {
    ...liveCounts,
  };
  for (const row of stepRows) {
    // Preserve completed_* from DB; actionable comes from liveCounts.
    if (!stepCounts[row.step_id as RunStepId]) {
      stepCounts[row.step_id as RunStepId] = {
        actionable: row.actionable ?? 0,
        informational: row.informational ?? 0,
      };
    }
  }

  const completedSteps = stepRows
    .filter((r) => r.completed_at)
    .map((r) => ({
      stepId: r.step_id as RunStepId,
      completedAt: r.completed_at,
      inputsHashAtComplete: r.inputs_hash_at_complete,
    }));

  const evaluation = evaluateRun({ sources: sourceSnaps, stepCounts, completedSteps });
  const attributionStarted = Date.now();
  const attribution = await loadUnattributedForWeek(orgId, weekKey);
  logReconPhase("attribution", attributionStarted, { weekKey, line, rows: attribution.rowCount });

  const payload = {
    deskReady: true,
    run: {
      id: run.id,
      organizationId: run.organization_id,
      serviceLine: run.service_line,
      weekKey: String(run.week_key).slice(0, 10),
      state: run.state,
      version: run.version,
      openedBy: run.opened_by,
      openedAt: run.opened_at,
      closedAt: run.closed_at,
      closedBy: run.closed_by,
      closeRunId: run.close_run_id,
    },
    evaluation,
    attribution,
    closeCheck,
    sources: sources.map((s) => {
      const def = RECON_SOURCES.find((d) => d.id === s.id);
      return {
        id: s.id,
        label: s.label,
        kind: def?.kind ?? "upload",
        requirement: s.requirement,
        status: s.status,
        coverage: s.coverage,
        inputHash: s.inputHash,
      };
    }),
    steps: stepRows.map((r) => {
      const live = liveCounts[r.step_id as RunStepId];
      return {
        id: r.step_id,
        actionable: live?.actionable ?? r.actionable,
        informational: live?.informational ?? r.informational,
        completedAt: r.completed_at,
        completedBy: r.completed_by,
        inputsHashAtComplete: r.inputs_hash_at_complete,
      gateStatus: evaluation.steps.find((e) => e.id === r.step_id)?.status ?? "locked",
    };
  }),
  };
  const saveStarted = Date.now();
  const { error: saveError } = await reconDb().from("week_runs").update({
    desk_snapshot: payload,
    desk_computed_at: new Date().toISOString(),
  }).eq("id", run.id);
  logReconPhase("desk_save", saveStarted, { weekKey, line, ok: !saveError });
  if (saveError) console.warn("[recon] desk snapshot write failed", saveError.message);
  return payload;
}

export async function publishWeekDesk(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  openedBy: string,
) {
  return buildRunPayload(orgId, line, weekKey, openedBy);
}

function deskRunFields(run: WeekRunRow) {
  return {
    id: run.id,
    organizationId: run.organization_id,
    serviceLine: run.service_line,
    weekKey: String(run.week_key).slice(0, 10),
    state: run.state,
    version: run.version,
    openedBy: run.opened_by,
    openedAt: run.opened_at,
    closedAt: run.closed_at,
    closedBy: run.closed_by,
    closeRunId: run.close_run_id,
  };
}

function isDeskSnapshot(value: unknown): value is { sources: unknown[]; steps: unknown[]; evaluation: unknown; run: Record<string, unknown> } {
  if (!value || typeof value !== "object") return false;
  const row = value as { sources?: unknown; steps?: unknown; evaluation?: unknown; run?: unknown };
  return Array.isArray(row.sources) && Array.isArray(row.steps) && row.evaluation != null && row.run != null && typeof row.run === "object";
}

/** Step rail + Continue follow current blockers, not the last saved picture. */
async function overlayLiveStepGates(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  run: WeekRunRow,
  snapshot: { sources?: unknown; evaluation?: unknown; closeCheck?: unknown; run: Record<string, unknown> },
) {
  try {
    const sources = (Array.isArray(snapshot.sources) ? snapshot.sources : []) as Array<{
      id?: string;
      requirement?: SourceRequirement;
      status?: SourceAggregateStatus;
      inputHash?: string;
    }>;
    const { counts, closeCheck } = await computeLiveStepCounts(
      orgId,
      weekKey,
      line,
      sources.map((s) => ({
        requirement: (s.requirement || "required") as SourceRequirement,
        status: (s.status || "missing") as SourceAggregateStatus,
      })),
      run.id,
    );
    const stepRows = await loadRunSteps(run.id);
    const completedSteps = stepRows
      .filter((r) => r.completed_at)
      .map((r) => ({
        stepId: r.step_id as RunStepId,
        completedAt: r.completed_at,
        inputsHashAtComplete: r.inputs_hash_at_complete,
      }));
    const sourceSnaps: ReconSourceSnapshot[] = sources.map((s) => ({
      id: String(s.id || "") as ReconSourceId,
      status: (s.status || "missing") as SourceAggregateStatus,
      inputHash: String(s.inputHash || ""),
    }));
    const evaluation = evaluateRun({ sources: sourceSnaps, stepCounts: counts, completedSteps });
    return { ...snapshot, evaluation, closeCheck };
  } catch (e) {
    console.warn("[recon] live step gates failed", e instanceof Error ? e.message : e);
    return snapshot;
  }
}

function withLiveRun(
  snapshot: { run: Record<string, unknown> },
  run: WeekRunRow,
) {
  return {
    ...snapshot,
    deskReady: true,
    run: { ...snapshot.run, ...deskRunFields(run) },
  };
}

function preparingPayload(run: WeekRunRow) {
  return {
    deskReady: false,
    run: deskRunFields(run),
    evaluation: {
      stage: "collecting",
      steps: [],
      nextAction: { kind: "wait", targetId: "sources", label: "Preparing this week" },
    },
    attribution: { rowCount: 0, amountMajor: 0, rows: [] },
    sources: [],
    steps: [],
  };
}

async function requestWeekDesk(run: WeekRunRow): Promise<void> {
  if (!("desk_requested_at" in run)) return;
  const requestedAt = run.desk_requested_at ? Date.parse(run.desk_requested_at) : NaN;
  if (Number.isFinite(requestedAt) && Date.now() - requestedAt < 120_000) return;
  const { error: stampError } = await reconDb()
    .from("week_runs")
    .update({ desk_requested_at: new Date().toISOString() })
    .eq("id", run.id);
  if (stampError) {
    console.warn("[recon] desk request stamp failed", stampError.message);
    return;
  }
  const { error } = await getServiceClient().rpc("recon_enqueue_week_desk", {
    p_org: run.organization_id,
    p_line: run.service_line,
    p_week: String(run.week_key).slice(0, 10),
  });
  if (error) console.warn("[recon] desk enqueue failed", error.message);
}

async function bumpRunVersion(
  runId: string,
  expectedVersion: number | undefined,
): Promise<{ ok: true; version: number } | { ok: false; status: 409; currentVersion: number }> {
  const recon = reconDb();
  const { data: current } = await recon.from("week_runs").select("version").eq("id", runId).single();
  const cur = Number(current?.version ?? 0);
  if (expectedVersion != null && expectedVersion !== cur) {
    return { ok: false, status: 409, currentVersion: cur };
  }
  const next = cur + 1;
  const { data: updated, error } = await recon
    .from("week_runs")
    .update({ version: next })
    .eq("id", runId)
    .eq("version", cur)
    .select("version")
    .maybeSingle();
  if (error || !updated) {
    const { data: again } = await recon.from("week_runs").select("version").eq("id", runId).single();
    return { ok: false, status: 409, currentVersion: Number(again?.version ?? cur) };
  }
  return { ok: true, version: Number(updated.version) };
}

async function appendRunEvent(
  runId: string,
  actor: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  await reconDb().from("run_events").insert({
    run_id: runId,
    actor,
    kind,
    payload,
  });
}

function canAccessExternalQueue(user: RbacUser): boolean {
  return hasPlatformStaffAccess(user)
    || hasPermission(user.resolvedRole, "recon.external_sources" as Permission);
}

type ExternalQueueItem = {
  organizationId: string;
  organizationName: string | null;
  serviceLine: string;
  weekKey: string;
  sourceId: string;
  runId: string | null;
  runSourceStatus: string | null;
  requestId: string | null;
  requestedAt: string | null;
  requestedBy: string | null;
  note: string | null;
};

async function loadExternalQueue(): Promise<ExternalQueueItem[]> {
  const recon = reconDb();
  const sb = getServiceClient();

  const { data: waitingRows } = await recon
    .from("run_sources")
    .select("run_id, source_id, status")
    .eq("source_id", "fuel_card_roam")
    .eq("status", "waiting_external");

  const runIds = [...new Set((waitingRows ?? []).map((r) => String((r as { run_id: string }).run_id)))];
  const runById = new Map<string, WeekRunRow>();
  if (runIds.length) {
    const { data: runs } = await recon.from("week_runs").select("*").in("id", runIds);
    for (const run of runs ?? []) {
      runById.set(String((run as WeekRunRow).id), run as WeekRunRow);
    }
  }

  const { data: openRequests } = await recon
    .from("external_source_requests")
    .select("*")
    .eq("status", "open")
    .eq("source_id", "fuel_card_roam");

  const byKey = new Map<string, ExternalQueueItem>();

  for (const row of waitingRows ?? []) {
    const wr = row as { run_id: string; source_id: string; status: string };
    const w = runById.get(wr.run_id);
    if (!w) continue;
    const weekKey = String(w.week_key).slice(0, 10);
    const key = `${w.organization_id}|${w.service_line}|${weekKey}|${wr.source_id}`;
    byKey.set(key, {
      organizationId: w.organization_id,
      organizationName: null,
      serviceLine: w.service_line,
      weekKey,
      sourceId: wr.source_id,
      runId: wr.run_id,
      runSourceStatus: wr.status,
      requestId: null,
      requestedAt: null,
      requestedBy: null,
      note: null,
    });
  }

  for (const req of openRequests ?? []) {
    const r = req as {
      id: string;
      organization_id: string;
      service_line: string;
      week_key: string;
      source_id: string;
      requested_at: string;
      requested_by: string;
      note: string | null;
    };
    const weekKey = String(r.week_key).slice(0, 10);
    const key = `${r.organization_id}|${r.service_line}|${weekKey}|${r.source_id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.requestId = r.id;
      existing.requestedAt = r.requested_at;
      existing.requestedBy = r.requested_by;
      existing.note = r.note;
    } else {
      byKey.set(key, {
        organizationId: r.organization_id,
        organizationName: null,
        serviceLine: r.service_line,
        weekKey,
        sourceId: r.source_id,
        runId: null,
        runSourceStatus: null,
        requestId: r.id,
        requestedAt: r.requested_at,
        requestedBy: r.requested_by,
        note: r.note,
      });
    }
  }

  const orgIds = [...new Set([...byKey.values()].map((i) => i.organizationId))];
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgRows } = await sb
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const o of orgRows ?? []) {
      orgNames.set(String((o as { id: string }).id), String((o as { name?: string }).name ?? ""));
    }
  }

  const items = [...byKey.values()].map((item) => ({
    ...item,
    organizationName: orgNames.get(item.organizationId) ?? null,
  }));

  items.sort((a, b) => {
    if (a.weekKey !== b.weekKey) return a.weekKey < b.weekKey ? 1 : -1;
    return (a.organizationName ?? a.organizationId).localeCompare(b.organizationName ?? b.organizationId);
  });

  return items;
}

async function loadPriorTagClosingMinor(
  orgId: string,
  weekKey: string,
): Promise<{ openingMinor: number; priorWeekKey: string | null }> {
  const recon = reconDb();
  const { data: priorRuns } = await recon
    .from("week_runs")
    .select("id, week_key, state")
    .eq("organization_id", orgId)
    .lt("week_key", weekKey)
    .eq("state", "closed")
    .order("week_key", { ascending: false })
    .limit(5);

  for (const row of priorRuns ?? []) {
    const runId = String(row.id);
    const priorWeekKey = String(row.week_key).slice(0, 10);
    const { data: events } = await recon
      .from("run_events")
      .select("payload")
      .eq("run_id", runId)
      .eq("kind", "tag_account_statement_closing")
      .order("at", { ascending: false })
      .limit(1);
    const payload = events?.[0]?.payload as { statementClosingMinor?: number } | undefined;
    const minor = payload?.statementClosingMinor;
    if (minor != null && Number.isFinite(Number(minor))) {
      return { openingMinor: Math.round(Number(minor)), priorWeekKey };
    }
  }
  return { openingMinor: 0, priorWeekKey: null };
}

async function sumTagLedgerWeekMinor(
  orgId: string,
  weekKey: string,
): Promise<{ topUpsMinor: number; tagUsageMinor: number }> {
  const sb = getServiceClient();
  const end = periodEndForAnchor(weekKey);
  const { data, error } = await sb
    .from("fleet_toll_ledger")
    .select("amount, type, payment_method, status, metadata, payload_json")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .limit(100000);
  if (error) {
    console.warn("[recon] tag ledger week sum failed", error.message);
    return { topUpsMinor: 0, tagUsageMinor: 0 };
  }

  let topUpsMinor = 0;
  let tagUsageMinor = 0;
  for (const row of data ?? []) {
    const payload = (row.payload_json as Record<string, unknown>) || {};
    const meta = {
      ...((row.metadata as Record<string, unknown>) || {}),
      ...((payload.metadata as Record<string, unknown>) || {}),
    };
    const parts = tagLedgerAmountToRollForwardParts({
      type: String(row.type || payload.type || ""),
      amount: Number(row.amount),
      paymentMethod: String(row.payment_method || payload.paymentMethod || ""),
      status: String(row.status || ""),
      metadata: meta as { voided?: boolean },
    });
    topUpsMinor += parts.topUpMinor;
    tagUsageMinor += parts.usageMinor;
  }
  return { topUpsMinor, tagUsageMinor };
}

async function loadStoredStatementClosingMinor(runId: string): Promise<number | null> {
  const { data } = await reconDb()
    .from("run_events")
    .select("payload")
    .eq("run_id", runId)
    .eq("kind", "tag_account_statement_closing")
    .order("at", { ascending: false })
    .limit(1);
  const payload = data?.[0]?.payload as { statementClosingMinor?: number } | undefined;
  if (payload?.statementClosingMinor == null) return null;
  const n = Number(payload.statementClosingMinor);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function pickNextAction(
  sources: Array<{ id: ReconSourceId; status: SourceAggregateStatus; label: string }>,
): { kind: string; targetId: string; label: string } {
  const block = sources.find((s) =>
    s.status === "missing" || s.status === "partial" || s.status === "waiting_external"
  );
  if (block) {
    return { kind: "source", targetId: block.id, label: `Provide ${block.label}` };
  }
  const fuel = sources.find((s) => s.id === "fuel_card_roam" && s.status === "received");
  if (fuel) {
    return { kind: "step", targetId: "fuel", label: "Review fuel reconciliation" };
  }
  return { kind: "step", targetId: "sources", label: "Continue week reconciliation" };
}

export function registerReconRoutes(app: Hono) {
  app.get(
    `${BASE}/runs/:line/:weekKey/status`,
    requireAuth({ strict: true }),
    requireAnyPermission("recon.view", "transactions.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        const { loadWeekProjectionStatus } = await import("./recon_projection_read.ts");
        const status = await loadWeekProjectionStatus(orgId, weekKey);
        return c.json({ success: true, ...status });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-status");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/retry-failed`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        const sb = getServiceClient();
        const { data } = await sb.schema("recon")
          .from("projection_state")
          .select("unit_kind, driver_id, vehicle_id")
          .eq("organization_id", orgId)
          .eq("week_key", weekKey)
          .eq("status", "failed");
        for (const row of data ?? []) {
          await sb.rpc("recon_enqueue_unit", {
            p_org: orgId,
            p_kind: (row as { unit_kind?: string }).unit_kind,
            p_week: weekKey,
            p_driver: (row as { driver_id?: string | null }).driver_id,
            p_vehicle: (row as { vehicle_id?: string | null }).vehicle_id,
          });
        }
        const { loadWeekProjectionStatus } = await import("./recon_projection_read.ts");
        const status = await loadWeekProjectionStatus(orgId, weekKey);
        return c.json({ success: true, ...status });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-retry");
      }
    },
  );

  app.post(
    `${BASE}/worker/tick`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    (c: Context) => {
      return c.json({ success: true, hosted: "container", processed: 0, workflows: 0 });
    },
  );

  app.post(
    `${BASE}/worker/nightly`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    (c: Context) => {
      return c.json({ success: true, hosted: "container", enqueued: 0 });
    },
  );

  app.get(
    `${BASE}/weeks`,
    requireAuth({ strict: true }),
    requireAnyPermission("recon.view", "transactions.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) {
          return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        }

        const lineRaw = c.req.query("line") || "rideshare";
        const line = parseLine(lineRaw);
        if (!line) {
          return c.json({ error: "INVALID_LINE", message: "line must be rideshare or rush_delivery" }, 400);
        }
        const yearRaw = c.req.query("year");
        const year = yearRaw ? Number(yearRaw) : undefined;
        if (yearRaw && (!Number.isFinite(year) || year! < 2000 || year! > 2100)) {
          return c.json({ error: "INVALID_YEAR", message: "year must be YYYY" }, 400);
        }

        const profile = await loadOrgReconProfile(orgId);
        const requirements = resolveSourceRequirements(profile, mondayOfToday());
        const reqById = Object.fromEntries(requirements.map((r) => [r.sourceId, r.requirement]));
        const defs = sourcesForLine(line);

        // Delivery tab with rush not actually active: no line sources → do not
        // surface shared toll/fuel as fake Delivery work.
        if (line === "rush_delivery" && reqById.rush_deliveries === "not_applicable") {
          return c.json({ success: true, weeks: [], line, year: year ?? null });
        }

        const sb = getServiceClient();
        let weekKeys = recentWeekKeys(12, year);

        const { data: rpcRows, error: rpcErr } = await sb.rpc("list_week_source_summaries", {
          p_org: orgId,
          p_line: line,
          p_year: year ?? null,
        });

        if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
          weekKeys = rpcRows.map((r: { week_key: string }) => String(r.week_key).slice(0, 10));
        }

        weekKeys = await weekKeysWithLineActivity(orgId, line, weekKeys);
        // Statements are not due until the day after Sunday. The current
        // Mon–Sun week stays off the list so it is not shown as missing data.
        weekKeys = weekKeys.filter((weekKey) =>
          isSettlementPeriodEnded({ periodAnchor: weekKey })
        );

        const { data: runStateRows } = await reconDb()
          .from("week_runs")
          .select("week_key, state")
          .eq("organization_id", orgId)
          .eq("service_line", line);
        const closedWeeks = new Set(
          (runStateRows ?? [])
            .filter((r) => String((r as { state?: string }).state || "") === "closed")
            .map((r) => String((r as { week_key?: string }).week_key || "").slice(0, 10)),
        );

        const weeks = [];
        for (const weekKey of weekKeys) {
          if (!WEEK_RE.test(weekKey)) continue;
          const sourceSnaps = [];
          for (const def of defs) {
            const requirement = reqById[def.id] ?? def.requiredWhen(profile, weekKey);
            const coverage = await fetchCoverageMap(orgId, line, def.id, weekKey);
            const status = computeSourceStatusFromCoverage(coverage, requirement, {
              waitingExternal: def.id === "fuel_card_roam" &&
                requirement === "required" &&
                Object.values(coverage).every((v) => v === "missing"),
            });
            sourceSnaps.push({ id: def.id, status, coverage, label: def.label });
          }

          const actionable = sourceSnaps.filter(
            (s) => reqById[s.id as ReconSourceId] === "required" &&
              (s.status === "missing" || s.status === "partial" || s.status === "waiting_external"),
          );
          const missingCount = actionable.length;
          const nextAction = pickNextAction(sourceSnaps);
          const done = sourceSnaps.filter((s) =>
            s.status === "received" || s.status === "not_applicable" || s.status === "attested_none"
          ).length;

          const runClosed = closedWeeks.has(weekKey);
          weeks.push({
            weekKey,
            line,
            state: runClosed ? "closed" : missingCount > 0 ? "collecting" : "reconciling",
            progress: { done, total: sourceSnaps.length },
            nextAction,
            blockers: missingCount,
            sources: sourceSnaps.map(({ id, status, coverage }) => ({ id, status, coverage })),
          });
        }

        const statusFilter = c.req.query("status");
        let filtered = weeks;
        if (statusFilter === "outstanding") {
          filtered = weeks.filter((w) => w.state !== "closed" && w.blockers > 0);
        } else if (statusFilter === "in_progress") {
          filtered = weeks.filter((w) => w.state === "reconciling");
        } else if (statusFilter === "completed") {
          filtered = weeks.filter((w) => w.state === "closed");
        }

        return c.json({ success: true, weeks: filtered, line, year: year ?? null });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-weeks");
      }
    },
  );

  app.get(
    `${BASE}/runs/:line/:weekKey`,
    requireAuth({ strict: true }),
    requireAnyPermission("recon.view", "transactions.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        if (!line) return c.json({ error: "INVALID_LINE", message: "Invalid service line" }, 400);
        if (!WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_WEEK", message: "weekKey must be YYYY-MM-DD (Monday)" }, 400);
        }
        const started = Date.now();
        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        if (!("desk_snapshot" in run)) {
          logReconPhase("desk_read", started, { hit: false, fallback: "live", weekKey, line });
          const payload = await buildRunPayload(orgId, line, weekKey, actor);
          return c.json({ success: true, ...payload });
        }
        if (isDeskSnapshot(run.desk_snapshot)) {
          // The saved picture keeps "in progress" after the pay list is empty,
          // and Continue only appears once the step is ready. Recompute the
          // gates from the current blockers on each open.
          const live = await overlayLiveStepGates(orgId, line, weekKey, run, run.desk_snapshot);
          logReconPhase("desk_read", started, { hit: true, weekKey, line, liveGates: true });
          return c.json({ success: true, ...withLiveRun(live, run) });
        }
        await requestWeekDesk(run);
        logReconPhase("desk_read", started, { hit: false, weekKey, line });
        return c.json({ success: true, ...preparingPayload(run) });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-run-get");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/sources/:sourceId/attest-none`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        const sourceId = c.req.param("sourceId") as ReconSourceId;
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        const frozen = await refuseFrozenReconWeek(c, orgId, weekKey);
        if (frozen) return frozen;
        if (!RECON_SOURCES.some((s) => s.id === sourceId)) {
          return c.json({ error: "INVALID_SOURCE", message: "Unknown source id" }, 400);
        }

        const body = await c.req.json().catch(() => ({})) as {
          days?: string[];
          reason?: string;
          expectedVersion?: number;
        };
        const days = Array.isArray(body.days) ? body.days.map((d) => String(d).slice(0, 10)) : [];
        // Reason is optional — "No activity this week" is the attestation itself.
        const reason = String(body.reason ?? "").trim() || "No activity this week";
        if (!days.length) {
          return c.json({ error: "VALIDATION", message: "days[] is required" }, 400);
        }

        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        const bump = await bumpRunVersion(run.id, body.expectedVersion);
        if (!bump.ok) {
          return c.json({
            error: "VERSION_CONFLICT",
            message: "Run was updated by someone else",
            currentVersion: bump.currentVersion,
          }, 409);
        }

        const recon = reconDb();
        for (const day of days) {
          await recon.from("source_attestations").upsert(
            {
              organization_id: orgId,
              service_line: line,
              week_key: weekKey,
              source_id: sourceId,
              day,
              kind: "attest_none",
              reason,
              actor,
            },
            { onConflict: "organization_id,service_line,week_key,source_id,day,kind" },
          );
        }

        const profile = await loadOrgReconProfile(orgId);
        const def = RECON_SOURCES.find((s) => s.id === sourceId)!;
        const requirement = def.requiredWhen(profile, weekKey);
        let coverage = await fetchCoverageMap(orgId, line, sourceId, weekKey);
        for (const day of days) {
          coverage = { ...coverage, [day]: "zero_attested" };
        }
        const status = computeSourceStatusFromCoverage(coverage, requirement);
        const volume = await sourceVolumeMetrics(orgId, sourceId, weekKey);
        const inputHash = coverageInputHash(coverage, volume);

        await recon.from("run_sources").upsert({
          run_id: run.id,
          source_id: sourceId,
          requirement,
          status,
          coverage,
          input_hash: inputHash,
          row_count: volume.rowCount,
          amount_minor: volume.amountMinor,
          attested_by: actor,
          attested_at: new Date().toISOString(),
          attest_reason: reason,
        }, { onConflict: "run_id,source_id" });

        await appendRunEvent(run.id, actor, "source_attest_none", { sourceId, days, reason });

        const payload = await buildRunPayload(orgId, line, weekKey, actor);
        return c.json({ success: true, ...payload });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-attest-none");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/sources/:sourceId/waive`,
    requireAuth({ strict: true }),
    // R3-09: waive is approver-only (Rev 1) — preparer must not skip what they sign off.
    requirePermission("recon.approve"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        const sourceId = c.req.param("sourceId") as ReconSourceId;
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        const frozen = await refuseFrozenReconWeek(c, orgId, weekKey);
        if (frozen) return frozen;

        const body = await c.req.json().catch(() => ({})) as {
          reason?: string;
          expectedVersion?: number;
        };
        const reason = String(body.reason ?? "").trim();
        if (!reason) return c.json({ error: "VALIDATION", message: "reason is required" }, 400);

        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        const bump = await bumpRunVersion(run.id, body.expectedVersion);
        if (!bump.ok) {
          return c.json({
            error: "VERSION_CONFLICT",
            currentVersion: bump.currentVersion,
          }, 409);
        }

        const profile = await loadOrgReconProfile(orgId);
        const def = RECON_SOURCES.find((s) => s.id === sourceId);
        if (!def) return c.json({ error: "INVALID_SOURCE", message: "Unknown source" }, 400);
        const requirement = def.requiredWhen(profile, weekKey);
        const coverage = await fetchCoverageMap(orgId, line, sourceId, weekKey);
        const volume = await sourceVolumeMetrics(orgId, sourceId, weekKey);

        await reconDb().from("run_sources").upsert({
          run_id: run.id,
          source_id: sourceId,
          requirement,
          status: "waived",
          coverage,
          input_hash: coverageInputHash(coverage, volume),
          row_count: volume.rowCount,
          amount_minor: volume.amountMinor,
          attested_by: actor,
          attested_at: new Date().toISOString(),
          attest_reason: reason,
        }, { onConflict: "run_id,source_id" });

        await appendRunEvent(run.id, actor, "source_waived", { sourceId, reason });
        const payload = await buildRunPayload(orgId, line, weekKey, actor);
        return c.json({ success: true, ...payload });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-waive");
      }
    },
  );

  app.get(
    `${BASE}/runs/:line/:weekKey/tag-account`,
    requireAuth({ strict: true }),
    requireAnyPermission("recon.view", "transactions.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }

        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        const { openingMinor, priorWeekKey } = await loadPriorTagClosingMinor(orgId, weekKey);
        const { topUpsMinor, tagUsageMinor } = await sumTagLedgerWeekMinor(orgId, weekKey);
        const statementClosingMinor = await loadStoredStatementClosingMinor(run.id);
        const roll = computeTagAccountRollForward({
          openingMinor,
          topUpsMinor,
          tagUsageMinor,
          statementClosingMinor,
        });

        return c.json({
          success: true,
          weekKey,
          priorWeekKey,
          openingMinor,
          topUpsMinor,
          tagUsageMinor,
          statementClosingMinor,
          ...roll,
        });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-tag-account");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/events`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        const frozen = await refuseFrozenReconWeek(c, orgId, weekKey);
        if (frozen) return frozen;

        const body = await c.req.json().catch(() => ({})) as {
          kind?: string;
          payload?: Record<string, unknown>;
          expectedVersion?: number;
        };
        const kind = String(body.kind ?? "").trim();
        if (!kind) return c.json({ error: "VALIDATION", message: "kind is required" }, 400);

        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        const bump = await bumpRunVersion(run.id, body.expectedVersion);
        if (!bump.ok) {
          return c.json({
            error: "VERSION_CONFLICT",
            currentVersion: bump.currentVersion,
          }, 409);
        }

        const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
        await appendRunEvent(run.id, actor, kind, payload);

        const responsePayload = await buildRunPayload(orgId, line, weekKey, actor);
        return c.json({ success: true, ...responsePayload });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-run-event");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/attribution`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        const frozen = await refuseFrozenReconWeek(c, orgId, weekKey);
        if (frozen) return frozen;

        const body = await c.req.json().catch(() => ({})) as {
          rows?: Array<{ id: string; entity?: string; serviceLine?: string }>;
          expectedVersion?: number;
        };
        const rows = Array.isArray(body.rows) ? body.rows : [];
        if (!rows.length) {
          return c.json({ error: "VALIDATION", message: "rows[] is required" }, 400);
        }

        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        const bump = await bumpRunVersion(run.id, body.expectedVersion);
        if (!bump.ok) {
          return c.json({
            error: "VERSION_CONFLICT",
            currentVersion: bump.currentVersion,
          }, 409);
        }

        const sb = getServiceClient();
        const now = new Date().toISOString();
        let updated = 0;

        for (const row of rows) {
          const id = String(row.id ?? "").trim();
          const entity = String(row.entity ?? "toll").toLowerCase();
          const targetLine = row.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
          if (!id) continue;

          if (entity === "fuel") {
            const { error } = await sb
              .from("fleet_fuel_entries")
              .update({
                service_line: targetLine,
                service_line_source: "explicit",
                service_line_set_at: now,
              })
              .eq("organization_id", orgId)
              .eq("id", id);
            if (!error) updated += 1;
          } else {
            const { error } = await sb
              .from("fleet_toll_ledger")
              .update({
                service_line: targetLine,
                service_line_source: "explicit",
                service_line_set_at: now,
              })
              .eq("organization_id", orgId)
              .eq("id", id);
            if (!error) updated += 1;
          }
        }

        await appendRunEvent(run.id, actor, "attribution_manual", { updated, rowCount: rows.length });
        const payload = await buildRunPayload(orgId, line, weekKey, actor);
        return c.json({ success: true, updated, ...payload });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-attribution");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/steps/:stepId/complete`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        const stepId = c.req.param("stepId") as RunStepId;
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        const frozen = await refuseFrozenReconWeek(c, orgId, weekKey);
        if (frozen) return frozen;
        if (!(RECON_STEP_ORDER as readonly string[]).includes(stepId)) {
          return c.json({ error: "INVALID_STEP", message: "Unknown step id" }, 400);
        }

        const body = await c.req.json().catch(() => ({})) as {
          expectedInputsHash?: string;
          expectedVersion?: number;
        };

        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);

        const profile = await loadOrgReconProfile(orgId);
        const sources = await materializeRunSources(orgId, line, weekKey, run.id, profile);
        const { counts: liveCounts } = await computeLiveStepCounts(orgId, weekKey, line, sources, run.id);
        await persistLiveStepCounts(run.id, liveCounts);

        const sourceSnaps: ReconSourceSnapshot[] = sources.map((s) => ({
          id: s.id,
          status: s.status,
          inputHash: s.inputHash,
        }));
        const stepRows = await loadRunSteps(run.id);
        const completedSteps = stepRows
          .filter((r) => r.completed_at)
          .map((r) => ({
            stepId: r.step_id as RunStepId,
            completedAt: r.completed_at,
            inputsHashAtComplete: r.inputs_hash_at_complete,
          }));
        const evaluation = evaluateRun({
          sources: sourceSnaps,
          stepCounts: liveCounts,
          completedSteps,
        });
        const stepEval = evaluation.steps.find((s) => s.id === stepId);
        const actionable = liveCounts[stepId]?.actionable ?? 0;
        if (!stepEval || stepEval.status === "locked") {
          return c.json({
            error: "STEP_LOCKED",
            message: "Step is locked until earlier steps and feeding sources are complete",
            lockedBy: stepEval?.lockedBy ?? null,
          }, 409);
        }
        if (actionable > 0) {
          return c.json({
            error: "STEP_HAS_ACTIONABLE",
            message: "Cannot complete step while actionable items remain",
            actionable,
          }, 409);
        }

        const bump = await bumpRunVersion(run.id, body.expectedVersion);
        if (!bump.ok) {
          return c.json({
            error: "VERSION_CONFLICT",
            currentVersion: bump.currentVersion,
          }, 409);
        }

        const currentHash = compositeInputsHashForStep(stepId, sourceSnaps);
        if (body.expectedInputsHash && body.expectedInputsHash !== currentHash) {
          return c.json({
            error: "INPUTS_STALE",
            message: "Source data changed since the client loaded this step",
            currentInputsHash: currentHash,
          }, 409);
        }

        const now = new Date().toISOString();
        await reconDb().from("run_steps").upsert({
          run_id: run.id,
          step_id: stepId,
          actionable: 0,
          informational: liveCounts[stepId]?.informational ?? 0,
          completed_at: now,
          completed_by: actor,
          inputs_hash_at_complete: currentHash,
        }, { onConflict: "run_id,step_id" });

        await appendRunEvent(run.id, actor, "step_complete", { stepId, inputsHash: currentHash });
        await buildRunPayload(orgId, line, weekKey, actor);
        return c.json({ success: true, ok: true, version: bump.version });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-step-complete");
      }
    },
  );

  app.post(
    `${BASE}/runs/:line/:weekKey/sources/:sourceId/request`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED", message: "organizationId is required" }, 400);
        const line = parseLine(c.req.param("line"));
        const weekKey = String(c.req.param("weekKey") || "").slice(0, 10);
        const sourceId = c.req.param("sourceId") as ReconSourceId;
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        const frozen = await refuseFrozenReconWeek(c, orgId, weekKey);
        if (frozen) return frozen;
        if (!RECON_SOURCES.some((s) => s.id === sourceId)) {
          return c.json({ error: "INVALID_SOURCE", message: "Unknown source id" }, 400);
        }
        const def = RECON_SOURCES.find((s) => s.id === sourceId);
        if (def?.kind !== "external_dependency") {
          return c.json({ error: "INVALID_SOURCE", message: "Source is not an external dependency" }, 400);
        }

        const body = await c.req.json().catch(() => ({})) as { note?: string; expectedVersion?: number };
        const note = body.note != null ? String(body.note).trim() : "";
        const actor = actorFromContext(c);
        const run = await ensureWeekRun(orgId, line, weekKey, actor);
        const bump = await bumpRunVersion(run.id, body.expectedVersion);
        if (!bump.ok) {
          return c.json({
            error: "VERSION_CONFLICT",
            currentVersion: bump.currentVersion,
          }, 409);
        }

        const recon = reconDb();
        const { data: existingReq } = await recon
          .from("external_source_requests")
          .select("id")
          .eq("organization_id", orgId)
          .eq("service_line", line)
          .eq("week_key", weekKey)
          .eq("source_id", sourceId)
          .eq("status", "open")
          .maybeSingle();

        let requestId: string;
        const now = new Date().toISOString();
        if (existingReq?.id) {
          requestId = String(existingReq.id);
          await recon.from("external_source_requests").update({
            requested_at: now,
            requested_by: actor,
            note: note || null,
          }).eq("id", requestId);
        } else {
          const { data: inserted, error: insErr } = await recon
            .from("external_source_requests")
            .insert({
              organization_id: orgId,
              service_line: line,
              week_key: weekKey,
              source_id: sourceId,
              requested_by: actor,
              note: note || null,
              status: "open",
            })
            .select("id")
            .single();
          if (insErr || !inserted) throw insErr ?? new Error("Failed to create external source request");
          requestId = String(inserted.id);
        }

        if (sourceId === "fuel_card_roam") {
          const profile = await loadOrgReconProfile(orgId);
          const requirement = def.requiredWhen(profile, weekKey);
          const coverage = await fetchCoverageMap(orgId, line, sourceId, weekKey);
          const status = computeSourceStatusFromCoverage(coverage, requirement, {
            waitingExternal: requirement === "required"
              && Object.values(coverage).every((v) => v === "missing"),
          });
          const effectiveStatus = status === "missing" || status === "partial"
            ? "waiting_external"
            : status;

          const volume = await sourceVolumeMetrics(orgId, sourceId, weekKey);
          await recon.from("run_sources").upsert({
            run_id: run.id,
            source_id: sourceId,
            requirement,
            status: effectiveStatus,
            coverage,
            input_hash: coverageInputHash(coverage, volume),
            row_count: volume.rowCount,
            amount_minor: volume.amountMinor,
          }, { onConflict: "run_id,source_id" });
        }

        await appendRunEvent(run.id, actor, "external_source_requested", {
          sourceId,
          requestId,
          note: note || null,
        });

        const payload = await buildRunPayload(orgId, line, weekKey, actor);
        return c.json({ success: true, requestId, ...payload });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-source-request");
      }
    },
  );

  app.get(
    `${BASE}/external-queue`,
    requireAuth({ strict: true }),
    async (c: Context) => {
      try {
        const user = c.get("rbacUser") as RbacUser | undefined;
        if (!user) return c.json({ error: "Unauthorized" }, 401);
        const mfaBlock = platformMfaRequiredResponse(c, user);
        if (mfaBlock) return mfaBlock;
        if (!canAccessExternalQueue(user)) {
          return c.json({
            error: "Forbidden",
            message: "Platform admin or recon.external_sources permission required",
            code: "RECON_EXTERNAL_FORBIDDEN",
          }, 403);
        }
        const items = await loadExternalQueue();
        return c.json({ success: true, items });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-external-queue");
      }
    },
  );

  registerReconImportRoutes(app);
}
