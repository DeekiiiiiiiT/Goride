/**
 * P4: recon sources / steps / attribution evidence for Close Week preview.
 */
import { getServiceClient } from "./service_client.ts";
import {
  computeSourceStatusFromCoverage,
  resolveSourceRequirements,
  sourcesForLine,
  weekDayKeys,
  RECON_SOURCES,
  type OrgReconProfile,
  type ReconSourceId,
  type RunStepId,
} from "./recon_sources_mirror.ts";
import { buildReconSourceCloseBlockers } from "../../../packages/finance-core/src/closeSourceBlockers.ts";
import type { CloseBlocker } from "../../../packages/finance-core/src/closeInvariants.ts";
import {
  evaluateRun,
  RECON_STEP_LABELS,
  type ReconSourceSnapshot,
  type StepCounts,
} from "../../../packages/finance-core/src/evaluateRun.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { coverageWideWarning } from "../../../packages/finance-core/src/statementCoverage.ts";
import {
  coverageInputHash,
  isReconHumanSourceStatus,
} from "../../../packages/finance-core/src/coverageInputHash.ts";
import { sourceVolumeMetrics } from "./recon_volume.ts";

export type WeekCloseServiceLine = "rideshare" | "rush_delivery";

export type WeekCloseReconSourceEvidence = {
  id: string;
  label: string;
  status: string;
  requirement: string;
  attestedBy?: string | null;
  attestReason?: string | null;
  waived?: boolean;
};

export type WeekCloseReconEvidence = {
  serviceLine: WeekCloseServiceLine;
  sources: WeekCloseReconSourceEvidence[];
  staleSteps: Array<{ stepId: RunStepId; label: string }>;
  unattributed: { rowCount: number; amountMajor: number };
  runState?: string | null;
};

function sb() {
  return getServiceClient();
}

export function normalizeWeekCloseServiceLine(raw?: string | null): WeekCloseServiceLine {
  return raw === "rush_delivery" ? "rush_delivery" : "rideshare";
}

export function isReconSourceEnforceMode(): boolean {
  const v = String(Deno.env.get("SOURCE_ENFORCE") || "").trim().toLowerCase();
  return v === "enforce" || v === "true" || v === "1";
}

