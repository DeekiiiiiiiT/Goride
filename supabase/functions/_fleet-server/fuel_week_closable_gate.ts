/**
 * Server fuel-week closable inputs — HTTP finalize + auto-close share one gate.
 */
import * as kv from "./kv_store.tsx";
import { listUnapprovedFuelTxInWindow } from "../../../packages/fuel-core/src/fuelReviewQueue.ts";
import { classifyFuelMiscResidual } from "../../../packages/fuel-core/src/fuelFinalizeGate.ts";
import { coverageRuleIsResolved } from "../../../packages/fuel-core/src/fuelCoverageSplit.ts";
import type { EvaluateFuelWeekClosableInput } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

function snapFuelRule(snap: Record<string, unknown>): Record<string, unknown> | null {
  const meta = (snap.metadata && typeof snap.metadata === "object"
    ? snap.metadata
    : {}) as Record<string, unknown>;
  const rule = snap.fuelRule || meta.fuelRule;
  return rule && typeof rule === "object" ? (rule as Record<string, unknown>) : null;
}

export function snapshotHasCategoryCosts(snap: Record<string, unknown>): boolean {
  const meta = (snap.metadata && typeof snap.metadata === "object"
    ? snap.metadata
    : {}) as Record<string, unknown>;
  const cats = (snap.categoryCosts || meta.categoryCosts) as Record<string, unknown> | null;
  if (!cats || typeof cats !== "object") return false;
  return (
    "rideShareCost" in cats ||
    "companyUsageCost" in cats ||
    "deadheadCost" in cats ||
    "personalUsageCost" in cats
  );
}

export function snapshotsHaveUnresolvedCoverageRule(snapshots: unknown[]): boolean {
  for (const raw of snapshots) {
    if (!raw || typeof raw !== "object") continue;
    const snap = raw as Record<string, unknown>;
    if (!coverageRuleIsResolved(snapFuelRule(snap) as any)) return true;
  }
  return false;
}

