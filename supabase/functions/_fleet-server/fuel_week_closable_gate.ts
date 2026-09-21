/**
 * Server fuel-week closable inputs — HTTP finalize + auto-close share one gate.
 */
import * as kv from "./kv_store.tsx";
import { listUnapprovedFuelTxInWindow } from "../../../packages/fuel-core/src/fuelReviewQueue.ts";
import { classifyFuelMiscResidual, residualFlagsFromSpendRows, residualSpendRowsFromSnapshots, isUnattributedBeyondGate } from "../../../packages/fuel-core/src/fuelFinalizeGate.ts";
import { coverageRuleIsResolved } from "../../../packages/fuel-core/src/fuelCoverageSplit.ts";
import { deriveWindowMoneyFromEntries } from "../../../packages/fuel-core/src/deriveWindowMoneyFromEntries.ts";
import type { EvaluateFuelWeekClosableInput } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";
import { evaluateStopToStopFromSnapshots } from "../../../packages/fuel-core/src/stopToStopConservation.ts";
import { applyStopToStopGapAccepts } from "../../../packages/fuel-core/src/applyStopToStopGapAccepts.ts";
import type { OdometerBucket } from "../../../packages/fuel-core/src/fuelTypes.ts";
import type { StopToStopGapAccept } from "../../../packages/fuel-core/src/applyStopToStopGapAccepts.ts";
import {
  filterFuelOpsLogEntries,
  fuelTankLiters,
} from "../../../packages/fuel-core/src/fuelOpsEligibility.ts";
import { isEntryInInclusiveYmdRange } from "../../../packages/fuel-core/src/fuelWeekRange.ts";
import { selectOdometerBucketsClosingInWeek } from "../../../packages/fuel-core/src/fuelWeekRange.ts";
import type { FuelEntry } from "../../../packages/fuel-core/src/fuelTypes.ts";
import { getServiceClient } from "./service_client.ts";

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

/** N-11/P-3: cache prefix scans per org-week (SQL date index follow-up). */
type WeekClosableKvBundle = {
  disputes: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
};

type CachedClosableBundle = {
  bundle: WeekClosableKvBundle;
  expiresAt: number;
};

/** N-12: TTL belt — immortal Map must not survive warm isolates across evaluations. */
export const CLOSABLE_KV_CACHE_TTL_MS = 60_000;

const closableKvCache = new Map<string, CachedClosableBundle>();

export function clearFuelWeekClosableKvCache(): void {
  closableKvCache.clear();
}

/** N-12a: drop one org-week key before a fresh evaluate (finalize / auto-close period). */
export function invalidateFuelWeekClosableKvCache(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): void {
  closableKvCache.delete(weekClosableCacheKey(orgId, weekStart, weekEnd));
}

/** Test helper — seed a stale empty bundle that would hide exceptions without invalidation. */
export function __seedClosableKvCacheForTest(
  orgId: string,
  weekStart: string,
  weekEnd: string,
  bundle: WeekClosableKvBundle,
  expiresAt = Date.now() + CLOSABLE_KV_CACHE_TTL_MS,
): void {
  closableKvCache.set(weekClosableCacheKey(orgId, weekStart, weekEnd), { bundle, expiresAt });
}

export function __closableKvCacheSizeForTest(): number {
  return closableKvCache.size;
}

function weekClosableCacheKey(orgId: string, weekStart: string, weekEnd: string): string {
  return `${orgId}|${weekStart}|${weekEnd}`;
}

function disputeOverlapsWeek(
  d: Record<string, unknown>,
  weekStart: string,
  weekEnd: string,
): boolean {
  const dStart = ymd(d.weekStart || d.week_start);
  const dEnd = ymd(d.weekEnd || d.week_end) || dStart;
  if (!dStart) return false;
  return !(dStart > weekEnd || dEnd < weekStart);
}

function rowOrgId(row: Record<string, unknown>): string {
  return String(row.organizationId || row.orgId || row.org_id || "");
}

function valuesFromKvRows(rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const v = (row as { value?: unknown }).value;
    if (v && typeof v === "object") out.push(v as Record<string, unknown>);
    else out.push(row as Record<string, unknown>);
  }
  return out;
}

/**
 * P-3: SQL pushdown via fromKvStore (like + org + date window) when PostgREST allows;
 * full-prefix scan + in-memory filter remains the fallback for disputes / failed pushdown.
 */