async function loadOrgReconProfile(orgId: string): Promise<OrgReconProfile> {
  const { data: orgRow } = await sb()
    .from("organizations")
    .select("service_lines, enabled_modules")
    .eq("id", orgId)
    .maybeSingle();

  const serviceLinesRaw = (orgRow?.service_lines as string[] | null) ?? ["rideshare"];
  const serviceLines = serviceLinesRaw.filter(
    (l): l is "rideshare" | "rush_delivery" | "org" =>
      l === "rideshare" || l === "rush_delivery" || l === "org",
  );
  if (serviceLines.length === 0) serviceLines.push("rideshare");

  const { count: uberTripCount } = await sb()
    .from("fleet_trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .ilike("platform", "%uber%");

  const { count: uberBatchCount } = await sb()
    .from("fleet_import_batches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("type", "merged_import");

  const { count: indriveCount } = await sb()
    .from("fleet_trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .ilike("platform", "%indrive%");

  const { count: tagCount } = await sb()
    .from("fleet_toll_tags")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const { count: fuelCardCount } = await sb()
    .from("fleet_fuel_cards")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  const modules = (orgRow?.enabled_modules as Record<string, boolean> | null) ?? {};
  const rushDeliveryEnabled = Boolean(modules.rush_delivery ?? modules.rush);

  return {
    serviceLines,
    hasUberDrivers: (uberTripCount ?? 0) > 0 || (uberBatchCount ?? 0) > 0,
    hasIndriveDrivers: (indriveCount ?? 0) > 0,
    hasTollTags: (tagCount ?? 0) > 0,
    hasRoamFuelCards: (fuelCardCount ?? 0) > 0,
    hasSelfServeJaa: false,
    rushDeliveryEnabled,
  };
}

async function fetchCoverageMap(
  orgId: string,
  line: WeekCloseServiceLine,
  sourceId: ReconSourceId,
  weekKey: string,
): Promise<Record<string, string>> {
  const { data, error } = await sb().rpc("compute_source_coverage", {
    p_org: orgId,
    p_line: line,
    p_source_id: sourceId,
    p_week_key: weekKey,
  });
  if (error) {
    console.warn("[week_close_recon] coverage rpc failed", sourceId, error.message);
    const days = weekDayKeys(weekKey);
    return Object.fromEntries(days.map((d) => [d, "missing"]));
  }
  return (data as Record<string, string>) ?? {};
}

function missingDaysFromCoverage(coverage: Record<string, string>): string[] {
  return Object.entries(coverage)
    .filter(([, v]) => v === "missing" || !v || v === "spill")
    .map(([d]) => d);
}

async function countUnattributedForWeek(
  orgId: string,
  weekKey: string,
): Promise<{ rowCount: number; amountMajor: number }> {
  const end = periodEndForAnchor(weekKey);
  let rowCount = 0;
  let amountMajor = 0;

  const { data: tollRows, error: tollErr } = await sb()
    .from("fleet_toll_ledger")
    .select("amount")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .is("service_line", null)
    .eq("service_line_source", "unattributed");
  if (!tollErr && tollRows) {
    rowCount += tollRows.length;
    for (const r of tollRows) {
      amountMajor += Math.abs(Number((r as { amount?: number }).amount) || 0);
    }
  }

  const { data: fuelRows, error: fuelErr } = await sb()
    .from("fleet_fuel_entries")
    .select("amount")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", end)
    .is("service_line", null)
    .eq("service_line_source", "unattributed");
  if (!fuelErr && fuelRows) {
    rowCount += fuelRows.length;
    for (const r of fuelRows) {
      amountMajor += Math.abs(Number((r as { amount?: number }).amount) || 0);
    }
  }

  return { rowCount, amountMajor: Math.round(amountMajor * 100) / 100 };
}

export async function loadWeekCloseReconContext(
  orgId: string,
  weekKey: string,
  serviceLine: WeekCloseServiceLine,
): Promise<{ evidence: WeekCloseReconEvidence; sourceBlockers: CloseBlocker[] }> {
  const week = String(weekKey).slice(0, 10);
  const profile = await loadOrgReconProfile(orgId);
  const requirements = resolveSourceRequirements(profile, week);
  const reqById = Object.fromEntries(requirements.map((r) => [r.sourceId, r.requirement]));
  const defs = sourcesForLine(serviceLine);

  const { data: runRow } = await sb()
    .schema("recon")
    .from("week_runs")
    .select("id, state")
    .eq("organization_id", orgId)
    .eq("service_line", serviceLine)
    .eq("week_key", week)
    .maybeSingle();

  let runSourcesById = new Map<
    string,
    {
      status: string;
      requirement: string;
      coverage: Record<string, string>;
      attested_by?: string | null;
      attest_reason?: string | null;
    }
  >();
  let runSteps: Array<{
    step_id: string;
    actionable: number;
    informational: number;
    completed_at?: string | null;
    inputs_hash_at_complete?: string | null;
  }> = [];

  if (runRow?.id) {
    const { data: srcRows } = await sb()
      .schema("recon")
      .from("run_sources")
      .select("source_id, status, requirement, coverage, attested_by, attest_reason")
      .eq("run_id", runRow.id);
    for (const row of srcRows ?? []) {
      runSourcesById.set(String(row.source_id), {
        status: String(row.status),
        requirement: String(row.requirement),
        coverage: (row.coverage as Record<string, string>) ?? {},
        attested_by: row.attested_by as string | null,
        attest_reason: row.attest_reason as string | null,
      });
    }
    const { data: stepRows } = await sb()
      .schema("recon")
      .from("run_steps")
      .select("step_id, actionable, informational, completed_at, inputs_hash_at_complete")
      .eq("run_id", runRow.id);
    runSteps = (stepRows ?? []) as typeof runSteps;
  }

  const sourceSnaps: ReconSourceSnapshot[] = [];
  const evidenceSources: WeekCloseReconSourceEvidence[] = [];
  const coverageBySource = new Map<string, Record<string, string>>();

  // R2-13: always live coverage (never prefer persisted run_sources.coverage).
  // R2-14: inputHash must match recon_routes.materializeRunSources / coverageInputHash.
  for (const def of defs) {
    const requirement = reqById[def.id] ?? def.requiredWhen(profile, week);
    const persisted = runSourcesById.get(def.id);
    const coverage = await fetchCoverageMap(orgId, serviceLine, def.id, week);
    coverageBySource.set(def.id, coverage);
    // R3-05: live coverage status; keep only human decisions (waived / attested_none).
    const liveStatus = computeSourceStatusFromCoverage(coverage, requirement, {
      waitingExternal: def.id === "fuel_card_roam" &&
        requirement === "required" &&
        Object.values(coverage).every((v) => v === "missing"),
    });
    const persistedStatus = persisted?.status as ReconSourceSnapshot["status"] | undefined;
    const status = isReconHumanSourceStatus(persistedStatus)
      ? (persistedStatus as ReconSourceSnapshot["status"])
      : liveStatus;

    // R4-05: live volume (same as wizard materialize) so late rows flip STEP_STALE.
    const volume = await sourceVolumeMetrics(orgId, def.id, week);
    sourceSnaps.push({ id: def.id, status, inputHash: coverageInputHash(coverage, volume) });
    evidenceSources.push({
      id: def.id,
      label: def.label,
      status,
      requirement,
      attestedBy: persisted?.attested_by ?? null,
      attestReason: persisted?.attest_reason ?? null,
      waived: status === "waived",
    });
  }

  const stepCounts: Partial<Record<RunStepId, StepCounts>> = {};
  const completedSteps = runSteps
    .filter((s) => s.completed_at)
    .map((s) => ({
      stepId: s.step_id as RunStepId,
      completedAt: s.completed_at,
      inputsHashAtComplete: s.inputs_hash_at_complete,
    }));
  for (const s of runSteps) {
    stepCounts[s.step_id as RunStepId] = {
      actionable: Number(s.actionable) || 0,
      informational: Number(s.informational) || 0,
    };
  }

  const evaluated = evaluateRun({
    sources: sourceSnaps,
    stepCounts,
    completedSteps,
  });
  const staleSteps = evaluated.steps
    .filter((s) => s.status === "stale")
    .map((s) => ({ stepId: s.id, label: RECON_STEP_LABELS[s.id] ?? s.id }));

  const unattributed = await countUnattributedForWeek(orgId, week);
  const enforce = isReconSourceEnforceMode();

  const sourceBlockers = buildReconSourceCloseBlockers({
    week,
    enforce,
    sources: evidenceSources.map((s) => ({
      sourceId: s.id,
      label: s.label,
      status: s.status as ReconSourceSnapshot["status"],
      requirement: s.requirement as "required" | "optional" | "not_applicable",
      missingDays: missingDaysFromCoverage(coverageBySource.get(s.id) ?? {}),
      attestedBy: s.attestedBy,
      attestReason: s.attestReason,
    })),
    staleSteps: staleSteps.map((s) => ({ stepId: s.stepId })),
    unattributed: unattributed.rowCount > 0 ? unattributed : null,
  });

  const periodEnd = periodEndForAnchor(week);
  const { data: wideBatches } = await sb()
    .from("fleet_import_batches")
    .select("source_id, type, coverage_start, coverage_end, data_start, data_end")
    .eq("organization_id", orgId)
    .in("status", ["completed", "committed"])
    .lte("coverage_start", periodEnd)
    .gte("coverage_end", week)
    .limit(40);
  const seenWide = new Set<string>();
  for (const batch of wideBatches ?? []) {
    const row = batch as {
      source_id?: string | null;
      type?: string | null;
      coverage_start?: string | null;
      coverage_end?: string | null;
      data_start?: string | null;
      data_end?: string | null;
    };
    const sourceId = String(row.source_id || row.type || "");
    const label = RECON_SOURCES.find((s) => s.id === sourceId)?.label || "This file";
    const message = coverageWideWarning({
      coverageStart: row.coverage_start,
      coverageEnd: row.coverage_end,
      dataStart: row.data_start,
      dataEnd: row.data_end,
      sourceLabel: label,
    });
    if (!message || seenWide.has(message)) continue;
    seenWide.add(message);
    sourceBlockers.push({
      code: "COVERAGE_WIDER_THAN_DATA",
      severity: "warn",
      week,
      persisted: 0,
      expected: 0,
      delta: 0,
      message,
    });
  }

  return {
    evidence: {
      serviceLine,
      sources: evidenceSources,
      staleSteps,
      unattributed,
      runState: runRow?.state ? String(runRow.state) : null,
    },
    sourceBlockers,
  };
}

/** Reopen: mark recon.week_runs state when present. */
export async function reopenReconWeekRun(
  orgId: string,
  weekKey: string,
  serviceLine: WeekCloseServiceLine,
): Promise<boolean> {
  const week = String(weekKey).slice(0, 10);
  const { data, error } = await sb()
    .schema("recon")
    .from("week_runs")
    .update({ state: "reopened" })
    .eq("organization_id", orgId)
    .eq("service_line", serviceLine)
    .eq("week_key", week)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[week_close_recon] reopen run failed", error.message);
    return false;
  }
  return Boolean(data?.id);
}

/** After a successful freeze, the wizard run is closed. Reopen is the only way back. */
export async function markReconWeekRunClosed(
  orgId: string,
  weekKey: string,
  serviceLine: WeekCloseServiceLine,
  actorId: string,
): Promise<void> {
  const week = String(weekKey).slice(0, 10);
  const sb = getServiceClient();
  const { data: closeRun } = await sb
    .from("week_close_runs")
    .select("id")
    .eq("organization_id", orgId)
    .eq("week_key", week)
    .eq("service_line", serviceLine)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    state: "closed",
    closed_at: now,
    closed_by: actorId,
  };
  const closeRunId = (closeRun as { id?: string } | null)?.id;
  if (closeRunId) patch.close_run_id = closeRunId;

  const recon = sb.schema("recon");
  const { data: existing, error: readErr } = await recon
    .from("week_runs")
    .select("id")
    .eq("organization_id", orgId)
    .eq("service_line", serviceLine)
    .eq("week_key", week)
    .maybeSingle();
  if (readErr) {
    console.warn("[week_close_recon] read run before close failed", readErr.message);
    return;
  }
  if (existing?.id) {
    const { error } = await recon.from("week_runs").update(patch).eq("id", existing.id);
    if (error) console.warn("[week_close_recon] mark closed failed", error.message);
    return;
  }
  const { error } = await recon.from("week_runs").insert({
    organization_id: orgId,
    service_line: serviceLine,
    week_key: week,
    state: "closed",
    opened_by: actorId,
    closed_at: now,
    closed_by: actorId,
    ...(closeRunId ? { close_run_id: closeRunId } : {}),
  });
  if (error) console.warn("[week_close_recon] insert closed run failed", error.message);
}
