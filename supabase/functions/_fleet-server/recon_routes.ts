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
  orgMainLine,
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
  hiddenLaneSteps,
  RECON_STEP_ORDER,
  type ReconSourceSnapshot,
} from "./evaluate_run_mirror.ts";
import {
  deskInputsHash,
  expandWeekCoverage,
  fuelHasNothingToFinalize,
  requiredSourcesMissing,
  sortWeekList,
  weekListEntry,
  weekListKpis,
  type StoredSource,
} from "./recon_desk_shape.ts";
import { computeWeekLevelBlockers, weekLevelBlockerRows } from "./recon_week_blockers.ts";
import type { BlockerRow } from "./recon_week_blocker_rows.ts";
import { correlationIdFrom, idempotencyKeyFrom, isLegacyCleanupWeek, withWeekChange, type WeekChangeOutcome } from "./recon_week_change.ts";
import {
  approvalActionLabel,
  canWithdraw,
  decideApprove,
  isApprovalAction,
  rejectReasonError,
} from "./recon_approval_state.ts";
import { acknowledgeCashSourceMismatch, reopenWeek, sealEarningsLaneForWeek } from "./week_close.ts";
import { startWeekWorkflow } from "./recon_close_workflow.ts";
import { registerReconImportRoutes } from "./recon_import_routes.ts";
import { shapeWeekActivity } from "./recon_activity.ts";
import { FEATURE_FLAGS, isFeatureEnabled } from "./feature_flags.ts";
import * as kv from "./kv_store.tsx";
import {
  periodEndForAnchor,
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
import {
  countBlockersForStep,
  serverStepForBlockerCode,
} from "../../../packages/finance-core/src/closeBlockerSteps.ts";
import { sourceVolumeMetrics } from "./recon_volume.ts";
import { isReconWeekFrozen } from "./recon_week_writable.ts";
import { logReconPhase } from "./recon_phase_log.ts";
import { deskCashMismatches, displayNamesFor, historyItem, HISTORY_HIDDEN_KINDS, loadOtherApproverCount, withDriverNames } from "./recon_desk_reads.ts";
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
  main_line?: string | null;
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
  return expandWeekCoverage(data as Record<string, string> | null, weekKey);
}

type DeskSource = {
  id: ReconSourceId;
  label: string;
  requirement: SourceRequirement;
  status: SourceAggregateStatus;
  coverage: Record<string, string>;
  inputHash: string;
  rowCount: number | null;
  amountMinor: number | null;
  /** WRA-18: when someone last pressed Remind for this source this week. */
  lastRequestedAt: string | null;
};

/** The week's sources, worked out from the facts. Writes nothing (the desk publish saves them). */
async function computeRunSources(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  run: WeekRunRow,
  profile: OrgReconProfile,
): Promise<DeskSource[]> {
  const recon = reconDb();
  // WRA-10: requirements are resolved for THIS week, then stored with the desk.
  const requirements = resolveSourceRequirements(profile, weekKey);
  const reqById = Object.fromEntries(requirements.map((r) => [r.sourceId, r.requirement]));
  // WRA-11: the tag-account sources follow the main line frozen on the run.
  const runMainLine = (run.main_line ?? orgMainLine(profile) ?? "rideshare") as ReconLine;
  const defs = sourcesForLine(line, runMainLine);
  const out: DeskSource[] = [];

  const { data: priorRows, error: priorErr } = await recon
    .from("run_sources")
    .select("source_id, status")
    .eq("run_id", run.id);
  if (priorErr) throw new Error(`run sources read failed: ${priorErr.message}`);
  const priorStatus = new Map(
    (priorRows ?? []).map((r) => [
      String((r as { source_id: string }).source_id),
      String((r as { status: string }).status),
    ]),
  );

  const { data: requestRows } = await recon
    .from("external_source_requests")
    .select("source_id, requested_at")
    .eq("organization_id", orgId)
    .eq("service_line", line)
    .eq("week_key", weekKey)
    .order("requested_at", { ascending: false });
  const lastRequested = new Map<string, string>();
  for (const r of (requestRows ?? []) as Array<{ source_id: string; requested_at: string }>) {
    if (!lastRequested.has(r.source_id)) lastRequested.set(r.source_id, r.requested_at);
  }

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
      rowCount: volume.rowCount ?? null,
      amountMinor: volume.amountMinor ?? null,
      lastRequestedAt: lastRequested.get(def.id) ?? null,
    });
  }

  return out;
}

/**
 * WRA-13: weeks are created by the calculator (recon.ensure_ended_week_runs),
 * never by opening a page or pressing a button. A missing week is "not ready".
 */