export async function weekHasOpenFuelDisputes(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<boolean> {
  const rows = ((await kv.getByPrefix("fuel_dispute:")) || []) as any[];
  for (const d of rows) {
    if (!d || typeof d !== "object") continue;
    const rowOrg = String(d.organizationId || d.orgId || d.org_id || "");
    if (rowOrg && rowOrg !== orgId) continue;
    if (String(d.status || "") !== "Open") continue;
    const dStart = ymd(d.weekStart || d.week_start);
    const dEnd = ymd(d.weekEnd || d.week_end) || dStart;
    if (!dStart) continue;
    if (dStart > weekEnd || dEnd < weekStart) continue;
    return true;
  }
  return false;
}

export async function weekHasUnackedExceptionFills(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<boolean> {
  const rows = ((await kv.getByPrefix("fuel_entry:")) || []) as any[];
  for (const e of rows) {
    if (!e || typeof e !== "object") continue;
    const rowOrg = String(e.organizationId || e.orgId || e.org_id || "");
    if (rowOrg && rowOrg !== orgId) continue;
    const day = ymd(e.date);
    if (!day || day < weekStart || day > weekEnd) continue;
    const tier = String(e.reviewTier || e.metadata?.reviewTier || e.anomalyTier || "").toLowerCase();
    const signalTier = String(e.metadata?.signalTier || e.signalTier || "").toLowerCase();
    const isException =
      tier === "exception" ||
      signalTier === "exception" ||
      Boolean(e.metadata?.isException);
    if (!isException) continue;
    const ack = e.metadata?.reconExceptionAck || e.reconExceptionAck;
    if (ack && typeof ack === "object") continue;
    if (ack === true || ack === "true" || ack === 1 || ack === "1") continue;
    if (e.metadata?.exceptionResolvedAt) continue;
    return true;
  }
  return false;
}

export async function buildFuelWeekClosableInputForPeriod(
  orgId: string,
  period: Record<string, unknown>,
  snapshots: unknown[],
): Promise<EvaluateFuelWeekClosableInput> {
  const weekStart = ymd(period.week_start);
  const weekEnd = ymd(period.week_end) || weekStart;
  const counts = (period.counts && typeof period.counts === "object" ? period.counts : {}) as Record<
    string,
    unknown
  >;
  const countsUnevaluated = Object.keys(counts).length === 0;

  const [hasOpenDisputes, hasUnackedExceptions, unapprovedFuel] = await Promise.all([
    weekHasOpenFuelDisputes(orgId, weekStart, weekEnd),
    weekHasUnackedExceptionFills(orgId, weekStart, weekEnd),
    (async () => {
      const rows = await kv.getByPrefix(`transaction:`);
      const txs = (Array.isArray(rows) ? rows : []).filter((t: any) => {
        if (!t || typeof t !== "object") return false;
        const rowOrg = String(t.organizationId || t.orgId || "");
        return !rowOrg || rowOrg === orgId;
      });
      return listUnapprovedFuelTxInWindow(txs, weekStart, weekEnd).length > 0;
    })(),
  ]);

  const signedUnexplained = Number(period.unexplained) || 0;
  const totalSpend = Number(period.total_spend) || 0;
  const residualKind = classifyFuelMiscResidual(totalSpend, signedUnexplained);
  const leakageReviewed = Boolean(period.leakage_reviewed_at);

  const snaps = (snapshots || []).filter(Boolean) as Record<string, unknown>[];
  const spendPositive = snaps.some(
    (s) => (Number(s.totalGasCardCost) || Number(s.totalSpend) || 0) > 0.009,
  );
  const missingCategoryCosts =
    spendPositive &&
    snaps.some((s) => !snapshotHasCategoryCosts(s));
  const unresolvedCoverageRule =
    snaps.length > 0 && snapshotsHaveUnresolvedCoverageRule(snaps);

  return {
    countsUnevaluated,
    overExplained: residualKind === "over_explained",
    underExplainedUnreviewed: residualKind === "under_explained" && !leakageReviewed,
    hasUnacknowledgedExceptionFills: hasUnackedExceptions,
    hasOpenDisputes,
    hasUnapprovedFuelTx: unapprovedFuel,
    missingCategoryCosts,
    unresolvedCoverageRule,
    degradedInputs: false,
  };
}

/** C-3: persist real step counts so auto-close is not stuck on counts_unevaluated. */
export function buildServerFuelStepCounts(input: {
  exceptionFillCount: number;
  openDisputeCount: number;
  leakageActionable: boolean;
  unapprovedFuelTxCount?: number;
}): Record<string, { actionable: number; informational: number }> {
  const dq =
    (Number(input.exceptionFillCount) || 0) + (Number(input.unapprovedFuelTxCount) || 0);
  return {
    "data-quality": { actionable: dq, informational: dq > 0 ? 0 : 1 },
    "adjustments-disputes": {
      actionable: Number(input.openDisputeCount) || 0,
      informational: (Number(input.openDisputeCount) || 0) > 0 ? 0 : 1,
    },
    "policy-check": { actionable: 0, informational: 1 },
    "leakage-gap": {
      actionable: input.leakageActionable ? 1 : 0,
      informational: input.leakageActionable ? 0 : 1,
    },
    "settlement-preview": { actionable: 0, informational: 1 },
    finalize: { actionable: 0, informational: 1 },
  };
}

export async function countUnackedExceptionFills(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const rows = ((await kv.getByPrefix("fuel_entry:")) || []) as any[];
  let n = 0;
  for (const e of rows) {
    if (!e || typeof e !== "object") continue;
    const rowOrg = String(e.organizationId || e.orgId || e.org_id || "");
    if (rowOrg && rowOrg !== orgId) continue;
    const day = ymd(e.date);
    if (!day || day < weekStart || day > weekEnd) continue;
    const tier = String(e.reviewTier || e.metadata?.reviewTier || e.anomalyTier || "").toLowerCase();
    const signalTier = String(e.metadata?.signalTier || e.signalTier || "").toLowerCase();
    const isException =
      tier === "exception" ||
      signalTier === "exception" ||
      Boolean(e.metadata?.isException);
    if (!isException) continue;
    const ack = e.metadata?.reconExceptionAck || e.reconExceptionAck;
    if (ack && typeof ack === "object") continue;
    if (ack === true || ack === "true" || ack === 1 || ack === "1") continue;
    if (e.metadata?.exceptionResolvedAt) continue;
    n += 1;
  }
  return n;
}

export async function countOpenFuelDisputes(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const rows = ((await kv.getByPrefix("fuel_dispute:")) || []) as any[];
  let n = 0;
  for (const d of rows) {
    if (!d || typeof d !== "object") continue;
    const rowOrg = String(d.organizationId || d.orgId || d.org_id || "");
    if (rowOrg && rowOrg !== orgId) continue;
    if (String(d.status || "") !== "Open") continue;
    const dStart = ymd(d.weekStart || d.week_start);
    const dEnd = ymd(d.weekEnd || d.week_end) || dStart;
    if (!dStart) continue;
    if (dStart > weekEnd || dEnd < weekStart) continue;
    n += 1;
  }
  return n;
}

export function fuelClosableBlockerHttpCode(
  code: string,
): string {
  switch (code) {
    case "missing_category_costs":
      return "missing_category_costs";
    case "unresolved_coverage_rule":
      return "unresolved_coverage_rule";
    case "unapproved_fuel_tx":
      return "UNAPPROVED_FUEL_TX";
    default:
      return code;
  }
}