async function loadWeekClosableKvBundle(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeekClosableKvBundle> {
  const cacheKey = weekClosableCacheKey(orgId, weekStart, weekEnd);
  const hit = closableKvCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.bundle;
  if (hit) closableKvCache.delete(cacheKey);

  let disputes: Record<string, unknown>[] = [];
  let entries: Record<string, unknown>[] = [];
  let transactions: Record<string, unknown>[] = [];
  let pushdownComplete = false;

  try {
    const { fromKvStore } = await import("./fleet_sql_bridge.ts");
    const orgOr =
      `value->>organizationId.eq.${orgId},value->>orgId.eq.${orgId},value->>org_id.eq.${orgId}`;

    const { data: entryRows, error: entryErr } = await fromKvStore()
      .select("value")
      .like("key", "fuel_entry:%")
      .or(orgOr)
      .gte("value->>date", weekStart)
      .lte("value->>date", weekEnd);
    const { data: txRows, error: txErr } = await fromKvStore()
      .select("value")
      .like("key", "transaction:%")
      .or(orgOr)
      .gte("value->>date", weekStart)
      .lte("value->>date", weekEnd);
    const { data: disputeRows, error: disputeErr } = await fromKvStore()
      .select("value")
      .like("key", "fuel_dispute:%")
      .or(orgOr);

    if (entryErr || txErr || disputeErr) {
      throw new Error(
        [entryErr, txErr, disputeErr]
          .map((e) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e)))
          .filter(Boolean)
          .join("; "),
      );
    }

    entries = valuesFromKvRows(entryRows).filter((e) => {
      const rowOrg = rowOrgId(e);
      return !rowOrg || rowOrg === orgId;
    });
    transactions = valuesFromKvRows(txRows).filter((t) => {
      const rowOrg = rowOrgId(t);
      return !rowOrg || rowOrg === orgId;
    });
    disputes = valuesFromKvRows(disputeRows).filter((d) =>
      disputeOverlapsWeek(d, weekStart, weekEnd)
    );
    pushdownComplete = true;
  } catch (e) {
    console.warn("[fuel_week_closable_gate] fromKvStore pushdown failed — prefix fallback", e);
  }

  if (!pushdownComplete) {
    // P-3: org-scoped KV queries first (not full-table prefix) when date pushdown fails.
    try {
      const { fromKvStore } = await import("./fleet_sql_bridge.ts");
      const orgOr =
        `value->>organizationId.eq.${orgId},value->>orgId.eq.${orgId},value->>org_id.eq.${orgId}`;
      const [disputeRes, entryRes, txRes] = await Promise.all([
        fromKvStore().select("value").like("key", "fuel_dispute:%").or(orgOr),
        fromKvStore().select("value").like("key", "fuel_entry:%").or(orgOr),
        fromKvStore().select("value").like("key", "transaction:%").or(orgOr),
      ]);
      if (disputeRes.error || entryRes.error || txRes.error) {
        throw new Error("org-scoped fallback query error");
      }
      disputes = valuesFromKvRows(disputeRes.data).filter((d) =>
        disputeOverlapsWeek(d, weekStart, weekEnd)
      );
      entries = valuesFromKvRows(entryRes.data).filter((e) => {
        const day = ymd(e.date);
        return Boolean(day && day >= weekStart && day <= weekEnd);
      });
      transactions = valuesFromKvRows(txRes.data).filter((t) => {
        const day = ymd(t.date);
        return Boolean(day && day >= weekStart && day <= weekEnd);
      });
      pushdownComplete = true;
    } catch (e2) {
      console.warn("[fuel_week_closable_gate] org-scoped fallback failed — last-resort prefix", e2);
      const [disputeRaw, entryRaw, txRaw] = await Promise.all([
        kv.getByPrefix("fuel_dispute:"),
        kv.getByPrefix("fuel_entry:"),
        kv.getByPrefix("transaction:"),
      ]);

      disputes = ((disputeRaw || []) as Record<string, unknown>[]).filter((d) => {
        if (!d || typeof d !== "object") return false;
        const rowOrg = rowOrgId(d);
        if (rowOrg && rowOrg !== orgId) return false;
        return disputeOverlapsWeek(d, weekStart, weekEnd);
      });

      entries = ((entryRaw || []) as Record<string, unknown>[]).filter((e) => {
        if (!e || typeof e !== "object") return false;
        const rowOrg = rowOrgId(e);
        if (rowOrg && rowOrg !== orgId) return false;
        const day = ymd(e.date);
        return Boolean(day && day >= weekStart && day <= weekEnd);
      });

      transactions = ((txRaw || []) as Record<string, unknown>[]).filter((t) => {
        if (!t || typeof t !== "object") return false;
        const rowOrg = rowOrgId(t);
        return !rowOrg || rowOrg === orgId;
      });
    }
  }

  const bundle: WeekClosableKvBundle = { disputes, entries, transactions };
  closableKvCache.set(cacheKey, {
    bundle,
    expiresAt: Date.now() + CLOSABLE_KV_CACHE_TTL_MS,
  });
  return bundle;
}