async function loadWeekRun(orgId: string, line: ReconLine, weekKey: string): Promise<WeekRunRow | null> {
  const { data, error } = await reconDb()
    .from("week_runs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("service_line", line)
    .eq("week_key", weekKey)
    .maybeSingle();
  if (error) throw new Error(`week run read failed: ${error.message}`);
  return (data as WeekRunRow | null) ?? null;
}

function weekNotReady(c: Context) {
  return c.json({
    error: "WEEK_NOT_READY",
    message: "This week is still being prepared. Try again in a minute.",
  }, 409);
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
  // One rule for the step and the week list (recon_desk_shape.requiredSourcesMissing).
  return { actionable: requiredSourcesMissing(sources), informational: 0 };
}

/**
 * What the Close step shows: the same saved blockers the steps and the close workflow read.
 * "none" = the calculator has not run for this week yet; "error" = the read failed (Close stays locked).
 */
type CloseCheck =
  | { status: "ok"; blockers: StoredWeekBlocker[] }
  | { status: "none" }
  | { status: "error" };

/**
 * Step counts for the desk (R2-11 / R3-04/08/11). Runs only when the desk is built
 * (calculator or a user's own change), never on a page read (WRA-08).
 * `blockers` = the saved driver rows + this build's whole-week rows; null = the read failed.
 */
async function computeLiveStepCounts(
  orgId: string,
  weekKey: string,
  line: ReconLine,
  sources: Array<{ id: string; requirement: SourceRequirement; status: SourceAggregateStatus }>,
  runId: string,
  blockers: StoredWeekBlocker[] | null,
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
  if (fuelHasNothingToFinalize(sources)) {
    // Rev 24: every fuel file is "no activity" / waived — nothing to finalize.
    fuelActionable = 0;
  } else if (!fuelPeriod) {
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
  if (blockers === null) {
    // Fail closed: a failed read must not show the week as clear.
    closeCheck = { status: "error" };
    closeActionable = 1;
  } else {
    previewBlockers = blockers.map((row) => ({ code: row.code, severity: row.severity }));
    const { loadWeekProjectionStatus } = await import("./recon_projection_read.ts");
    const projection = await loadWeekProjectionStatus(orgId, weekKey);
    if (projection.totalDrivers > 0) {
      closeCheck = { status: "ok", blockers };
      tripsActionable = countTripsEarningsBlockers(previewBlockers);
      settlementActionable = countSettlementPreviewBlockers(previewBlockers);
      closeActionable = countBlockersForStep("close", previewBlockers);
    }
  }

  // Period probes can read clear while a close rule on that lane is still open.
  fuelActionable = Math.max(fuelActionable, countBlockersForStep("fuel", previewBlockers));
  tollActionable = Math.max(tollActionable, countBlockersForStep("tolls", previewBlockers));

  let tagActionable = 0;
  try {
    const { openingMinor } = await loadPriorTagClosingMinor(orgId, weekKey);
    const { topUpsMinor, tagUsageMinor } = await sumTagLedgerWeekMinor(orgId, weekKey);
    const statementClosingMinor = await loadStoredStatementClosingMinor(runId);
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

type DeskStep = {
  id: RunStepId;
  actionable: number;
  informational: number;
  completedAt: string | null;
  completedBy: string | null;
  inputsHashAtComplete: string | null;
  hidden: boolean;
  gateStatus: string;
};

type DeskBuild = {
  payload: Record<string, unknown> & { steps: DeskStep[] };
  sources: DeskSource[];
  weekBlockerRows: BlockerRow[];
  inputsHash: string;
  evaluation: ReturnType<typeof evaluateRun>;
  liveCounts: Partial<Record<RunStepId, { actionable: number; informational: number }>>;
  sourceSnaps: ReconSourceSnapshot[];
};

type PendingCorrection = {
  statementId: string;
  kind: string;
  driverId: string | null;
  closeReason: string | null;
  raisedAt: string | null;
  raisedAutomatically: boolean;
};

/** WRA-30: correction drafts waiting to be signed on this week (e.g. late trips after close). */
async function loadPendingCorrections(orgId: string, weekKey: string): Promise<PendingCorrection[]> {
  const { data, error } = await getServiceClient().from("week_statements")
    .select("id, kind, driver_id, close_reason, created_at")
    .eq("organization_id", orgId).eq("week_key", weekKey).eq("status", "draft")
    .ilike("close_reason", "%restatement%");
  if (error) throw new Error(`correction drafts read failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; kind: string; driver_id: string | null; close_reason: string | null; created_at: string | null }>)
    .map((r) => ({
      statementId: String(r.id),
      kind: r.kind,
      driverId: r.driver_id,
      closeReason: r.close_reason,
      raisedAt: r.created_at,
      // Drafts from late data (late_trip_backfill_restatement) were raised by the system, not a person.
      raisedAutomatically: String(r.close_reason || "").startsWith("late_"),
    }));
}

/** Writes each automatic correction into the history once (prepared_by 'system'). */
async function logDataRestatements(run: WeekRunRow, corrections: PendingCorrection[]): Promise<void> {
  const automatic = corrections.filter((c) => c.raisedAutomatically);
  if (!automatic.length) return;
  const keys = automatic.map((c) => `data_restatement:${c.statementId}`);
  const { data: seen, error } = await reconDb().from("run_events")
    .select("idempotency_key").eq("run_id", run.id).in("idempotency_key", keys);
  if (error) throw new Error(`history read failed: ${error.message}`);
  const already = new Set((seen ?? []).map((r) => String((r as { idempotency_key: string }).idempotency_key)));
  for (const c of automatic) {
    const key = `data_restatement:${c.statementId}`;
    if (already.has(key)) continue;
    const { error: insErr } = await reconDb().from("run_events").insert({
      run_id: run.id,
      actor: "system",
      kind: "data_restatement",
      payload: { statementId: c.statementId, statementKind: c.kind, driverId: c.driverId, closeReason: c.closeReason },
      line: run.service_line,
      week_key: String(run.week_key).slice(0, 10),
      idempotency_key: key,
      prepared_by: "system",
      status: "applied",
      version_at_send: Number(run.version),
    });
    // A double write from a race hits the (run, idempotency_key) unique index: that is fine.
    if (insErr && !/duplicate key/i.test(insErr.message)) throw new Error(`correction history failed: ${insErr.message}`);
  }
}

/** Saved driver blockers for the week (each written by that driver's calculator unit). */
async function loadDriverBlockerRows(
  orgId: string,
  weekKey: string,
  line: ReconLine,
): Promise<StoredWeekBlocker[]> {
  const { data, error } = await reconDb()
    .from("week_blockers")
    .select("code, severity, driver_id, source_id, message, persisted, expected, delta")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", line)
    .not("driver_id", "is", null);
  if (error) throw new Error(`week blockers read failed: ${error.message}`);
  return (data ?? []) as StoredWeekBlocker[];
}

/**
 * Works out the whole desk for one week: sources, whole-week blockers, step counts,
 * hidden steps and the gate evaluation. Writes nothing; see publishDeskBuild.
 */
async function computeWeekDesk(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  run: WeekRunRow,
): Promise<DeskBuild> {
  const profileStarted = Date.now();
  const profile = await loadOrgReconProfile(orgId);
  logReconPhase("profile", profileStarted, { weekKey, line });

  const sourcesStarted = Date.now();
  const sources = await computeRunSources(orgId, line, weekKey, run, profile);
  logReconPhase("materialize_sources", sourcesStarted, { weekKey, line, sources: sources.length });

  const now = new Date().toISOString();
  const weekBlockers = await computeWeekLevelBlockers(orgId, weekKey, line, { withPnlTie: false });
  const weekBlockerRows = weekLevelBlockerRows(orgId, weekKey, line, weekBlockers, now);

  let blockers: StoredWeekBlocker[] | null;
  try {
    const driverRows = await loadDriverBlockerRows(orgId, weekKey, line);
    blockers = [
      ...driverRows,
      ...weekBlockerRows.map((row) => ({
        code: row.code,
        severity: row.severity,
        driver_id: null,
        source_id: row.source_id,
        message: row.message,
        persisted: row.persisted,
        expected: row.expected,
        delta: row.delta,
      })),
    ];
  } catch (e) {
    console.warn("[recon] stored blocker read failed", e);
    blockers = null;
  }

  const stepsStarted = Date.now();
  const { counts: liveCounts, closeCheck } = await computeLiveStepCounts(
    orgId,
    weekKey,
    line,
    sources,
    run.id,
    blockers,
  );
  logReconPhase("step_counts", stepsStarted, { weekKey, line });

  const stepRows = await loadRunSteps(run.id);
  const byStep = new Map(stepRows.map((r) => [r.step_id, r]));
  const sourceSnaps: ReconSourceSnapshot[] = sources.map((s) => ({
    id: s.id,
    status: s.status,
    inputHash: s.inputHash,
  }));
  const completedSteps = stepRows
    .filter((r) => r.completed_at)
    .map((r) => ({
      stepId: r.step_id as RunStepId,
      completedAt: r.completed_at,
      inputsHashAtComplete: r.inputs_hash_at_complete,
    }));

  // WRA-19: lane steps with nothing feeding them on this line are hidden.
  const blockerStepIds = [
    ...new Set(
      (blockers ?? [])
        .filter((b) => String(b.severity || "block") !== "warn")
        .map((b) => serverStepForBlockerCode(String(b.code || "")))
        .filter((s): s is RunStepId => s != null),
    ),
  ];
  const hiddenSteps = hiddenLaneSteps({
    applicableSourceIds: sources.filter((s) => s.requirement !== "not_applicable").map((s) => s.id),
    blockerStepIds,
  });
  const hiddenSet = new Set<RunStepId>(hiddenSteps);

  const evaluation = evaluateRun({ sources: sourceSnaps, stepCounts: liveCounts, completedSteps, hiddenSteps });

  const attributionStarted = Date.now();
  const attribution = await loadUnattributedForWeek(orgId, weekKey);
  logReconPhase("attribution", attributionStarted, { weekKey, line, rows: attribution.rowCount });

  const corrections = await loadPendingCorrections(orgId, weekKey);

  const steps: DeskStep[] = RECON_STEP_ORDER.map((stepId) => {
    const row = byStep.get(stepId);
    const live = liveCounts[stepId];
    const hidden = hiddenSet.has(stepId);
    return {
      id: stepId,
      actionable: hidden ? 0 : live?.actionable ?? row?.actionable ?? 0,
      informational: hidden ? 0 : live?.informational ?? row?.informational ?? 0,
      completedAt: row?.completed_at ?? null,
      completedBy: row?.completed_by ?? null,
      inputsHashAtComplete: row?.inputs_hash_at_complete ?? null,
      hidden,
      gateStatus: evaluation.steps.find((e) => e.id === stepId)?.status ?? "locked",
    };
  });

  const payload = {
    deskReady: true,
    run: deskRunFields(run),
    evaluation,
    attribution,
    closeCheck,
    corrections,
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
        lastRequestedAt: s.lastRequestedAt,
      };
    }),
    steps,
  };

  return {
    payload,
    sources,
    weekBlockerRows,
    inputsHash: deskInputsHash(sources),
    evaluation,
    liveCounts,
    sourceSnaps,
  };
}

/**
 * WRA-29: sources, steps, whole-week blockers, the desk picture and the version
 * are saved in ONE transaction (recon.publish_week_desk). Returns the new version.
 */
async function publishDeskBuild(run: WeekRunRow, build: DeskBuild): Promise<number> {
  const saveStarted = Date.now();
  const { data, error } = await reconDb().rpc("publish_week_desk", {
    p_run_id: run.id,
    p_inputs_hash: build.inputsHash,
    p_payload: build.payload,
    p_sources: build.sources.map((s) => ({
      source_id: s.id,
      requirement: s.requirement,
      status: s.status,
      coverage: s.coverage,
      input_hash: s.inputHash,
      row_count: s.rowCount,
      amount_minor: s.amountMinor,
    })),
    p_steps: build.payload.steps.map((s) => ({
      step_id: s.id,
      actionable: s.actionable,
      informational: s.informational,
      hidden: s.hidden,
    })),
    p_blockers: build.weekBlockerRows,
  });
  logReconPhase("desk_save", saveStarted, { weekKey: String(run.week_key).slice(0, 10), ok: !error });
  if (error) throw new Error(`desk publish failed: ${error.message}`);
  return Number(data ?? run.version + 1);
}

/**
 * Builds and publishes the desk for one week. Called by the calculator and right
 * after a user's own change. Returns null when the week has not been created yet.
 */
async function buildRunPayload(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  _actor?: string,
) {
  const run = await loadWeekRun(orgId, line, weekKey);
  if (!run) return null;
  const build = await computeWeekDesk(orgId, line, weekKey, run);
  const version = await publishDeskBuild(run, build);
  await logDataRestatements(run, build.payload.corrections as PendingCorrection[]);
  const calculator = await loadCalculatorStatus(orgId, new Date().toISOString());
  return {
    ...build.payload,
    run: deskRunFields({ ...run, version }),
    calculator,
  };
}

export async function publishWeekDesk(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  openedBy?: string,
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
    mainLine: run.main_line ?? null,
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

/** The saved desk with the run's current state and version (a read: nothing is recalculated). */
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

async function calculatorIsPaused(): Promise<boolean> {
  const { data, error } = await getServiceClient().rpc("recon_worker_status");
  // Fail closed. A status outage must not look like "still preparing" while the calculator is stopped.
  if (error || !data || typeof data !== "object") return true;
  return Boolean((data as { emergencyOff?: boolean }).emergencyOff);
}

type CalculatorStatus = {
  paused: boolean;
  pausedSince: string | null;
  pendingUnits: number;
  oldestPendingAgeSeconds: number | null;
  lastComputedAt: string | null;
};

/** WRA-16: on every payload, so the page can always say how fresh the numbers are. */
async function loadCalculatorStatus(orgId: string, lastComputedAt: string | null): Promise<CalculatorStatus> {
  try {
    const { data, error } = await reconDb()
      .from("health")
      .select("calculator_paused, calculator_paused_since, pending_units, oldest_pending_age_seconds")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!error && data) {
      const row = data as {
        calculator_paused?: boolean | null;
        calculator_paused_since?: string | null;
        pending_units?: number | null;
        oldest_pending_age_seconds?: number | null;
      };
      const paused = Boolean(row.calculator_paused);
      return {
        paused,
        pausedSince: paused ? row.calculator_paused_since ?? null : null,
        pendingUnits: Number(row.pending_units ?? 0),
        oldestPendingAgeSeconds: row.oldest_pending_age_seconds ?? null,
        lastComputedAt,
      };
    }
  } catch (e) {
    console.warn("[recon] health read failed", e instanceof Error ? e.message : e);
  }
  return {
    paused: await calculatorIsPaused(),
    pausedSince: null,
    pendingUnits: 0,
    oldestPendingAgeSeconds: null,
    lastComputedAt,
  };
}

function preparingPayload(run: WeekRunRow, calculatorPaused: boolean) {
  return {
    deskReady: false,
    calculatorPaused,
    run: deskRunFields(run),
    evaluation: {
      stage: "collecting",
      steps: [],
      nextAction: {
        kind: "wait",
        targetId: "sources",
        label: calculatorPaused ? "Week calculator is paused" : "Preparing this week",
      },
    },
    attribution: { rowCount: 0, amountMajor: 0, rows: [] },
    sources: [],
    steps: [],
  };
}

/** A week the calculator has not created yet looks like any other week being prepared. */
function notCreatedRun(orgId: string, line: ReconLine, weekKey: string): WeekRunRow {
  return {
    id: "",
    organization_id: orgId,
    service_line: line,
    week_key: weekKey,
    state: "preparing",
    version: 0,
    opened_by: null,
    opened_at: "",
    closed_at: null,
    closed_by: null,
    close_run_id: null,
    main_line: null,
  };
}


/** Waive a required source for the week. Shared by the direct Waive and an approved Waive request. */
async function applyWaive(
  orgId: string,
  line: ReconLine,
  weekKey: string,
  runId: string,
  sourceId: ReconSourceId,
  reason: string,
  actor: string,
): Promise<void> {
  const def = RECON_SOURCES.find((s) => s.id === sourceId);
  if (!def) throw new Error(`unknown source ${sourceId}`);
  const profile = await loadOrgReconProfile(orgId);
  const requirement = def.requiredWhen(profile, weekKey);
  const coverage = await fetchCoverageMap(orgId, line, sourceId, weekKey);
  const volume = await sourceVolumeMetrics(orgId, sourceId, weekKey);
  const { error } = await reconDb().from("run_sources").upsert({
    run_id: runId,
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
  if (error) throw new Error(`waive save failed: ${error.message}`);
}

/**
 * The saved desk as it is — a read. Used by GET /runs and by a repeated change
 * (same Idempotency-Key), which must not build or publish anything again.
 */
async function readStoredDesk(orgId: string, line: ReconLine, weekKey: string): Promise<Record<string, unknown>> {
  const run = await loadWeekRun(orgId, line, weekKey);
  if (run && isDeskSnapshot(run.desk_snapshot)) {
    const calculator = await loadCalculatorStatus(orgId, run.desk_computed_at ?? null);
    return { ...withLiveRun(run.desk_snapshot, run), calculator };
  }
  const calculator = await loadCalculatorStatus(orgId, null);
  return {
    ...preparingPayload(run ?? notCreatedRun(orgId, line, weekKey), calculator.paused),
    calculator,
  };
}

/** One response shape for every change: refused, repeated, or applied (desk rebuilt). */
async function weekChangeResponse<T>(
  c: Context,
  outcome: WeekChangeOutcome<T>,
  orgId: string,
  line: ReconLine,
  weekKey: string,
  actor: string,
  extra?: (result: T) => Record<string, unknown>,
): Promise<Response> {
  if (outcome.kind === "refused") return outcome.response;
  if (outcome.kind === "replay") {
    const stored = await readStoredDesk(orgId, line, weekKey);
    return c.json({ success: true, idempotent: true, correlationId: outcome.correlationId, ...stored });
  }
  const payload = await buildRunPayload(orgId, line, weekKey, actor);
  return c.json({
    success: true,
    correlationId: outcome.correlationId,
    ...(extra ? extra(outcome.result) : {}),
    ...(payload ?? {}),
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

        // WRA-06/12: the week list reads only what the calculator stored —
        // every week of the line, no coverage recalculation, no 12-week window.
        const profile = await loadOrgReconProfile(orgId);
        const rushDef = RECON_SOURCES.find((s) => s.id === "rush_deliveries");
        const deliveryActive = rushDef ? rushDef.requiredWhen(profile, mondayOfToday()) !== "not_applicable" : false;
        const calculator = await loadCalculatorStatus(orgId, null);

        // WRA-15: the Delivery desk is empty while Rush deliveries are not active.
        if (line === "rush_delivery" && !deliveryActive) {
          return c.json({
            success: true,
            weeks: [],
            line,
            year: year ?? null,
            deliveryActive,
            kpis: weekListKpis([]),
            nextCursor: null,
            calculator,
          });
        }

        let runQuery = reconDb()
          .from("week_runs")
          .select("id, week_key, state, closed_at, closed_by, next_action:desk_snapshot->evaluation->nextAction")
          .eq("organization_id", orgId)
          .eq("service_line", line);
        if (year != null) {
          runQuery = runQuery.gte("week_key", `${year}-01-01`).lte("week_key", `${year}-12-31`);
        }
        const { data: runRows, error: runErr } = await runQuery;
        if (runErr) throw new Error(`week runs read failed: ${runErr.message}`);

        // Statements are not due until the day after Sunday: the current week stays off the list.
        const runs = ((runRows ?? []) as Array<{
          id: string;
          week_key: string;
          state: string;
          closed_at: string | null;
          closed_by: string | null;
          next_action: { kind: string; targetId: string; label: string } | null;
        }>).filter((r) => isSettlementPeriodEnded({ periodAnchor: String(r.week_key).slice(0, 10) }));

        const sourcesByRun = new Map<string, StoredSource[]>();
        const runIds = runs.map((r) => r.id);
        for (let i = 0; i < runIds.length; i += 200) {
          const chunk = runIds.slice(i, i + 200);
          const { data: srcRows, error: srcErr } = await reconDb()
            .from("run_sources")
            .select("run_id, source_id, requirement, status, coverage")
            .in("run_id", chunk);
          if (srcErr) throw new Error(`run sources read failed: ${srcErr.message}`);
          for (const row of (srcRows ?? []) as Array<{
            run_id: string;
            source_id: string;
            requirement: string;
            status: string;
            coverage: Record<string, string> | null;
          }>) {
            const list = sourcesByRun.get(row.run_id) ?? [];
            list.push({
              id: row.source_id,
              requirement: row.requirement,
              status: row.status,
              coverage: row.coverage ?? {},
            });
            sourcesByRun.set(row.run_id, list);
          }
        }

        const labelFor = (id: string) => RECON_SOURCES.find((d) => d.id === id)?.label ?? id;
        const entries = sortWeekList(runs.map((r) =>
          weekListEntry(
            {
              weekKey: String(r.week_key).slice(0, 10),
              state: r.state,
              closedAt: r.closed_at,
              closedBy: r.closed_by,
              sources: sourcesByRun.get(r.id) ?? [],
              nextAction: r.next_action && typeof r.next_action === "object" ? r.next_action : null,
            },
            line,
            labelFor,
          )
        ));
        const kpis = weekListKpis(entries);

        const statusFilter = c.req.query("status");
        let filtered = entries;
        if (statusFilter === "outstanding") {
          filtered = entries.filter((w) => w.state !== "closed");
        } else if (statusFilter === "in_progress") {
          filtered = entries.filter((w) => w.state === "reconciling");
        } else if (statusFilter === "completed") {
          filtered = entries.filter((w) => w.state === "closed");
        }

        // Paging (26 per page) only when the caller asks for it; today's screen reads the whole list.
        const limitRaw = c.req.query("limit");
        const cursorRaw = c.req.query("cursor");
        let nextCursor: string | null = null;
        if (limitRaw != null || cursorRaw != null) {
          const limit = Math.min(Math.max(Number(limitRaw) || 26, 1), 200);
          const offset = Math.max(Number(cursorRaw) || 0, 0);
          const page = filtered.slice(offset, offset + limit);
          nextCursor = offset + limit < filtered.length ? String(offset + limit) : null;
          filtered = page;
        }

        return c.json({
          success: true,
          weeks: filtered,
          line,
          year: year ?? null,
          deliveryActive,
          kpis,
          nextCursor,
          calculator,
        });
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
        // WRA-08/13 + rule 4: reads are reads. Return the saved desk as it is;
        // never create the week, recalculate gates or queue work from here.
        const started = Date.now();
        const desk = await readStoredDesk(orgId, line, weekKey);
        logReconPhase("desk_read", started, { hit: desk.deskReady === true, weekKey, line });
        return c.json({ success: true, ...desk });
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind: "source_attest_none",
          step: "sources",
          reason,
          payload: { sourceId, days, reason },
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: async () => {
            const recon = reconDb();
            for (const day of days) {
              const { error } = await recon.from("source_attestations").upsert(
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
              if (error) throw new Error(`attestation save failed: ${error.message}`);
            }
          },
        });
        return weekChangeResponse(c, outcome, orgId, line, weekKey, actor);
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const def = RECON_SOURCES.find((s) => s.id === sourceId);
        if (!def) return c.json({ error: "INVALID_SOURCE", message: "Unknown source" }, 400);

        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind: "source_waived",
          step: "sources",
          reason,
          selfApproved: true,
          payload: { sourceId, reason },
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: () => applyWaive(orgId, line, weekKey, run.id, sourceId, reason, actor),
        });
        return weekChangeResponse(c, outcome, orgId, line, weekKey, actor);
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

        const run = await loadWeekRun(orgId, line, weekKey);
        const { openingMinor, priorWeekKey } = await loadPriorTagClosingMinor(orgId, weekKey);
        const { topUpsMinor, tagUsageMinor } = await sumTagLedgerWeekMinor(orgId, weekKey);
        const statementClosingMinor = run ? await loadStoredStatementClosingMinor(run.id) : null;
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
        // The event IS the change (e.g. the tag account statement closing): the claim writes it.
        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind,
          payload,
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: async () => undefined,
        });
        return weekChangeResponse(c, outcome, orgId, line, weekKey, actor);
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind: "attribution_manual",
          step: "attribution",
          payload: {
            rowCount: rows.length,
            rows: rows.map((r) => ({ id: String(r.id ?? ""), entity: r.entity ?? "toll", serviceLine: r.serviceLine ?? null })),
          },
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: async () => {
            const sb = getServiceClient();
            const now = new Date().toISOString();
            let updated = 0;
            const failed: string[] = [];
            for (const row of rows) {
              const id = String(row.id ?? "").trim();
              const entity = String(row.entity ?? "toll").toLowerCase();
              const targetLine = row.serviceLine === "rush_delivery" ? "rush_delivery" : "rideshare";
              if (!id) continue;
              const { error } = await sb
                .from(entity === "fuel" ? "fleet_fuel_entries" : "fleet_toll_ledger")
                .update({
                  service_line: targetLine,
                  service_line_source: "explicit",
                  service_line_set_at: now,
                })
                .eq("organization_id", orgId)
                .eq("id", id);
              if (error) failed.push(`${id}: ${error.message}`);
              else updated += 1;
            }
            // A partial save must not look like success: the claim's history row
            // then gets a 'change_failed' row listing what did not save.
            if (failed.length) throw new Error(`attribution save failed for ${failed.length} row(s): ${failed.slice(0, 3).join("; ")}`);
            return updated;
          },
        });
        return weekChangeResponse(c, outcome, orgId, line, weekKey, actor, (updated) => ({ updated }));
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);

        // Same desk the calculator builds; nothing is saved until the completion below.
        const desk = await computeWeekDesk(orgId, line, weekKey, run);
        const { liveCounts, sourceSnaps, evaluation } = desk;
        const stepEval = evaluation.steps.find((s) => s.id === stepId);
        if (stepEval?.hidden) {
          return c.json({ error: "STEP_HIDDEN", message: "This step does not apply to this line" }, 409);
        }
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

        // Checked before the claim, so a refused completion leaves the version alone.
        const currentHash = compositeInputsHashForStep(stepId, sourceSnaps);
        if (body.expectedInputsHash && body.expectedInputsHash !== currentHash) {
          return c.json({
            error: "INPUTS_STALE",
            message: "Source data changed since the client loaded this step",
            currentInputsHash: currentHash,
          }, 409);
        }

        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind: "step_complete",
          step: stepId,
          payload: { stepId, inputsHash: currentHash },
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: async () => {
            const { error } = await reconDb().from("run_steps").upsert({
              run_id: run.id,
              step_id: stepId,
              actionable: 0,
              informational: liveCounts[stepId]?.informational ?? 0,
              completed_at: new Date().toISOString(),
              completed_by: actor,
              inputs_hash_at_complete: currentHash,
            }, { onConflict: "run_id,step_id" });
            if (error) throw new Error(`step completion save failed: ${error.message}`);
          },
        });
        if (outcome.kind === "refused") return outcome.response;
        const published = outcome.kind === "applied" ? await buildRunPayload(orgId, line, weekKey, actor) : null;
        const version = Number((published as { run?: { version?: number } } | null)?.run?.version ?? outcome.version);
        return c.json({
          success: true,
          ok: true,
          version,
          correlationId: outcome.correlationId,
          ...(outcome.kind === "replay" ? { idempotent: true } : {}),
        });
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind: "external_source_requested",
          step: "sources",
          payload: { sourceId, note: note || null },
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: async () => {
            // WRA-18: one open request per source and week; Remind again moves its date.
            const recon = reconDb();
            const { data: existingReq, error: readErr } = await recon
              .from("external_source_requests")
              .select("id")
              .eq("organization_id", orgId)
              .eq("service_line", line)
              .eq("week_key", weekKey)
              .eq("source_id", sourceId)
              .eq("status", "open")
              .maybeSingle();
            if (readErr) throw new Error(`request read failed: ${readErr.message}`);
            if (existingReq?.id) {
              const { error } = await recon.from("external_source_requests").update({
                requested_at: new Date().toISOString(),
                requested_by: actor,
                note: note || null,
              }).eq("id", existingReq.id);
              if (error) throw new Error(`request update failed: ${error.message}`);
              return String(existingReq.id);
            }
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
            if (insErr || !inserted) throw new Error(`request save failed: ${insErr?.message ?? "no row"}`);
            return String(inserted.id);
          },
        });
        return weekChangeResponse(c, outcome, orgId, line, weekKey, actor, (requestId) => ({ requestId }));
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

  // ── Approvals (WRA-32, WRA-38) ─────────────────────────────────────────────
  // A request is a decision-log row (kind 'approval_request'); its status is its state.

  // ── Round 4c: steps 6–8 read saved rows only (WRA-07), plus History (WRA-30) ──

  /** Saved driver weeks: statement cash vs trip cash per driver (step 6). Read only. */
  app.get(
    `${BASE}/runs/:line/:weekKey/money`,
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
        // Driver weeks are Rideshare money; Delivery has none of its own here.
        if (line !== "rideshare") return c.json({ success: true, cashSourceMismatches: [], drivers: [] });
        const { data, error } = await getServiceClient()
          .from("driver_financial_periods")
          // driver_financial_periods has no name column; names come from the driver records.
          .select("driver_id, metadata")
          .eq("organization_id", orgId)
          .eq("period_anchor", weekKey);
        if (error) throw new Error(`driver weeks read failed: ${error.message}`);
        const rows = await withDriverNames(
          (data ?? []) as Array<{ driver_id: string; metadata: Record<string, unknown> | null }>,
        );
        const cashSourceMismatches = deskCashMismatches(rows, weekKey);
        const drivers = rows.map((r) => ({ driverId: String(r.driver_id), driverName: r.driver_name ?? null }));
        return c.json({ success: true, cashSourceMismatches, drivers });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-week-money");
      }
    },
  );

  /** WRA-21: Activity vs trips (step 6) from the week's Uber upload. Read only, never blocks. */
  app.get(
    `${BASE}/runs/:line/:weekKey/activity`,
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
        if (line !== "rideshare") return c.json({ success: true, activity: { status: "no_upload" } });
        const { data, error } = await getServiceClient()
          .from("fleet_import_batches")
          .select("created_at, payload_json")
          .eq("organization_id", orgId)
          .eq("source_id", "uber_bundle")
          .eq("status", "completed")
          .contains("week_keys", [weekKey])
          .order("created_at", { ascending: false })
          .limit(1);
        if (error) throw new Error(`uber upload read failed: ${error.message}`);
        return c.json({ success: true, activity: shapeWeekActivity((data ?? []) as Parameters<typeof shapeWeekActivity>[0]) });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-week-activity");
      }
    },
  );

  /** The week's decision log, oldest first (step 8 History). Read only. */
  app.get(
    `${BASE}/runs/:line/:weekKey/history`,
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
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return c.json({ success: true, items: [] });
        const { data, error } = await reconDb().from("run_events")
          .select("id, kind, step, actor, at, reason, payload, prepared_by, approved_by, self_approved, status")
          .eq("run_id", run.id)
          .order("at", { ascending: true })
          .limit(500);
        if (error) throw new Error(`history read failed: ${error.message}`);
        const rows = (data ?? []).filter((r) => !HISTORY_HIDDEN_KINDS.has(String(r.kind)));
        const names = await displayNamesFor(rows.flatMap((r) => [r.actor, r.prepared_by, r.approved_by]));
        const items = rows.map((r) => historyItem(r, names));
        return c.json({ success: true, items });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-week-history");
      }
    },
  );

  /** Step 6 "Seal earnings" / "Reseal": a change, never run on a read (WRA-07). */
  app.post(
    `${BASE}/runs/:line/:weekKey/seal-earnings`,
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
        const body = await c.req.json().catch(() => ({})) as { expectedVersion?: number };
        const actor = actorFromContext(c);
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const outcome = await withWeekChange(c, {
          runId: run.id,
          expectedVersion: body.expectedVersion,
          actor,
          kind: "seal_earnings",
          step: "trips_earnings",
          payload: { weekKey },
          idempotencyKey: idempotencyKeyFrom(c, body as { idempotencyKey?: unknown }),
          apply: async () => {
            await sealEarningsLaneForWeek({ orgId, week: weekKey, actorId: actor, force: true });
          },
        });
        return weekChangeResponse(c, outcome, orgId, line, weekKey, actor);
      } catch (e) {
        return safeErrorResponse(c, e, "recon-seal-earnings");
      }
    },
  );

  app.post(
    `${BASE}/approvals`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const body = await c.req.json().catch(() => ({})) as {
          line?: string;
          weekKey?: string;
          action?: string;
          params?: Record<string, unknown>;
          reason?: string;
          expectedVersion?: number;
          idempotencyKey?: string;
        };
        const line = parseLine(String(body.line || "rideshare"));
        const weekKey = String(body.weekKey || "").slice(0, 10);
        if (!line || !WEEK_RE.test(weekKey)) {
          return c.json({ error: "INVALID_REQUEST", message: "Invalid line or weekKey" }, 400);
        }
        if (!isApprovalAction(body.action)) {
          return c.json({ error: "INVALID_ACTION", message: "Unknown approval action" }, 400);
        }
        const run = await loadWeekRun(orgId, line, weekKey);
        if (!run) return weekNotReady(c);
        const expected = Number(body.expectedVersion);
        if (!Number.isFinite(expected)) {
          return c.json({ error: "VERSION_REQUIRED", message: "expectedVersion is required" }, 400);
        }
        if (expected !== Number(run.version)) {
          return c.json({ error: "WEEK_CHANGED", message: "This week changed while you were working. Reload the week.", currentVersion: run.version }, 409);
        }
        const actor = actorFromContext(c);
        const idempotencyKey = idempotencyKeyFrom(c, body);
        const correlationId = correlationIdFrom(c);

        // withPendingApproval: permission + repeat-safety + log row. The week itself does not change,
        // so no version bump and no calculator work.
        if (idempotencyKey) {
          const { data: prior } = await reconDb().from("run_events")
            .select("id, status").eq("run_id", run.id).eq("idempotency_key", idempotencyKey).maybeSingle();
          if (prior) return c.json({ success: true, idempotent: true, requestId: prior.id, status: prior.status });
        }
        const { data: inserted, error } = await reconDb().from("run_events").insert({
          run_id: run.id,
          actor,
          kind: "approval_request",
          payload: { action: body.action, params: body.params ?? {}, label: approvalActionLabel(body.action) },
          line,
          week_key: weekKey,
          reason: String(body.reason ?? "").trim() || null,
          correlation_id: correlationId,
          idempotency_key: idempotencyKey,
          prepared_by: actor,
          status: "pending_approval",
          version_at_send: Number(run.version),
        }).select("id, status").single();
        if (error || !inserted) throw new Error(`approval request save failed: ${error?.message ?? "no row"}`);
        return c.json({ success: true, requestId: inserted.id, status: inserted.status, correlationId });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-approval-send");
      }
    },
  );

  app.get(
    `${BASE}/approvals`,
    requireAuth({ strict: true }),
    requireAnyPermission("recon.view", "transactions.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        // Pending and out-of-date requests for the org (week cards + bell), newest first.
        const { data: runs, error: runErr } = await reconDb().from("week_runs")
          .select("id, week_key, service_line, version").eq("organization_id", orgId);
        if (runErr) throw new Error(runErr.message);
        const byId = new Map((runs ?? []).map((r) => [String(r.id), r]));
        const ids = [...byId.keys()];
        const items: unknown[] = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await reconDb().from("run_events")
            .select("id, run_id, payload, reason, prepared_by, status, version_at_send, at")
            .eq("kind", "approval_request")
            .in("status", ["pending_approval", "stale"])
            .in("run_id", ids.slice(i, i + 200));
          if (error) throw new Error(error.message);
          for (const row of data ?? []) {
            const run = byId.get(String(row.run_id));
            items.push({
              requestId: row.id,
              weekKey: String(run?.week_key ?? "").slice(0, 10),
              line: run?.service_line,
              action: (row.payload as { action?: string })?.action,
              label: (row.payload as { label?: string })?.label,
              params: (row.payload as { params?: unknown })?.params ?? {},
              reason: row.reason,
              preparedBy: row.prepared_by,
              sentAt: row.at,
              // A pending request whose week moved since Send is shown as out of date.
              status: row.status === "pending_approval" && Number(row.version_at_send) !== Number(run?.version)
                ? "stale"
                : row.status,
            });
          }
        }
        items.sort((a, b) => String((b as { sentAt: string }).sentAt).localeCompare(String((a as { sentAt: string }).sentAt)));
        // WRA-32: "Send for approval" is hidden when nobody else can approve.
        const me = actorFromContext(c);
        const otherApprovers = await loadOtherApproverCount(orgId, me).catch(() => 1);
        return c.json({ success: true, items, me, otherApprovers });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-approval-list");
      }
    },
  );

  /** Loads a request row of this org, or a 404. */
  async function loadApprovalRequest(orgId: string, id: string) {
    const { data, error } = await reconDb().from("run_events")
      .select("id, run_id, kind, payload, reason, prepared_by, status, version_at_send")
      .eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.kind !== "approval_request") return null;
    const { data: run, error: runErr } = await reconDb().from("week_runs")
      .select("*").eq("id", data.run_id).maybeSingle();
    if (runErr) throw new Error(runErr.message);
    if (!run || (run as WeekRunRow).organization_id !== orgId) return null;
    return { request: data, run: run as WeekRunRow };
  }

  /** Done-test 8e: the second approver is told who got there first ("Already approved by …"). */
  async function alreadyHandledMessage(requestId: number | string): Promise<string> {
    try {
      const { data } = await reconDb().from("run_events")
        .select("status, approved_by").eq("id", requestId).maybeSingle();
      const row = data as { status?: string; approved_by?: string | null } | null;
      if (row?.approved_by && (row.status === "approved" || row.status === "rejected")) {
        const names = await displayNamesFor([row.approved_by]);
        const who = names.get(row.approved_by) || "someone else";
        return row.status === "approved" ? `Already approved by ${who}.` : `Already rejected by ${who}.`;
      }
    } catch {
      /* fall back to the plain message */
    }
    return "This request was already handled.";
  }

  /** Moves a request's status (the append-only trigger allows only these moves) and logs the move. */
  async function moveApprovalRequest(
    request: { id: number | string; run_id: string; payload: unknown },
    from: string[],
    to: "approved" | "rejected" | "withdrawn" | "stale",
    actor: string,
    logKind: string,
    reason: string | null,
    correlationId: string,
  ): Promise<boolean> {
    const patch: Record<string, unknown> = { status: to };
    if (to === "approved" || to === "rejected") patch.approved_by = actor;
    const { data, error } = await reconDb().from("run_events")
      .update(patch).eq("id", request.id).in("status", from).select("id");
    if (error) throw new Error(`request update failed: ${error.message}`);
    if (!data || data.length === 0) return false; // someone else moved it first
    const { error: logErr } = await reconDb().from("run_events").insert({
      run_id: request.run_id,
      actor,
      kind: logKind,
      payload: { requestId: request.id, action: (request.payload as { action?: string })?.action ?? null },
      reason,
      correlation_id: correlationId,
      status: "applied",
    });
    if (logErr) console.warn("[recon] approval move log failed", logErr.message);
    return true;
  }

  app.post(
    `${BASE}/approvals/:id/withdraw`,
    requireAuth({ strict: true }),
    requirePermission("recon.prepare"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const loaded = await loadApprovalRequest(orgId, String(c.req.param("id")));
        if (!loaded) return c.json({ error: "NOT_FOUND" }, 404);
        const actor = actorFromContext(c);
        const check = canWithdraw({ actor, preparedBy: loaded.request.prepared_by, status: loaded.request.status });
        if (!check.ok) return c.json({ error: check.code }, check.code === "APPROVAL_GONE" ? 409 : 403);
        const moved = await moveApprovalRequest(
          loaded.request, ["pending_approval", "stale"], "withdrawn", actor, "approval_withdrawn", null, correlationIdFrom(c),
        );
        if (!moved) return c.json({ error: "APPROVAL_GONE", message: "This request was already handled." }, 409);
        return c.json({ success: true, status: "withdrawn" });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-approval-withdraw");
      }
    },
  );

  app.post(
    `${BASE}/approvals/:id/reject`,
    requireAuth({ strict: true }),
    requirePermission("recon.approve"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const body = await c.req.json().catch(() => ({})) as { reason?: string };
        const reasonError = rejectReasonError(body.reason);
        if (reasonError) return c.json({ error: "REASON_REQUIRED", message: reasonError }, 400);
        const loaded = await loadApprovalRequest(orgId, String(c.req.param("id")));
        if (!loaded) return c.json({ error: "NOT_FOUND" }, 404);
        if (loaded.request.status !== "pending_approval") {
          return c.json({ error: loaded.request.status === "stale" ? "APPROVAL_STALE" : "APPROVAL_GONE" }, 409);
        }
        const moved = await moveApprovalRequest(
          loaded.request, ["pending_approval"], "rejected", actorFromContext(c), "approval_rejected",
          String(body.reason).trim(), correlationIdFrom(c),
        );
        if (!moved) return c.json({ error: "APPROVAL_GONE", message: "This request was already handled." }, 409);
        return c.json({ success: true, status: "rejected" });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-approval-reject");
      }
    },
  );

  app.post(
    `${BASE}/approvals/:id/approve`,
    requireAuth({ strict: true }),
    requirePermission("recon.approve"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const loaded = await loadApprovalRequest(orgId, String(c.req.param("id")));
        if (!loaded) return c.json({ error: "NOT_FOUND" }, 404);
        const { request, run } = loaded;
        const actor = actorFromContext(c);
        const correlationId = correlationIdFrom(c);

        const decision = decideApprove({
          status: request.status,
          versionAtSend: request.version_at_send == null ? null : Number(request.version_at_send),
          currentVersion: Number(run.version),
        });
        if (!decision.go) {
          if (decision.markStale) {
            await moveApprovalRequest(request, ["pending_approval"], "stale", actor, "approval_stale", null, correlationId);
          }
          const message = decision.code === "WEEK_CHANGED"
            ? "This request is out of date: the week changed after it was sent. Ask the sender to prepare it again."
            : decision.code === "APPROVAL_STALE"
            ? "This request is out of date. Ask the sender to prepare it again."
            : await alreadyHandledMessage(request.id);
          return c.json({ error: decision.code, message }, 409);
        }

        // Claim it first, so two approvers pressing Approve at once cannot both run the action.
        const claimed = await moveApprovalRequest(
          request, ["pending_approval"], "approved", actor, "approval_approved", null, correlationId,
        );
        if (!claimed) {
          return c.json({ error: "APPROVAL_GONE", message: await alreadyHandledMessage(request.id) }, 409);
        }

        const action = (request.payload as { action?: string })?.action;
        const params = ((request.payload as { params?: Record<string, unknown> })?.params ?? {}) as Record<string, unknown>;
        const line = run.service_line === "rush_delivery" ? "rush_delivery" : "rideshare";
        const weekKey = String(run.week_key).slice(0, 10);
        const reason = String(request.reason ?? params.reason ?? "").trim();
        try {
          const result = await runApprovedAction(c, {
            action: String(action),
            params,
            orgId,
            line,
            weekKey,
            run,
            actor,
            reason,
            requestId: String(request.id),
          });
          return c.json({ success: true, status: "approved", correlationId, result });
        } catch (e) {
          // The request stays approved (the log cannot go back); the failure is recorded next to it.
          await reconDb().from("run_events").insert({
            run_id: request.run_id,
            actor,
            kind: "approval_failed",
            payload: { requestId: request.id, action, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) },
            correlation_id: correlationId,
            status: "applied",
          });
          throw e;
        }
      } catch (e) {
        return safeErrorResponse(c, e, "recon-approval-approve");
      }
    },
  );

  // ── Switch-over (§9): is the rebuilt Week Reconciliation on for this company? ──
  app.get(
    `${BASE}/switch`,
    requireAuth({ strict: true }),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ success: true, reconV2: false });
        return c.json({ success: true, reconV2: await isFeatureEnabled(FEATURE_FLAGS.RECON_V2, orgId) });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-switch");
      }
    },
  );

  // ── Alerts (WRA-31) ─────────────────────────────────────────────────────────
  app.get(
    `${BASE}/alerts`,
    requireAuth({ strict: true }),
    requireAnyPermission("recon.view", "transactions.view"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const { data, error } = await reconDb().from("alerts")
          .select("id, kind, title, detail, raised_at, acknowledged_at, acknowledged_by, sms_status")
          .eq("organization_id", orgId).is("resolved_at", null)
          .order("raised_at", { ascending: false });
        if (error) throw new Error(error.message);
        return c.json({ success: true, items: data ?? [] });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-alerts");
      }
    },
  );

  app.post(
    `${BASE}/alerts/:id/acknowledge`,
    requireAuth({ strict: true }),
    requirePermission("recon.approve"),
    async (c: Context) => {
      try {
        const orgId = getOrgId(c);
        if (!orgId) return c.json({ error: "ORG_REQUIRED" }, 400);
        const { data, error } = await reconDb().from("alerts")
          .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: actorFromContext(c) })
          .eq("id", String(c.req.param("id"))).eq("organization_id", orgId)
          .is("acknowledged_at", null).is("resolved_at", null)
          .select("id");
        if (error) throw new Error(error.message);
        if (!data?.length) return c.json({ error: "ALERT_GONE", message: "This alert was already acknowledged or resolved." }, 409);
        return c.json({ success: true });
      } catch (e) {
        return safeErrorResponse(c, e, "recon-alert-ack");
      }
    },
  );

  registerReconImportRoutes(app);
}

/** Runs an approved request with the same code as the direct button. */
async function runApprovedAction(
  c: Context,
  input: {
    action: string;
    params: Record<string, unknown>;
    orgId: string;
    line: ReconLine;
    weekKey: string;
    run: WeekRunRow;
    actor: string;
    reason: string;
    requestId: string;
  },
): Promise<unknown> {
  const { action, params, orgId, line, weekKey, run, actor, reason } = input;
  switch (action) {
    case "waive": {
      const sourceId = String(params.sourceId || "") as ReconSourceId;
      if (!RECON_SOURCES.some((s) => s.id === sourceId)) throw new Error("approved waive has no valid sourceId");
      const outcome = await withWeekChange(c, {
        runId: run.id,
        expectedVersion: Number(run.version),
        actor,
        kind: "source_waived",
        step: "sources",
        reason,
        payload: { sourceId, reason, approvalRequestId: input.requestId },
        apply: () => applyWaive(orgId, line, weekKey, run.id, sourceId, reason, actor),
      });
      if (outcome.kind === "refused") throw new Error("week changed before the approved waive could run");
      await buildRunPayload(orgId, line, weekKey, actor);
      return { applied: true };
    }
    case "accept_statement_cash":
      return await acknowledgeCashSourceMismatch(orgId, weekKey, String(params.driverId || ""), actor, reason);
    case "close":
    case "sign_restatement": {
      if (await calculatorIsPaused()) throw new Error("CALCULATOR_PAUSED: Close is off while the week calculator is paused");
      const workflow = await startWeekWorkflow({ orgId, weekKey, serviceLine: line, kind: "close", actorId: actor });
      return { workflowId: workflow.id, state: workflow.state };
    }
    case "reopen": {
      if (await isLegacyCleanupWeek(orgId, line, weekKey)) {
        throw new Error("LEGACY_CLOSED: this week was closed by the legacy clean-up and cannot be reopened");
      }
      if (!reason) throw new Error("REASON_REQUIRED: a reopen needs a reason");
      return await reopenWeek(orgId, weekKey, actor, reason, params.acknowledgeSettlementRisk === true, line);
    }
    default:
      throw new Error(`unknown approval action ${action}`);
  }
}