/**
 * Legacy exception-only path when integrityStatus is NOT stamped.
 * Modern fills use integrityStatus + entryHasOpenCriticalFlag (honours dispositions).
 * Do not include integrity === "critical" here — that re-raises disposed integrity_critical.
 */
export function entryIsUnackedException(e: Record<string, unknown>): boolean {
  const meta = (e.metadata && typeof e.metadata === "object"
    ? e.metadata
    : {}) as Record<string, unknown>;
  const integrity = String(meta.integrityStatus || "").toLowerCase();
  // Stamped integrity is owned by entryHasOpenCriticalFlag + disposition codes.
  if (integrity) return false;

  const tier = String(e.reviewTier || meta.reviewTier || e.anomalyTier || "")
    .toLowerCase();
  const signalTier = String(meta.signalTier || e.signalTier || "").toLowerCase();
  const isCritical =
    tier === "exception" ||
    signalTier === "exception" ||
    Boolean(meta.isException);
  if (!isCritical) return false;
  const ack = meta.reconExceptionAck || e.reconExceptionAck;
  if (ack === true || ack === "true" || ack === 1 || ack === "1") return false;
  if (meta.exceptionResolvedAt) return false;
  return true;
}

/** Load disposed (entry_id, flag_code) pairs for org. */
export type DisposedFlagLoadResult = {
  pairs: Set<string>;
  /** True when service client/SQL failed — distinct from an empty disposition set. */
  loadFailed: boolean;
};

async function loadDisposedEntryFlagPairs(
  orgId: string,
  entryIds: string[],
): Promise<DisposedFlagLoadResult> {
  const out = new Set<string>();
  if (entryIds.length === 0) return { pairs: out, loadFailed: false };
  // Unit/CI has no service role — treat as load failure so callers can surface
  // disposition_load_failed rather than laundering into undisposed_flags.
  let sb;
  try {
    sb = getServiceClient();
  } catch (err) {
    console.warn(
      "[fuel_week_closable] disposition load skipped — no service client",
      err instanceof Error ? err.message : err,
    );
    return { pairs: out, loadFailed: true };
  }
  // Chunk to avoid URL limits
  const chunk = 200;
  let loadFailed = false;
  for (let i = 0; i < entryIds.length; i += chunk) {
    const slice = entryIds.slice(i, i + chunk);
    const { data, error } = await sb
      .from("fuel_flag_disposition")
      .select("entry_id, flag_code")
      .eq("org_id", orgId)
      .in("entry_id", slice);
    if (error) {
      console.warn("[fuel_week_closable] disposition load failed", error.message);
      loadFailed = true;
      continue;
    }
    for (const row of data || []) {
      out.add(`${row.entry_id}::${row.flag_code}`);
    }
  }
  return { pairs: out, loadFailed };
}

export function entryHasOpenCriticalFlag(
  e: Record<string, unknown>,
  disposed: Set<string>,
): boolean {
  const id = String(e.id || "").trim();
  if (!id) return false;
  const meta = (e.metadata && typeof e.metadata === "object"
    ? e.metadata
    : {}) as Record<string, unknown>;
  const signalTier = String(meta.signalTier || e.signalTier || "").toLowerCase();
  const integrity = String(meta.integrityStatus || "").toLowerCase();
  const codes: string[] = [];
  if (signalTier === "exception") codes.push("signal_exception");
  if (integrity === "critical") codes.push("integrity_critical");
  if (codes.length === 0) return false;
  // Legacy ack covers signal_exception only
  const legacyAck =
    meta.exceptionResolvedAt ||
    meta.reconExceptionAck === true ||
    meta.reconExceptionAck === "true" ||
    meta.reconExceptionAck === 1 ||
    meta.reconExceptionAck === "1";
  for (const code of codes) {
    if (disposed.has(`${id}::${code}`)) continue;
    if (code === "signal_exception" && legacyAck) continue;
    return true;
  }
  return false;
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
  const { disputes } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
  for (const d of disputes) {
    if (String(d.status || "") !== "Open") continue;
    return true;
  }
  return false;
}

/** Pure per-entry gate used by weekHasUnackedExceptionFills (testable without KV/SQL). */
export function entryBlocksFinalizeForFlags(
  e: Record<string, unknown>,
  disposed: Set<string>,
): boolean {
  if (entryHasOpenCriticalFlag(e, disposed)) return true;
  const id = String(e.id || "").trim();
  // Fallback for legacy exception-only path when integrity not stamped
  if (entryIsUnackedException(e) && !disposed.has(`${id}::signal_exception`)) {
    return true;
  }
  return false;
}

export async function weekHasUnackedExceptionFills(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<boolean> {
  const state = await weekFlagClosableState(orgId, weekStart, weekEnd);
  // Fail-closed for boolean callers: load failure still blocks finalize.
  return state.dispositionLoadFailed || state.hasUnacked;
}

/** Flag closable state — distinguishes infra load failure from open critical flags. */
export async function weekFlagClosableState(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ hasUnacked: boolean; dispositionLoadFailed: boolean }> {
  const { entries } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
  const ids = entries.map((e) => String(e.id || "")).filter(Boolean);
  const { pairs, loadFailed } = await loadDisposedEntryFlagPairs(orgId, ids);
  if (loadFailed) {
    return { hasUnacked: false, dispositionLoadFailed: true };
  }
  for (const e of entries) {
    if (entryBlocksFinalizeForFlags(e, pairs)) {
      return { hasUnacked: true, dispositionLoadFailed: false };
    }
  }
  return { hasUnacked: false, dispositionLoadFailed: false };
}

export async function buildFuelWeekClosableInputForPeriod(
  orgId: string,
  period: Record<string, unknown>,
  snapshots: unknown[],
): Promise<EvaluateFuelWeekClosableInput> {
  const weekStart = ymd(period.week_start);
  const weekEnd = ymd(period.week_end) || weekStart;
  // N-12a: never evaluate against a warm-isolate stale bundle.
  invalidateFuelWeekClosableKvCache(orgId, weekStart, weekEnd);

  const counts = (period.counts && typeof period.counts === "object" ? period.counts : {}) as Record<
    string,
    unknown
  >;
  const countsUnevaluated = Object.keys(counts).length === 0;

  const [hasOpenDisputes, flagState, unapprovedFuel] = await Promise.all([
    weekHasOpenFuelDisputes(orgId, weekStart, weekEnd),
    weekFlagClosableState(orgId, weekStart, weekEnd),
    (async () => {
      const { transactions } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
      return listUnapprovedFuelTxInWindow(transactions as any[], weekStart, weekEnd).length > 0;
    })(),
  ]);
  const hasUnackedExceptions = flagState.hasUnacked;
  const dispositionLoadFailed = flagState.dispositionLoadFailed;

  const signedUnexplained = Number(period.unexplained) || 0;
  const totalSpend = Number(period.total_spend) || 0;
  const residualKind = classifyFuelMiscResidual(totalSpend, signedUnexplained);
  const leakageReviewed = Boolean(period.leakage_reviewed_at);

  const snaps = (snapshots || []).filter(Boolean) as Record<string, unknown>[];
  // F-4: per-snapshot residual — opposite driver errors must not cancel in the aggregate.
  const snapResidual = residualFlagsFromSpendRows(residualSpendRowsFromSnapshots(snaps));
  const spendPositive = snaps.some(
    (s) => (Number(s.totalGasCardCost) || Number(s.totalSpend) || 0) > 0.009,
  );
  const missingCategoryCosts =
    spendPositive &&
    snaps.some((s) => !snapshotHasCategoryCosts(s));
  const unresolvedCoverageRule =
    snaps.length > 0 && snapshotsHaveUnresolvedCoverageRule(snaps);

  // F-5: client hydrate may stamp degraded_inputs; missing category costs also degrade auto-close.
  const meta =
    period.metadata && typeof period.metadata === "object"
      ? (period.metadata as Record<string, unknown>)
      : {};
  const degradedFromPeriod =
    period.degraded_inputs === true ||
    period.degradedInputs === true ||
    meta.degradedInputs === true ||
    meta.degraded_inputs === true;
  const degradedInputs = degradedFromPeriod || Boolean(missingCategoryCosts);

  // R-3: stop-to-stop conservation — week-closing buckets only (not ledger history).
  const { entries: weekEntries } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
  const opsLiters = filterFuelOpsLogEntries(weekEntries as unknown as FuelEntry[])
    .filter((e) => isEntryInInclusiveYmdRange(e.date, weekStart, weekEnd))
    .reduce((s, e) => s + fuelTankLiters(e), 0);
  const allSnapBuckets = snaps.flatMap((s) =>
    Array.isArray(s.odometerBuckets) ? (s.odometerBuckets as OdometerBucket[]) : [],
  );
  const weekBuckets = selectOdometerBucketsClosingInWeek(allSnapBuckets, weekStart, weekEnd);
  const s2s = evaluateStopToStopFromSnapshots({
    snapshots: [{ odometerBuckets: weekBuckets, totalGasCardCost: 1 }],
    weekOpsLiters: opsLiters,
  });
  // Only enforce stop-to-stop blockers when this week has closing windows.
  const hasFrozenBuckets = weekBuckets.length > 0;

  const gapAccepts = Array.isArray(period.stop_to_stop_gap_accepts)
    ? (period.stop_to_stop_gap_accepts as StopToStopGapAccept[])
    : [];
  const s2sApplied = hasFrozenBuckets
    ? applyStopToStopGapAccepts(
      {
        stopToStopVolumeFailed: s2s.stopToStopVolumeFailed,
        stopToStopDistanceFailed: s2s.stopToStopDistanceFailed,
        stopToStopAttributionFailed: s2s.stopToStopAttributionFailed,
        stopToStopChainFailed: s2s.stopToStopChainFailed,
        stopToStopTripsTruncated: s2s.stopToStopTripsTruncated,
      },
      weekBuckets,
      gapAccepts,
    )
    : s2s;

  // N-1 / N-2: thin odometer chain + unattributed fills (from stamps and/or entry derive).
  let stampedUnattributed = 0;
  let odometerChainUnusable = false;
  for (const s of snaps) {
    const spend = Number(s.totalGasCardCost) || Number(s.totalSpend) || 0;
    const smeta =
      s.metadata && typeof s.metadata === "object"
        ? (s.metadata as Record<string, unknown>)
        : {};
    stampedUnattributed += Number(smeta.unattributedFillCost) || Number(s.unattributedFillCost) || 0;
    const calc =
      smeta.rideShareCalc && typeof smeta.rideShareCalc === "object"
        ? (smeta.rideShareCalc as Record<string, unknown>)
        : {};
    const src = String(calc.efficiencySource || "");
    if (spend > 0.009 && src && src !== "odometer") odometerChainUnusable = true;
  }
  // R-3: price from entries — ignore client stamp.
  const derived = deriveWindowMoneyFromEntries(
    weekEntries as Parameters<typeof deriveWindowMoneyFromEntries>[0],
  );
  if (derived?.odometerChainUnusable && totalSpend > 0.009) {
    odometerChainUnusable = true;
  }
  const unattributedCost = Math.max(
    stampedUnattributed,
    Number(derived?.unattributedFillCost) || 0,
  );
  // R-1 / R-2: first-class period columns only (no leakage fallback for unattributed).
  const odometerChainReviewed = Boolean(period.odometer_chain_reviewed_at);
  const unattributedReviewed = Boolean(period.unattributed_reviewed_at);

  // DQ vehicle reviews — Amber/Red / odometerIncomplete vs period jsonb reviews.
  const reviews = Array.isArray(period.data_quality_vehicle_reviews)
    ? (period.data_quality_vehicle_reviews as Array<Record<string, unknown>>)
    : [];
  const reviewedIds = new Set(
    reviews.map((r) => String(r.vehicleId || r.vehicle_id || "").trim()).filter(Boolean),
  );
  let dataQualityVehiclesUnreviewed = false;
  for (const s of snaps) {
    const vid = String(s.vehicleId || "").trim();
    if (!vid) continue;
    const health = String(s.healthStatus || (s.metadata as any)?.healthStatus || "");
    const odoIncomplete = Boolean(
      s.odometerIncomplete || (s.metadata as any)?.odometerIncomplete,
    );
    const flagged = (health && health !== "Emerald") || odoIncomplete;
    if (flagged && !reviewedIds.has(vid)) {
      dataQualityVehiclesUnreviewed = true;
      break;
    }
  }

  return {
    countsUnevaluated,
    overExplained: snapResidual.anyOverExplained || residualKind === "over_explained",
    underExplainedUnreviewed:
      (snapResidual.anyUnderExplained || residualKind === "under_explained") && !leakageReviewed,
    hasUnacknowledgedExceptionFills: hasUnackedExceptions,
    undisposedCriticalFlags: hasUnackedExceptions,
    dispositionLoadFailed,
    dataQualityVehiclesUnreviewed,
    hasOpenDisputes,
    hasUnapprovedFuelTx: unapprovedFuel,
    missingCategoryCosts,
    unresolvedCoverageRule,
    degradedInputs,
    odometerChainUnusable: odometerChainUnusable && !odometerChainReviewed,
    unattributedUnreviewed:
      isUnattributedBeyondGate(totalSpend, unattributedCost) && !unattributedReviewed,
    ...(hasFrozenBuckets
      ? {
          stopToStopVolumeFailed: s2sApplied.stopToStopVolumeFailed,
          stopToStopDistanceFailed: s2sApplied.stopToStopDistanceFailed,
          stopToStopAttributionFailed: s2sApplied.stopToStopAttributionFailed,
          stopToStopChainFailed: s2sApplied.stopToStopChainFailed,
          stopToStopTripsTruncated: s2sApplied.stopToStopTripsTruncated,
        }
      : {}),
  };
}

/** C-3: persist real step counts so auto-close is not stuck on counts_unevaluated.
 * Clear steps use informational:0 — landing chips treat informational>0 + actionable=0
 * as "Not evaluated" (fabricated only when counts jsonb is empty on open weeks).
 */
export function buildServerFuelStepCounts(input: {
  exceptionFillCount: number;
  openDisputeCount: number;
  leakageActionable: boolean;
  unapprovedFuelTxCount?: number;
}): Record<string, { actionable: number; informational: number }> {
  const dq =
    (Number(input.exceptionFillCount) || 0) + (Number(input.unapprovedFuelTxCount) || 0);
  return {
    "data-quality": { actionable: dq, informational: 0 },
    "adjustments-disputes": {
      actionable: Number(input.openDisputeCount) || 0,
      informational: 0,
    },
    "policy-check": { actionable: 0, informational: 0 },
    "leakage-gap": {
      actionable: input.leakageActionable ? 1 : 0,
      informational: 0,
    },
    "settlement-preview": { actionable: 0, informational: 0 },
    finalize: { actionable: 0, informational: 0 },
  };
}

export async function countUnackedExceptionFills(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const { entries } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
  const ids = entries.map((e) => String(e.id || "")).filter(Boolean);
  const { pairs, loadFailed } = await loadDisposedEntryFlagPairs(orgId, ids);
  // Fail-closed count when dispositions cannot be loaded (same as empty set).
  const disposed = loadFailed ? new Set<string>() : pairs;
  let n = 0;
  for (const e of entries) {
    if (entryBlocksFinalizeForFlags(e, disposed)) n += 1;
  }
  return n;
}

export async function countOpenFuelDisputes(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const { disputes } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
  let n = 0;
  for (const d of disputes) {
    if (String(d.status || "") !== "Open") continue;
    n += 1;
  }
  return n;
}

export async function countUnapprovedFuelTxInWeek(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<number> {
  const { transactions } = await loadWeekClosableKvBundle(orgId, weekStart, weekEnd);
  return listUnapprovedFuelTxInWindow(transactions as any[], weekStart, weekEnd).length;
}

const FUEL_COUNT_EPS = 0.009;

/** H-5: server-authored step counts for /materialize and auto-close. */
export async function serverFuelStepCountsForPeriod(
  orgId: string,
  weekStart: string,
  weekEnd: string,
  period: { unexplained?: unknown; leakage_reviewed_at?: unknown },
): Promise<Record<string, { actionable: number; informational: number }>> {
  const [exN, dispN, unapprovedN] = await Promise.all([
    countUnackedExceptionFills(orgId, weekStart, weekEnd),
    countOpenFuelDisputes(orgId, weekStart, weekEnd),
    countUnapprovedFuelTxInWeek(orgId, weekStart, weekEnd),
  ]);
  const signedUnexplained = Number(period.unexplained) || 0;
  const leakageActionable =
    Math.abs(signedUnexplained) > FUEL_COUNT_EPS && !period.leakage_reviewed_at;
  return buildServerFuelStepCounts({
    exceptionFillCount: exN,
    openDisputeCount: dispN,
    leakageActionable,
    unapprovedFuelTxCount: unapprovedN,
  });
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
