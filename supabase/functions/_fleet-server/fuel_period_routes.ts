/**
 * Server-owned Consumption Reconciliation periods — SQL read model + finalize jobs.
 * Finalize job persists finalized_report snapshots + ledger (cursor-resumable).
 */
import type { Context } from "npm:hono@4.3.11";
import type { Hono } from "npm:hono@4.3.11";
import { requirePermission } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";
import { postFuelFinalizedEventsFromReport, reverseFuelFinancialEventsForWeek } from "./fuel_financial_reset.ts";
import {
  reverseEnterpriseFuelSyncForSnapshot,
  settleEnterpriseFuelFromSnapshot,
} from "./fuel_enterprise_settlement.ts";
import { buildFuelPeriodSnapshots } from "./fuel_period_build_snapshots.ts";
import {
  fuelAutoCloseApproverId,
  fuelAutoCloseFinalizerId,
  loadOrgPreferences,
  resolveAutoCloseDualApprovalMode,
  resolveDualApprovalUiMode,
  secondApproverThresholdFromPrefs,
} from "./fuel_org_preferences.ts";
import { sealFuelWeek } from "./fuel_week_seal.ts";
import { buildFuelSealAmountsByDriver } from "./fuel_close_amounts.ts";
import { assertPeriodEndedForReconciliation } from "./settlement_period_freeze.ts";
import { SettlementCommandError } from "./settlement_commands.ts";
import { isSettlementPeriodEnded } from "../../../packages/finance-core/src/settlementPeriodGate.ts";
import { listUnapprovedFuelTxInWindow } from "../../../packages/fuel-core/src/fuelReviewQueue.ts";
import { evaluateFuelWeekClosable } from "../../../packages/fuel-core/src/evaluateFuelWeekClosable.ts";
import { validateDisposition } from "../../../packages/fuel-core/src/fuelResidualDisposition.ts";
import {
  upsertStopToStopGapAccepts,
  revokeStopToStopGapAccept,
  validateStopToStopGapAcceptRequest,
} from "../../../packages/fuel-core/src/applyStopToStopGapAccepts.ts";
import {
  buildFuelWeekClosableInputForPeriod,
  fuelClosableBlockerHttpCode,
  snapshotsHaveUnresolvedCoverageRule,
  buildServerFuelStepCounts,
  countUnackedExceptionFills,
  countOpenFuelDisputes,
  serverFuelStepCountsForPeriod,
} from "./fuel_week_closable_gate.ts";

import { FUEL_HTTP_PREFIX } from "./fuel_http_prefix.ts";

const BASE = FUEL_HTTP_PREFIX;
const CRON_SECRET = () => Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "";

async function assertNoUnapprovedFuelTxInWindow(
  orgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ error: string; code: string; blockers: unknown[] } | null> {
  const start = String(weekStart || "").slice(0, 10);
  const end = String(weekEnd || "").slice(0, 10);
  if (!start || !end) return null;
  const rows = await kv.getByPrefix(`transaction:`);
  const txs = (Array.isArray(rows) ? rows : []).filter((t: any) => {
    if (!t || typeof t !== "object") return false;
    const rowOrg = String(t.organizationId || t.orgId || "");
    return !rowOrg || rowOrg === orgId;
  });
  const blockers = listUnapprovedFuelTxInWindow(txs, start, end);
  if (!blockers.length) return null;
  return {
    code: "UNAPPROVED_FUEL_TX",
    error: `${blockers.length} Pending fuel receipt(s) must be approved or rejected before finalize`,
    blockers,
  };
}

function periodNotEndedResponse(e: unknown) {
  if (e instanceof SettlementCommandError && e.code === "PERIOD_NOT_ENDED") {
    return { error: e.code, message: e.message, details: e.details };
  }
  return null;
}

function actorId(c: Context): string | null {
  try {
    const rbac = c.get("rbacUser") as { userId?: string; id?: string } | undefined;
    if (rbac?.userId) return rbac.userId;
    if (rbac?.id) return rbac.id;
    const u = c.get("user") as { id?: string } | undefined;
    if (u?.id) return u.id;
  } catch {
    /* ignore */
  }
  return null;
}

/** N-9b: reject missing :id before loadPeriod. */
function periodIdParam(c: Context): string | null {
  const raw = c.req.param("id");
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id || null;
}

function finalizedReportKey(weekKey: string, driverId: string): string {
  return `finalized_report:${weekKey}:${driverId}`;
}

/** H-5: when finalized_report snaps exist, materialize money from KV not client body. */
type MaterializeSnapMoneyOk = {
  ok: true;
  snapCount: number;
  totalSpend: number;
  gasCardSpend: number;
  driverSpend: number;
  companyShare: number;
  driverShare: number;
  unexplained: number;
};
type MaterializeSnapMoneyMiss = { ok: false; snapCount: number };

async function aggregateMaterializeMoneyFromSnaps(
  orgId: string,
  weekKey: string,
): Promise<MaterializeSnapMoneyOk | MaterializeSnapMoneyMiss> {
  const prefix = `finalized_report:${weekKey}:`;
  const rows = await kv.getByPrefix(prefix);
  let snapCount = 0;
  let totalSpend = 0;
  let gasCardSpend = 0;
  let driverSpend = 0;
  let companyShare = 0;
  let driverShare = 0;
  let unexplained = 0;
  for (const snap of rows || []) {
    if (!snap || typeof snap !== "object") continue;
    const s = snap as Record<string, unknown>;
    const snapOrg = String(s.orgId || s.org_id || s.organizationId || "");
    if (snapOrg && snapOrg !== orgId) continue;
    snapCount += 1;
    const total = Number(s.totalGasCardCost) || 0;
    const gas = Number(s.gasCardSpend);
    const cash = Number(s.driverSpend);
    totalSpend += total > 0 ? total : (Number.isFinite(gas) ? gas : 0) + (Number.isFinite(cash) ? cash : 0);
    // F-10: preserve cash split — never force all money onto gas card.
    if (Number.isFinite(gas) || Number.isFinite(cash)) {
      gasCardSpend += Number.isFinite(gas) ? gas : 0;
      driverSpend += Number.isFinite(cash) ? cash : 0;
    } else {
      gasCardSpend += total;
    }
    companyShare += Number(s.companyShare) || 0;
    driverShare += Number(s.driverShare) || 0;
    unexplained += Number(s.miscellaneousCost) || 0;
  }
  // N-14: literal ok discriminates the union for snapMoney.ok ? snapMoney.totalSpend reads.
  if (snapCount <= 0) return { ok: false, snapCount: 0 };
  return {
    ok: true,
    snapCount,
    totalSpend,
    gasCardSpend,
    driverSpend,
    companyShare,
    driverShare,
    unexplained,
  };
}

function mapPeriod(row: Record<string, unknown>) {
  return {
    id: row.id,
    orgId: row.org_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    status: row.status,
    currentStep: row.current_step,
    version: Number(row.version) || 1,
    vehicleCount: Number(row.vehicle_count) || 0,
    driverCount: Number(row.driver_count) || 0,
    totalSpend: Number(row.total_spend) || 0,
    gasCardSpend: Number(row.gas_card_spend) || 0,
    cashFromEarnings: Number(row.cash_from_earnings) || 0,
    companyShare: Number(row.company_share) || 0,
    driverShare: Number(row.driver_share) || 0,
    unexplained: Number(row.unexplained) || 0,
    counts: row.counts || {},
    leakageReviewedAt: row.leakage_reviewed_at,
    leakageReviewedBy: row.leakage_reviewed_by,
    leakageReviewedNote: row.leakage_review_note,
    odometerChainReviewedAt: row.odometer_chain_reviewed_at,
    odometerChainReviewedBy: row.odometer_chain_reviewed_by,
    odometerChainReviewedNote: row.odometer_chain_review_note,
    unattributedReviewedAt: row.unattributed_reviewed_at,
    unattributedReviewedBy: row.unattributed_reviewed_by,
    unattributedReviewedNote: row.unattributed_review_note,
    dataQualityVehicleReviews: Array.isArray(row.data_quality_vehicle_reviews)
      ? row.data_quality_vehicle_reviews
      : [],
    stopToStopGapAccepts: Array.isArray(row.stop_to_stop_gap_accepts)
      ? row.stop_to_stop_gap_accepts
      : [],
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    reopenedAt: row.reopened_at,
    reopenReason: row.reopen_reason,
    computedAt: row.computed_at,
    computedFromHash: row.computed_from_hash,
    fuelSealError: row.fuel_seal_error ? String(row.fuel_seal_error) : null,
  };
}

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

/** Expenses Fuel Status reads driver_financial_periods — refresh after recon lock/reopen. */
async function rebuildExpensesForFuelWeek(weekStart: string, driverIds: Iterable<string>) {
  const anchor = ymd(weekStart);
  if (!anchor) return;
  const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
  for (const driverId of new Set([...driverIds].map(String).filter(Boolean))) {
    try {
      await rebuildPeriodsForAnchors(driverId, [anchor], true);
    } catch (e) {
      console.warn("[fuel_period] expenses rebuild failed", driverId, anchor, e);
    }
  }
}

function periodIdFor(orgId: string, weekStart: string): string {
  return `${orgId}:${weekStart}`;
}

async function loadPeriod(orgId: string, periodId: string) {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("fuel_reconciliation_period")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", periodId)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function insertAudit(
  orgId: string,
  periodId: string,
  action: string,
  payload: Record<string, unknown>,
  actor: string | null,
) {
  const sb = getServiceClient();
  await sb.from("fuel_period_audit").insert({
    period_id: periodId,
    org_id: orgId,
    actor_id: actor || "00000000-0000-0000-0000-000000000000",
    action,
    payload,
  });
}

function aggregateFinalizedForWeek(snaps: any[]) {
  let totalSpend = 0;
  let gasCardSpend = 0;
  let cashFromEarnings = 0;
  let companyShare = 0;
  let driverShare = 0;
  let unexplained = 0;
  const vehicles = new Set<string>();
  const drivers = new Set<string>();
  for (const s of snaps) {
    const spend = Number(s.totalGasCardCost) || 0;
    totalSpend += spend;
    const gas = Number(s.gasCardSpend);
    const cash = Number(s.driverSpend);
    if (Number.isFinite(gas) && gas >= 0) gasCardSpend += gas;
    else gasCardSpend += spend;
    if (Number.isFinite(cash) && cash >= 0) cashFromEarnings += cash;
    companyShare += Number(s.companyShare) || 0;
    driverShare += Number(s.driverShare) || 0;
    unexplained += Number(s.miscellaneousCost) || 0;
    if (s.vehicleId) vehicles.add(String(s.vehicleId));
    if (s.driverId) drivers.add(String(s.driverId));
  }
  if (cashFromEarnings === 0 && gasCardSpend === 0 && totalSpend > 0) {
    gasCardSpend = totalSpend;
  }
  return {
    total_spend: totalSpend,
    gas_card_spend: gasCardSpend,
    cash_from_earnings: cashFromEarnings,
    company_share: companyShare,
    driver_share: driverShare,
    unexplained,
    vehicle_count: vehicles.size,
    driver_count: drivers.size,
  };
}

/** Persist staged driver-week snapshot only — no wallet / ledger money until week lock. */
async function stageFinalizedSnapshot(
  report: Record<string, any>,
  orgId: string,
  actor: string | null,
): Promise<void> {
  const weekKey = ymd(report.weekStart);
  const driverId = String(report.driverId || "");
  if (!weekKey || !driverId) throw new Error("snapshot missing weekStart/driverId");
  const key = finalizedReportKey(weekKey, driverId);
  const stamped = {
    ...report,
    orgId,
    org_id: orgId,
    status: report.status || "Finalized",
    stagedAt: new Date().toISOString(),
    moneyCommitted: false,
    finalizedAt: report.finalizedAt || new Date().toISOString(),
    finalizedByUserId: actor,
  };
  await kv.set(key, stamped);
}

/** Commit wallet + ledger for staged snaps, then used at lock. */
async function commitFinalizedSnapshotMoney(
  report: Record<string, any>,
  orgId: string,
): Promise<void> {
  await reverseEnterpriseFuelSyncForSnapshot(report);
  await settleEnterpriseFuelFromSnapshot(report, orgId);
  await postFuelFinalizedEventsFromReport({
    ...report,
    orgId,
    org_id: orgId,
    moneyCommitted: true,
  });
  const weekKey = ymd(report.weekStart);
  const driverId = String(report.driverId || "");
  if (weekKey && driverId) {
    const key = finalizedReportKey(weekKey, driverId);
    await kv.set(key, {
      ...report,
      orgId,
      org_id: orgId,
      moneyCommitted: true,
      moneyCommittedAt: new Date().toISOString(),
    });
  }
}

/** @deprecated name — stages only; money commits on lock. */
async function persistFinalizedSnapshot(
  report: Record<string, any>,
  orgId: string,
  actor: string | null,
): Promise<void> {
  await stageFinalizedSnapshot(report, orgId, actor);
}

async function processJobRow(job: Record<string, unknown>) {
  const sb = getServiceClient();
  const orgId = String(job.org_id);
  const periodId = String(job.period_id);
  const kind = String(job.kind);
  const actor = job.created_by ? String(job.created_by) : null;

  await sb
    .from("fuel_period_job")
    .update({ state: "running", updated_at: new Date().toISOString() })
    .eq("id", job.id);

  const period = await loadPeriod(orgId, periodId);
  if (!period) {
    await sb
      .from("fuel_period_job")
      .update({
        state: "failed",
        failures: [{ error: "period_not_found" }],
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return { ok: false, error: "period_not_found" };
  }

  const now = new Date().toISOString();
  const nextVersion = (Number(period.version) || 1) + 1;
  const cursor = (job.cursor && typeof job.cursor === "object" ? job.cursor : {}) as Record<
    string,
    unknown
  >;

  if (kind === "finalize") {
    // Idempotent resume: period already locked (e.g. worker died mid post-lock rebuild).
    if (period.status === "locked" || period.locked_at) {
      await sb
        .from("fuel_period_job")
        .update({
          state: "succeeded",
          progress_done: 1,
          progress_total: 1,
          updated_at: now,
        })
        .eq("id", job.id);
      return { ok: true, version: Number(period.version) || nextVersion, alreadyLocked: true };
    }

    const threshold = Number(cursor.secondApproverThreshold) || 0;
    const totalSpend = Number(cursor.totalSpend) || Number(period.total_spend) || 0;
    if (threshold > 0 && totalSpend > threshold) {
      const periodVersion = Number(period.version) || 1;
      const { data: approvals } = await sb
        .from("fuel_period_audit")
        .select("actor_id,action,payload,at")
        .eq("period_id", periodId)
        .eq("org_id", orgId)
        .eq("action", "second_approve")
        .order("at", { ascending: false })
        .limit(20);
      // H-6: approval must match current period version (stamped on insert).
      const other = (approvals || []).find((a: any) => {
        if (!a.actor_id || !actor || String(a.actor_id) === String(actor)) return false;
        const pv = Number(a.payload?.periodVersion);
        if (Number.isFinite(pv)) return pv === periodVersion;
        // Legacy rows without periodVersion: only accept if they post-date a reopen/lock bump
        // is unknowable — fail closed for spend above threshold when version missing.
        return false;
      });
      if (!other) {
        await sb
          .from("fuel_period_job")
          .update({
            state: "failed",
            failures: [{ error: "second_approver_required" }],
            updated_at: now,
          })
          .eq("id", job.id);
        return { ok: false, error: "second_approver_required" };
      }
    }

    // Hard refuse before any snapshot/money/lock — covers HTTP finalize TOCTOU + auto-close jobs.
    const unapprovedFuel = await assertNoUnapprovedFuelTxInWindow(
      orgId,
      ymd(period.week_start),
      ymd(period.week_end),
    );
    if (unapprovedFuel) {
      await sb
        .from("fuel_period_job")
        .update({
          state: "failed",
          failures: [
            {
              error: unapprovedFuel.code,
              message: unapprovedFuel.error,
              blockers: unapprovedFuel.blockers,
            },
          ],
          updated_at: now,
        })
        .eq("id", job.id);
      return { ok: false, error: unapprovedFuel.code };
    }

    const snapshots = Array.isArray(cursor.snapshots) ? (cursor.snapshots as any[]) : [];
    const completed: string[] = Array.isArray(cursor.completedDriverIds)
      ? (cursor.completedDriverIds as string[])
      : [];
    // Rebuild failures each run so a resumed retry of a previously-failed driver can clear.
    const failures: Array<{ driverId: string; error: string }> = [];
    const done = new Set(completed);

    if (snapshots.length > 0 && snapshotsHaveUnresolvedCoverageRule(snapshots)) {
      await sb
        .from("fuel_period_job")
        .update({
          state: "failed",
          failures: [{ error: "unresolved_coverage_rule" }],
          updated_at: now,
        })
        .eq("id", job.id);
      return { ok: false, error: "unresolved_coverage_rule" };
    }

    for (const snap of snapshots) {
      const driverId = String(snap.driverId || "");
      if (!driverId || done.has(driverId)) continue;
      try {
        await persistFinalizedSnapshot(snap, orgId, actor);
        done.add(driverId);
        await sb
          .from("fuel_period_job")
          .update({
            cursor: {
              ...cursor,
              completedDriverIds: [...done],
              failures,
              snapshots,
            },
            progress_done: done.size,
            progress_total: snapshots.length,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } catch (e: any) {
        failures.push({ driverId, error: e?.message || String(e) });
        await sb
          .from("fuel_period_job")
          .update({
            cursor: { ...cursor, completedDriverIds: [...done], failures, snapshots },
            failures,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }

    // NEW-7: any driver failure → hold at ready (never silent lock). Resume via cursor.
    if (failures.length > 0) {
      const moneyPartial = aggregateFinalizedForWeek(
        snapshots.filter((s: any) => done.has(String(s.driverId || ""))),
      );
      await sb
        .from("fuel_reconciliation_period")
        .update({
          status: "ready",
          locked_at: null,
          locked_by: null,
          updated_at: now,
          ...(done.size ? moneyPartial : {}),
          computed_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId);
      await insertAudit(
        orgId,
        periodId,
        "finalize_partial",
        {
          driversDone: [...done],
          failures,
          gapAccepted: Boolean(period.leakage_reviewed_at),
        },
        actor,
      );
      await sb
        .from("fuel_period_job")
        .update({
          state: "failed",
          failures,
          cursor: { ...cursor, completedDriverIds: [...done], failures, snapshots },
          progress_done: done.size,
          progress_total: snapshots.length,
          updated_at: now,
        })
        .eq("id", job.id);
      return {
        ok: false,
        error: done.size === 0 ? "all_drivers_failed" : "partial_finalize_failure",
        failures,
        driversDone: [...done],
      };
    }

    const money = aggregateFinalizedForWeek(snapshots.length ? snapshots : []);
    // Commit wallet + ledger only after every driver staged successfully.
    // C-8: track commits; on failure reverse already-committed drivers in this run.
    const moneyCommittedDriverIds: string[] = [];
    for (const snap of snapshots) {
      const did = String(snap?.driverId || "");
      try {
        await commitFinalizedSnapshotMoney(snap, orgId);
        if (did) moneyCommittedDriverIds.push(did);
      } catch (e: any) {
        console.error("[fuel_period] money commit failed", snap?.driverId, e);
        for (const committedId of moneyCommittedDriverIds) {
          const committedSnap =
            snapshots.find((s: any) => String(s?.driverId || "") === committedId) || null;
          try {
            if (committedSnap) await reverseEnterpriseFuelSyncForSnapshot(committedSnap);
            await reverseFuelFinancialEventsForWeek(
              committedId,
              ymd(period.week_start),
              "finalize_money_partial",
            );
          } catch (revErr) {
            console.error(
              "[fuel_period] compensating reverse failed",
              committedId,
              revErr,
            );
          }
        }
        const moneyFailures = [
          {
            driverId: did,
            error: e?.message || String(e),
            phase: "money_commit",
            compensatedDrivers: [...moneyCommittedDriverIds],
          },
        ];
        await sb
          .from("fuel_reconciliation_period")
          .update({
            status: "ready",
            locked_at: null,
            locked_by: null,
            updated_at: now,
            computed_at: now,
          })
          .eq("id", periodId)
          .eq("org_id", orgId);
        await insertAudit(
          orgId,
          periodId,
          "finalize_money_partial",
          {
            failures: moneyFailures,
            compensatedDrivers: moneyCommittedDriverIds,
          },
          actor,
        );
        await sb
          .from("fuel_period_job")
          .update({
            state: "failed",
            failures: moneyFailures,
            updated_at: now,
          })
          .eq("id", job.id);
        return { ok: false, error: "money_commit_failure", failures: moneyFailures };
      }
    }
    await sb
      .from("fuel_reconciliation_period")
      .update({
        status: "locked",
        locked_at: now,
        locked_by: actor,
        version: nextVersion,
        updated_at: now,
        ...(snapshots.length ? money : {}),
        computed_at: now,
      })
      .eq("id", periodId)
      .eq("org_id", orgId);

    const weekKey = ymd(period.week_start);
    const amountsByDriver = buildFuelSealAmountsByDriver(snapshots);
    let fuelSealPublished: number | null = null;
    let fuelSealError: string | null = null;
    try {
      const sealed = await sealFuelWeek({
        organizationId: orgId,
        weekKey,
        actorId: actor ?? undefined,
        force: true,
        amountsByDriver,
      });
      fuelSealPublished = sealed.published;
      // N-7: clear prior seal error on success.
      await sb
        .from("fuel_reconciliation_period")
        .update({ fuel_seal_error: null, updated_at: now })
        .eq("id", periodId)
        .eq("org_id", orgId);
    } catch (sealErr: any) {
      // Money already committed — keep lock; surface seal failure without touching provenance hash.
      fuelSealError = sealErr?.message || String(sealErr);
      console.warn("[fuel_period] post-lock sealFuelWeek failed (non-fatal)", weekKey, sealErr);
      await insertAudit(
        orgId,
        periodId,
        "fuel_seal_failed",
        { weekKey, error: fuelSealError },
        actor,
      );
      await sb
        .from("fuel_reconciliation_period")
        .update({ fuel_seal_error: fuelSealError, updated_at: now })
        .eq("id", periodId)
        .eq("org_id", orgId);
    }

    await insertAudit(
      orgId,
      periodId,
      "finalize",
      {
        version: nextVersion,
        driversDone: [...done],
        failures,
        gapAccepted: Boolean(period.leakage_reviewed_at),
        moneyCommittedOnLock: true,
        fuelSealPublished,
        fuelSealError,
      },
      actor,
    );
    // Mark succeeded before heavy Expenses rebuild — lock is already durable.
    // WORKER_RESOURCE_LIMIT during rebuild must not leave the job "running".
    await sb
      .from("fuel_period_job")
      .update({
        state: "succeeded",
        progress_done: snapshots.length || 1,
        progress_total: snapshots.length || 1,
        updated_at: now,
      })
      .eq("id", job.id);
    try {
      await rebuildExpensesForFuelWeek(ymd(period.week_start), [
        ...done,
        ...snapshots.map((s: any) => String(s?.driverId || "")),
      ]);
    } catch (rebuildErr) {
      console.error("[fuel_period] post-lock expenses rebuild failed (non-fatal)", rebuildErr);
    }
    return {
      ok: true,
      version: nextVersion,
      ...(fuelSealError ? { fuelSealError } : {}),
      ...(fuelSealPublished != null ? { fuelSealPublished } : {}),
    };
  } else if (kind === "reopen") {
    const reason = String(cursor.reason || "");
    const weekStart = ymd(period.week_start);
    const snaps = ((await kv.getByPrefix(`finalized_report:${weekStart}:`)) || []) as any[];
    const reopenDriverIds: string[] = [];
    for (const snap of snaps) {
      if (snap?.orgId && snap.orgId !== orgId && snap.org_id && snap.org_id !== orgId) continue;
      const did = String(snap?.driverId || "");
      if (did) reopenDriverIds.push(did);
      // H-13: only delete KV after confirmed reversal — keep evidence on failure.
      try {
        await reverseEnterpriseFuelSyncForSnapshot(snap);
        await reverseFuelFinancialEventsForWeek(
          String(snap.driverId),
          weekStart,
          "fuel_period_reopen",
        );
      } catch (e: any) {
        console.warn("[fuel_period] reopen reverse failed", snap?.driverId, e);
        await insertAudit(
          orgId,
          periodId,
          "reopen_reverse_failed",
          { driverId: did, error: e?.message || String(e) },
          actor,
        );
        await sb
          .from("fuel_period_job")
          .update({
            state: "failed",
            failures: [{ driverId: did, error: e?.message || String(e), phase: "reopen_reverse" }],
            updated_at: now,
          })
          .eq("id", job.id);
        return { ok: false, error: "reopen_reverse_failure", driverId: did };
      }
      try {
        await kv.del(finalizedReportKey(weekStart, String(snap.driverId)));
      } catch {
        /* ignore */
      }
    }
    await sb
      .from("fuel_reconciliation_period")
      .update({
        status: "reopened",
        reopened_at: now,
        reopened_by: actor,
        reopen_reason: reason,
        locked_at: null,
        locked_by: null,
        // Same unlock contract as finalized-reports/reset-period — clear review so landing is Outstanding.
        leakage_reviewed_at: null,
        leakage_reviewed_by: null,
        leakage_review_note: null,
        odometer_chain_reviewed_at: null,
        odometer_chain_reviewed_by: null,
        odometer_chain_review_note: null,
        unattributed_reviewed_at: null,
        unattributed_reviewed_by: null,
        unattributed_review_note: null,
        data_quality_vehicle_reviews: [],
        stop_to_stop_gap_accepts: [],
        counts: {},
        current_step: "data-quality",
        version: nextVersion,
        updated_at: now,
      })
      .eq("id", periodId)
      .eq("org_id", orgId);
    await insertAudit(orgId, periodId, "reopen", { reason, version: nextVersion }, actor);
    await rebuildExpensesForFuelWeek(weekStart, reopenDriverIds);
  } else if (kind === "recompute") {
    await sb
      .from("fuel_reconciliation_period")
      .update({ version: nextVersion, updated_at: now, computed_at: now })
      .eq("id", periodId)
      .eq("org_id", orgId);
    await insertAudit(orgId, periodId, "recompute", { version: nextVersion }, actor);
  }

  await sb
    .from("fuel_period_job")
    .update({
      state: "succeeded",
      progress_done: 1,
      progress_total: 1,
      updated_at: now,
    })
    .eq("id", job.id);

  return { ok: true, version: nextVersion };
}

export function registerFuelPeriodRoutes(app: Hono) {
  app.get(`${BASE}/fuel/periods`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ periods: [] });
    const from = ymd(c.req.query("from"));
    const to = ymd(c.req.query("to"));
    const sb = getServiceClient();
    let q = sb
      .from("fuel_reconciliation_period")
      .select("*")
      .eq("org_id", orgId)
      .order("week_start", { ascending: false });
    if (from) q = q.gte("week_start", from);
    if (to) q = q.lte("week_start", to);
    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ periods: (data || []).map((r) => mapPeriod(r as any)) });
  });

  app.get(`${BASE}/fuel/periods/:id`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);
    const periodId = periodIdParam(c);
    if (!periodId) return c.json({ error: "period id required" }, 400);
    const row = await loadPeriod(orgId, periodId);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(mapPeriod(row));
  });

  /** Stage 6 / P-9: week bundle — period + counts + step notes + provenance (read-only; not money SoT). */
  app.get(`${BASE}/fuel/weeks/:weekStart/bundle`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);
    const weekStart = ymd(c.req.param("weekStart"));
    if (!weekStart) return c.json({ error: "weekStart required" }, 400);
    const period = await loadPeriod(orgId, periodIdFor(orgId, weekStart));
    const weekEnd = period ? ymd(period.week_end) : weekStart;
    const snaps = ((await kv.getByPrefix(`finalized_report:${weekStart}:`)) || []).filter(
      (s: any) => !s.orgId || s.orgId === orgId || !s.org_id || s.org_id === orgId,
    );
    const counts = (period?.counts && typeof period.counts === "object" ? period.counts : {}) as Record<
      string,
      unknown
    >;
    const countsEvaluated = Object.keys(counts).length > 0;
    let stepNotes: Array<{ step: string; note: string; at: string }> = [];
    let secondApproveActorIds: string[] = [];
    if (period?.id) {
      const sb = getServiceClient();
      const { data: audit } = await sb
        .from("fuel_period_audit")
        .select("action,at,actor_id,payload")
        .eq("period_id", String(period.id))
        .eq("org_id", orgId)
        .order("at", { ascending: true });
      for (const a of audit || []) {
        const action = String((a as any).action || "");
        if (action === "second_approve") {
          const actor = String((a as any).actor_id || "");
          if (actor) secondApproveActorIds.push(actor);
          continue;
        }
        if (action !== "step") continue;
        const payload =
          (a as any).payload && typeof (a as any).payload === "object"
            ? ((a as any).payload as Record<string, unknown>)
            : {};
        const note = String(payload.note || "").trim();
        if (!note) continue;
        stepNotes.push({
          step: String(payload.step || "").trim() || "step",
          note,
          at: String((a as any).at || ""),
        });
      }
    }
    const snapshotSummaries = snaps.map((s: any) => ({
      driverId: s.driverId ? String(s.driverId) : null,
      vehicleId: s.vehicleId ? String(s.vehicleId) : null,
      totalGasCardCost: Number(s.totalGasCardCost) || 0,
      companyShare: Number(s.companyShare) || 0,
      driverShare: Number(s.driverShare) || 0,
      miscellaneousCost: Number(s.miscellaneousCost) || 0,
      // Preview only — finalize still uses gated client build until enforce is trusted.
      moneyCommitted: Boolean(s.moneyCommitted),
    }));
    return c.json({
      weekStart,
      weekEnd,
      period: period ? mapPeriod(period) : null,
      counts,
      countsEvaluated,
      snapshotCount: snaps.length,
      snapshotSummaries,
      stepNotes,
      secondApproveActorIds,
      provenance: {
        source: "fuel_week_bundle",
        generatedAt: new Date().toISOString(),
        note: "Read-only hydrate for wizard chrome. Reports/blockers/money still client-computed until FUEL_SERVER_ENGINE=enforce + full loaders",
      },
    });
  });

  app.post(
    `${BASE}/fuel/periods/ensure`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const weekStart = ymd(body.weekStart);
      const weekEnd = ymd(body.weekEnd) || weekStart;
      if (!weekStart) return c.json({ error: "weekStart required" }, 400);
      const id = periodIdFor(orgId, weekStart);
      const sb = getServiceClient();
      const { data: existing } = await sb
        .from("fuel_reconciliation_period")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (existing) return c.json(mapPeriod(existing as any));
      const { data, error } = await sb
        .from("fuel_reconciliation_period")
        .insert({
          id,
          org_id: orgId,
          week_start: weekStart,
          week_end: weekEnd,
          status: "open",
          version: 1,
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json(mapPeriod(data as any));
    },
  );

  app.post(
    `${BASE}/fuel/periods/backfill`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      // Wave 4 SoT: never blind-lock every snapshot week — require weekStarts (or explicit forceAll).
      const forceAll = body.forceAll === true;
      const onlyWeeks = Array.isArray(body.weekStarts)
        ? new Set(
            (body.weekStarts as unknown[])
              .map((w) => ymd(w))
              .filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w)),
          )
        : null;
      if (!forceAll && (!onlyWeeks || onlyWeeks.size === 0)) {
        return c.json(
          {
            error:
              "weekStarts required (YYYY-MM-DD Mondays). Pass forceAll:true only for emergency mass backfill.",
          },
          400,
        );
      }
      const sb = getServiceClient();
      const all = ((await kv.getByPrefix("finalized_report:")) || []) as any[];
      const byWeek = new Map<string, any[]>();
      for (const snap of all) {
        const snapOrg = snap.orgId || snap.org_id;
        if (snapOrg && snapOrg !== orgId) continue;
        const wk = ymd(snap.weekStart || snap.week_start);
        if (!wk) continue;
        if (onlyWeeks && !onlyWeeks.has(wk)) continue;
        const list = byWeek.get(wk) || [];
        list.push(snap);
        byWeek.set(wk, list);
      }
      let upserted = 0;
      let moneyCommitted = 0;
      const rebuiltDriverIds = new Set<string>();
      for (const [weekStart, snaps] of byWeek) {
        const weekEnd = ymd(snaps[0]?.weekEnd || snaps[0]?.week_end) || weekStart;
        // Commit wallet+ledger for staged snaps before painting Expenses Finalized.
        for (const snap of snaps) {
          if (snap?.moneyCommitted === true) continue;
          try {
            await commitFinalizedSnapshotMoney(snap, orgId);
            moneyCommitted += 1;
          } catch (err) {
            console.error(
              `[fuel/periods/backfill] money commit failed ${snap?.driverId}/${weekStart}:`,
              err,
            );
            return c.json(
              {
                error: `money commit failed for ${snap?.driverId || "?"} @ ${weekStart}`,
                detail: String((err as Error)?.message || err),
                upserted,
                moneyCommitted,
              },
              500,
            );
          }
        }
        const money = aggregateFinalizedForWeek(snaps);
        const id = periodIdFor(orgId, weekStart);
        const { error } = await sb.from("fuel_reconciliation_period").upsert(
          {
            id,
            org_id: orgId,
            week_start: weekStart,
            week_end: weekEnd,
            status: "locked",
            ...money,
            locked_at: snaps[0]?.finalizedAt || new Date().toISOString(),
            computed_at: new Date().toISOString(),
            computed_from_hash: `finalized:${snaps.length}`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (!error) {
          upserted += 1;
          const driverIds = snaps.map((s) => String(s?.driverId || "")).filter(Boolean);
          await rebuildExpensesForFuelWeek(weekStart, driverIds);
          for (const d of driverIds) rebuiltDriverIds.add(d);
        }
      }
      return c.json({
        ok: true,
        upserted,
        moneyCommitted,
        weeks: byWeek.size,
        driversRebuilt: rebuiltDriverIds.size,
        filtered: Boolean(onlyWeeks),
        forceAll,
      });
    },
  );

  app.post(
    `${BASE}/fuel/periods/recompute`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const from = ymd(body.from);
      const to = ymd(body.to);
      const sb = getServiceClient();
      const all = ((await kv.getByPrefix("finalized_report:")) || []) as any[];
      const byWeek = new Map<string, any[]>();
      for (const snap of all) {
        const snapOrg = snap.orgId || snap.org_id;
        if (snapOrg && snapOrg !== orgId) continue;
        const wk = ymd(snap.weekStart || snap.week_start);
        if (!wk) continue;
        if (from && wk < from) continue;
        if (to && wk > to) continue;
        const list = byWeek.get(wk) || [];
        list.push(snap);
        byWeek.set(wk, list);
      }
      let updated = 0;
      for (const [weekStart, snaps] of byWeek) {
        const weekEnd = ymd(snaps[0]?.weekEnd || snaps[0]?.week_end) || weekStart;
        const money = aggregateFinalizedForWeek(snaps);
        const id = periodIdFor(orgId, weekStart);
        const { data: existing } = await sb
          .from("fuel_reconciliation_period")
          .select("id,status")
          .eq("id", id)
          .maybeSingle();
        const { error } = await sb.from("fuel_reconciliation_period").upsert(
          {
            id,
            org_id: orgId,
            week_start: weekStart,
            week_end: weekEnd,
            status: existing?.status || "open",
            ...money,
            computed_at: new Date().toISOString(),
            computed_from_hash: `finalized:${snaps.length}`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
        if (!error) updated += 1;
      }
      return c.json({ ok: true, updated });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/materialize`,
    requirePermission("fuel.edit_entry"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const sb = getServiceClient();
      const now = new Date().toISOString();
      let row = await loadPeriod(orgId, periodId);
      const weekStart = ymd(row?.week_start || body.weekStart);
      const weekEnd = ymd(row?.week_end || body.weekEnd) || weekStart;
      const serverCounts = weekStart
        ? await serverFuelStepCountsForPeriod(orgId, weekStart, weekEnd, {
          unexplained: body.unexplained ?? row?.unexplained,
          leakage_reviewed_at: row?.leakage_reviewed_at,
        })
        : buildServerFuelStepCounts({
          exceptionFillCount: 0,
          openDisputeCount: 0,
          leakageActionable: false,
        });
      const snapMoney: MaterializeSnapMoneyOk | MaterializeSnapMoneyMiss = weekStart
        ? await aggregateMaterializeMoneyFromSnaps(orgId, weekStart)
        : { ok: false, snapCount: 0 };
      const patch = {
        total_spend: snapMoney.ok
          ? snapMoney.totalSpend
          : Number(body.totalSpend) || 0,
        gas_card_spend: snapMoney.ok
          ? snapMoney.gasCardSpend
          : Number(body.gasCardSpend) || 0,
        // F-10: prefer snap cash split; fall back to client body.
        cash_from_earnings: snapMoney.ok
          ? snapMoney.driverSpend
          : Number(body.cashFromEarnings) || 0,
        company_share: snapMoney.ok
          ? snapMoney.companyShare
          : Number(body.companyShare) || 0,
        driver_share: snapMoney.ok
          ? snapMoney.driverShare
          : Number(body.driverShare) || 0,
        unexplained: snapMoney.ok
          ? snapMoney.unexplained
          : Number(body.unexplained) || 0,
        vehicle_count: Number(body.vehicleCount) || 0,
        driver_count: Number(body.driverCount) || 0,
        // F-5: persist client degraded signal for server auto-close gate.
        degraded_inputs: Boolean(body.degradedInputs),
        computed_at: now,
        computed_from_hash: snapMoney.ok
          ? `server:materialize:snaps:${snapMoney.snapCount}`
          : weekStart
          ? `server:materialize:${weekStart}`
          : `server:materialize:${now.slice(0, 10)}`,
        updated_at: now,
        counts: serverCounts,
      };
      if (!row) {
        const weekStart = ymd(body.weekStart);
        const weekEnd = ymd(body.weekEnd) || weekStart;
        if (!weekStart) return c.json({ error: "period not found" }, 404);
        const { data, error } = await sb
          .from("fuel_reconciliation_period")
          .upsert(
            {
              id: periodIdFor(orgId, weekStart),
              org_id: orgId,
              week_start: weekStart,
              week_end: weekEnd,
              status: "open",
              version: 1,
              ...patch,
            },
            { onConflict: "id" },
          )
          .select("*")
          .single();
        if (error) return c.json({ error: error.message }, 500);
        row = data as any;
      } else if (row.status === "locked") {
        return c.json({ ok: true, skipped: "locked", period: mapPeriod(row) });
      } else {
        const { error } = await sb
          .from("fuel_reconciliation_period")
          .update(patch)
          .eq("id", periodId)
          .eq("org_id", orgId);
        if (error) return c.json({ error: error.message }, 500);
        row = await loadPeriod(orgId, periodId);
        if (!row) return c.json({ error: "Not found" }, 404);
      }
      if (!row) return c.json({ error: "Not found" }, 404);
      await insertAudit(orgId, String(row.id), "materialize", patch, actorId(c));
      return c.json({ ok: true, period: mapPeriod(row as any) });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/finalize`,
    requirePermission("fuel.finalize"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const weekKey = ymd(period.week_start);
      try {
        assertPeriodEndedForReconciliation(weekKey);
      } catch (e) {
        const body = periodNotEndedResponse(e);
        if (body) return c.json(body, 409);
        throw e;
      }
      const unapproved = await assertNoUnapprovedFuelTxInWindow(
        orgId,
        ymd(period.week_start),
        ymd(period.week_end),
      );
      if (unapproved) {
        return c.json(unapproved, 422);
      }
      const ifMatch = c.req.header("If-Match");
      if (ifMatch != null && ifMatch !== "" && Number(ifMatch) !== Number(period.version)) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      const body = await c.req.json().catch(() => ({}));
      const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [];

      const closableInput = await buildFuelWeekClosableInputForPeriod(orgId, period, snapshots);
      const closableBlockers = evaluateFuelWeekClosable(closableInput);
      if (closableBlockers.length > 0) {
        const first = closableBlockers[0];
        return c.json(
          {
            error: fuelClosableBlockerHttpCode(first.code),
            code: fuelClosableBlockerHttpCode(first.code),
            blockers: closableBlockers,
            message: first.message,
          },
          422,
        );
      }

      // Stage 5: FUEL_SERVER_ENGINE=off|shadow|enforce — recompute vs client proposal.
      const engineMode = String(Deno.env.get("FUEL_SERVER_ENGINE") || "off").toLowerCase();
      if (engineMode === "shadow" || engineMode === "enforce") {
        const { computeFuelWeek, diffWeekCalc } = await import(
          "../../../packages/fuel-core/src/computeFuelWeek.ts"
        );
        const {
          materialCategoryCostDeltas,
          resolveEngineCategoryCosts,
          loadServerTaggedFuelEntriesForWeek,
          loadServerWindowMoneyEntriesForWeek,
        } = await import("./fuel_week_category_loader.ts");
        const { deriveWindowMoneyFromEntries } = await import(
          "../../../packages/fuel-core/src/deriveWindowMoneyFromEntries.ts"
        );
        const { upsertFinanceReconDrifts } = await import("./finance_recon_drift.ts");
        type EngineAuthoritySource =
          | "server_entries"
          | "trip_agg"
          | "tagged_snap_entries"
          | "snap_category_costs";
        const mismatches: Array<{
          driverId: string;
          authoritySource: EngineAuthoritySource;
          deltas: { field: string; delta: number }[];
        }> = [];
        // N-19: soak must prove which ladder tier produced each comparison.
        const authoritySourceByDriver: Record<string, EngineAuthoritySource> = {};
        const weekKey = ymd(period.week_start);
        const weekEnd = ymd(period.week_end) || weekKey;
        const serverTaggedEntries = await loadServerTaggedFuelEntriesForWeek(
          orgId,
          weekKey,
          weekEnd,
        );
        const windowMoneyEntries = await loadServerWindowMoneyEntriesForWeek(
          orgId,
          weekKey,
          weekEnd,
        );
        for (const snap of snapshots) {
          const snapObj = (snap && typeof snap === "object" ? snap : {}) as Record<string, unknown>;
          const { authority: cats, snapCats, authoritySource } = resolveEngineCategoryCosts(
            snapObj,
            serverTaggedEntries,
          );
          const driverId = String(snapObj.driverId || "");
          if (driverId) authoritySourceByDriver[driverId] = authoritySource;
          const hasCats =
            cats.rideShareCost + cats.companyUsageCost + cats.deadheadCost + cats.personalUsageCost >
              0.009 ||
            snapCats != null;
          if (!hasCats) continue;
          const meta = (snapObj.metadata && typeof snapObj.metadata === "object"
            ? snapObj.metadata
            : {}) as Record<string, unknown>;
          // R-3: derive JMD/L from entries — ignore client stamp.
          const driverWindowEntries = windowMoneyEntries.filter(
            (e) => !driverId || String(e.driverId || "") === driverId,
          );
          const derivedWindow = deriveWindowMoneyFromEntries(driverWindowEntries);
          const clientTiming = Number(meta.windowTimingCost) || 0;
          const clientUnattr = Number(meta.unattributedFillCost) || 0;
          const clientCalc = {
            totalSpend: Number(snapObj.totalGasCardCost) || 0,
            companyShare: Number(snapObj.companyShare) || 0,
            driverShare: Number(snapObj.driverShare) || 0,
            miscellaneousCost: Number(snapObj.miscellaneousCost) || 0,
            windowTimingCost: clientTiming,
            unattributedFillCost: clientUnattr,
          };
          const paEarned =
            Number(snapObj.personalAllowanceEarnedCost) ||
            Number(meta.personalAllowanceEarnedCost) ||
            0;
          const recomputed = computeFuelWeek({
            totalSpend:
              Number(snapObj.totalGasCardCost) ||
              Number(snapObj.totalSpend) ||
              0,
            rideShareCost: Number(cats.rideShareCost) || 0,
            companyUsageCost: Number(cats.companyUsageCost) || 0,
            deadheadCost: Number(cats.deadheadCost) || 0,
            personalUsageCost: Number(cats.personalUsageCost) || 0,
            windowTimingCost: derivedWindow.windowTimingCost,
            unattributedFillCost: derivedWindow.unattributedFillCost,
            rule:
              snapObj.fuelRule ||
              meta.fuelRule ||
              null,
            driverId: String(snapObj.driverId || ""),
            // N-17: same PA absorb as client freeze.
            personalAllowanceEarnedCost: paEarned,
          });
          const deltas = [
            ...diffWeekCalc(clientCalc, recomputed),
            ...materialCategoryCostDeltas(snapCats, cats),
          ];
          if (deltas.length) {
            mismatches.push({ driverId, authoritySource, deltas });
            const engineDrifts = deltas
              .filter((d) => d.field === "driverShare" || d.field === "companyShare")
              .map((d) => {
                const statementMinor = Math.round(
                  (Number(clientCalc[d.field as keyof typeof clientCalc]) || 0) * 100,
                );
                const engineMinor = Math.round(
                  (Number(recomputed[d.field as keyof typeof recomputed]) || 0) * 100,
                );
                return {
                  kind: "fuel" as const,
                  field: d.field,
                  statementMinor,
                  engineMinor,
                  deltaMinor: statementMinor - engineMinor,
                };
              });
            if (driverId && engineDrifts.length) {
              try {
                await upsertFinanceReconDrifts({
                  organizationId: orgId,
                  driverId,
                  weekKey,
                  source: "close",
                  drifts: engineDrifts,
                });
              } catch (driftErr) {
                console.warn("[fuel_period] fuel_engine_diff drift persist failed", driftErr);
              }
            }
          }
        }
        // Always audit in shadow/enforce so clean weeks still prove authoritySource (N-19).
        const stopToStopSummary = snapshots.map((snap: unknown) => {
          const snapObj = (snap && typeof snap === "object" ? snap : {}) as Record<string, unknown>;
          const meta = (snapObj.metadata && typeof snapObj.metadata === "object"
            ? snapObj.metadata
            : {}) as Record<string, unknown>;
          const buckets = Array.isArray(snapObj.odometerBuckets)
            ? snapObj.odometerBuckets
            : [];
          return {
            driverId: String(snapObj.driverId || ""),
            bucketCount: buckets.length,
            engineVersion: meta.stopToStopEngineVersion || null,
            frozenAt: meta.stopToStopFrozenAt || null,
          };
        });
        const engineDiffPayload = {
          mode: engineMode,
          mismatches,
          authoritySourceByDriver,
          reviewedHash: body.reviewedHash || null,
          stopToStop: stopToStopSummary,
        };
        await insertAudit(
          orgId,
          periodId,
          "fuel_engine_diff",
          engineDiffPayload,
          actorId(c),
        );
        if (mismatches.length) {
          console.warn("[fuel_period] FUEL_SERVER_ENGINE diff", engineMode, mismatches);
          if (engineMode === "enforce") {
            const force =
              c.req.header("X-Fuel-Force-Client-Money") === "1" &&
              String(body.forceReason || "").trim().length >= 8;
            if (!force) {
              return c.json(
                { error: "SNAPSHOT_MISMATCH", code: "SNAPSHOT_MISMATCH", mismatches },
                422,
              );
            }
            await insertAudit(
              orgId,
              periodId,
              "fuel_force_client_money",
              {
                forceReason: String(body.forceReason || "").trim(),
                mismatches,
                authoritySourceByDriver,
                mode: engineMode,
              },
              actorId(c),
            );
          }
        }
      }
      const idempotencyKey =
        c.req.header("Idempotency-Key") ||
        `finalize:${periodId}:v${Number(period.version) || 1}`;
      const sb = getServiceClient();
      const actor = actorId(c);
      // Program 4: UI service_only — record system second_approve before finalize if needed.
      // Bulk finalize with explicit ack may also request service second_approve (high-spend weeks).
      const orgPrefs = await loadOrgPreferences(orgId);
      const uiMode = resolveDualApprovalUiMode(orgPrefs.fuelDualApprovalUiMode);
      const thr =
        Number(body.secondApproverThreshold) ||
        secondApproverThresholdFromPrefs(orgPrefs);
      // H-6: only org pref service_only may stamp service second approve — never client flag.
      const allowServiceSecondApprove = uiMode === "service_only";
      const stampServiceSecondApproveIfNeeded = async (cursorSpend?: number) => {
        const effectiveSpend = Math.max(
          Number(body.totalSpend) || 0,
          Number(period.total_spend) || 0,
          Number(cursorSpend) || 0,
        );
        if (!allowServiceSecondApprove || !(thr > 0 && effectiveSpend > thr) || !actor) {
          return;
        }
        const approver = fuelAutoCloseApproverId();
        if (approver === actor) return;
        await insertAudit(
          orgId,
          periodId,
          "second_approve",
          {
            source: "ui_service_approve",
            totalSpend: effectiveSpend,
            secondApproverThreshold: thr,
            periodVersion: Number(period.version) || 1,
          },
          approver,
        );
      };

      const { data: existing } = await sb
        .from("fuel_period_job")
        .select("*")
        .eq("org_id", orgId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        // Re-run queued/running/failed so cursor resume can finish unsettled drivers (NEW-7).
        if (
          existing.state === "queued" ||
          existing.state === "running" ||
          existing.state === "failed"
        ) {
          const cursorSpend = Number(
            (existing.cursor && typeof existing.cursor === "object"
              ? (existing.cursor as Record<string, unknown>).totalSpend
              : 0) as number,
          );
          await stampServiceSecondApproveIfNeeded(cursorSpend);
          const { data: fresh } = await sb
            .from("fuel_period_job")
            .select("*")
            .eq("id", existing.id)
            .maybeSingle();
          const result = await processJobRow((fresh || existing) as any);
          return c.json(
            {
              jobId: existing.id,
              state: result.ok ? "succeeded" : "failed",
              ...result,
            },
            202,
          );
        }
        return c.json(
          {
            jobId: existing.id,
            state: existing.state,
            failures: existing.failures || [],
          },
          202,
        );
      }

      await stampServiceSecondApproveIfNeeded();
      const { data: job, error } = await sb
        .from("fuel_period_job")
        .insert({
          period_id: periodId,
          org_id: orgId,
          kind: "finalize",
          state: "queued",
          idempotency_key: idempotencyKey,
          period_version: Number(period.version) || 1,
          cursor: {
            snapshots,
            completedDriverIds: [],
            failures: [],
            totalSpend: body.totalSpend,
            secondApproverThreshold: body.secondApproverThreshold ?? thr,
          },
          progress_total: snapshots.length,
          created_by: actor,
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      const result = await processJobRow(job as any);
      return c.json({ jobId: job.id, state: result.ok ? "succeeded" : "failed", ...result }, 202);
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/reopen`,
    requirePermission("fuel.reopen"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const reason = String(body.reason || "").trim();
      if (!reason) return c.json({ error: "reason required" }, 400);
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const ifMatch = c.req.header("If-Match");
      if (ifMatch != null && ifMatch !== "" && Number(ifMatch) !== Number(period.version)) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      const idempotencyKey =
        c.req.header("Idempotency-Key") ||
        `reopen:${periodId}:v${Number(period.version) || 1}`;
      const sb = getServiceClient();
      const { data: existing } = await sb
        .from("fuel_period_job")
        .select("*")
        .eq("org_id", orgId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) return c.json({ jobId: existing.id, state: existing.state }, 202);
      const actor = actorId(c);
      const { data: job, error } = await sb
        .from("fuel_period_job")
        .insert({
          period_id: periodId,
          org_id: orgId,
          kind: "reopen",
          state: "queued",
          idempotency_key: idempotencyKey,
          period_version: Number(period.version) || 1,
          cursor: { reason },
          created_by: actor,
        })
        .select("*")
        .single();
      if (error) return c.json({ error: error.message }, 500);
      const result = await processJobRow(job as any);
      return c.json({ jobId: job.id, state: result.ok ? "succeeded" : "failed", ...result }, 202);
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/leakage-review`,
    requirePermission("fuel.accept_unexplained"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const validated = validateDisposition({
        disposition: body.disposition,
        note: body.note,
        requireNoteMinLength: 8,
      });
      if (!validated.ok) {
        return c.json({ error: validated.error, minLength: 8 }, 422);
      }
      const { disposition, note } = validated;
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      if (String(period.status) === "locked") {
        return c.json({ error: "period_locked" }, 409);
      }
      const actor = actorId(c);
      const now = new Date().toISOString();
      const sb = getServiceClient();
      const { error } = await sb
        .from("fuel_reconciliation_period")
        .update({
          leakage_reviewed_at: now,
          leakage_reviewed_by: actor,
          leakage_review_note: note,
          updated_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId);
      if (error) return c.json({ error: error.message }, 500);
      await insertAudit(orgId, periodId, "leakage_review", { note, disposition }, actor);
      return c.json({ ok: true, leakageReviewedAt: now, disposition });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/odometer-chain-review`,
    requirePermission("fuel.accept_unexplained"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const note = String(body.note || "").trim();
      if (note.length < 8) {
        return c.json({ error: "note_too_short", minLength: 8 }, 422);
      }
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      if (String(period.status) === "locked") {
        return c.json({ error: "period_locked" }, 409);
      }
      const actor = actorId(c);
      const now = new Date().toISOString();
      const sb = getServiceClient();
      const { error } = await sb
        .from("fuel_reconciliation_period")
        .update({
          odometer_chain_reviewed_at: now,
          odometer_chain_reviewed_by: actor,
          odometer_chain_review_note: note,
          updated_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId);
      if (error) return c.json({ error: error.message }, 500);
      await insertAudit(orgId, periodId, "odometer_chain_review", { note }, actor);
      return c.json({ ok: true, odometerChainReviewedAt: now });
    },
  );

  /** Cash-desk: mark one flagged vehicle reviewed so Data quality Continue can unlock. */
  app.post(
    `${BASE}/fuel/periods/:id/data-quality-vehicle-review`,
    requirePermission("fuel.edit_entry"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const vehicleId = String(body.vehicleId || "").trim();
      if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
      const note = String(body.note || "").trim() || null;
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      if (String(period.status) === "locked") {
        return c.json({ error: "period_locked" }, 409);
      }
      const ifMatch = c.req.header("If-Match");
      if (ifMatch != null && ifMatch !== "" && Number(ifMatch) !== Number(period.version)) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      const actor = actorId(c);
      const now = new Date().toISOString();
      const existing = Array.isArray(period.data_quality_vehicle_reviews)
        ? (period.data_quality_vehicle_reviews as Array<Record<string, unknown>>)
        : [];
      const filtered = existing.filter((r) => String(r?.vehicleId || r?.vehicle_id || "") !== vehicleId);
      const next = [
        ...filtered,
        { vehicleId, at: now, by: actor, note },
      ];
      const nextVersion = (Number(period.version) || 1) + 1;
      const sb = getServiceClient();
      const { data: updated, error } = await sb
        .from("fuel_reconciliation_period")
        .update({
          data_quality_vehicle_reviews: next,
          version: nextVersion,
          updated_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId)
        .eq("version", Number(period.version) || 1)
        .select("id")
        .maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!updated) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      await insertAudit(
        orgId,
        periodId,
        "data_quality_vehicle_review",
        { vehicleId, note, version: nextVersion },
        actor,
      );
      return c.json({
        ok: true,
        dataQualityVehicleReviews: next,
        version: nextVersion,
      });
    },
  );

  /** Accept OVER-LOG / attribution stop-to-stop windows (single or bulk). Never unlocks chain. */
  app.post(
    `${BASE}/fuel/periods/:id/stop-to-stop-gap-accept`,
    requirePermission("fuel.accept_unexplained"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const disposition = String(body.disposition || "").trim() || null;
      const allowedDisp = new Set(["trips_overstated", "gps_noise", "known_variance", "other"]);
      if (disposition && !allowedDisp.has(disposition)) {
        return c.json({ error: "invalid_disposition" }, 422);
      }
      const rawAccepts = Array.isArray(body.accepts) ? body.accepts : [];
      const validated = validateStopToStopGapAcceptRequest({
        note: String(body.note || ""),
        accepts: rawAccepts,
      });
      if (!validated.ok) {
        const status = validated.error === "accepts_required" ? 400 : 422;
        return c.json(
          { error: validated.error, ...(validated.minLength ? { minLength: validated.minLength } : {}) },
          status,
        );
      }
      const note = String(body.note || "").trim();
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      if (String(period.status) === "locked") {
        return c.json({ error: "period_locked" }, 409);
      }
      const ifMatch = c.req.header("If-Match");
      if (ifMatch != null && ifMatch !== "" && Number(ifMatch) !== Number(period.version)) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      const actor = actorId(c);
      const now = new Date().toISOString();
      const incoming = rawAccepts.map((raw: Record<string, unknown>) => ({
        bucketId: String(raw.bucketId || "").trim() || undefined,
        vehicleId: String(raw.vehicleId || "").trim(),
        startOdometer: Number(raw.startOdometer) || 0,
        endOdometer: Number(raw.endOdometer) || 0,
        startDate: String(raw.startDate || "").slice(0, 10),
        endDate: String(raw.endDate || "").slice(0, 10),
        note,
        disposition: disposition || undefined,
        at: now,
        by: actor,
      })).filter((a: { vehicleId: string; endDate: string }) => a.vehicleId && a.endDate);
      if (incoming.length === 0) {
        return c.json({ error: "accepts_invalid" }, 400);
      }
      const existing = Array.isArray(period.stop_to_stop_gap_accepts)
        ? (period.stop_to_stop_gap_accepts as Parameters<typeof upsertStopToStopGapAccepts>[0])
        : [];
      const next = upsertStopToStopGapAccepts(existing, incoming);
      const nextVersion = (Number(period.version) || 1) + 1;
      const sb = getServiceClient();
      const { data: updated, error } = await sb
        .from("fuel_reconciliation_period")
        .update({
          stop_to_stop_gap_accepts: next,
          version: nextVersion,
          updated_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId)
        .eq("version", Number(period.version) || 1)
        .select("id")
        .maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (!updated) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      await insertAudit(
        orgId,
        periodId,
        "stop_to_stop_gap_accept",
        { count: incoming.length, note, disposition, version: nextVersion },
        actor,
      );
      return c.json({
        ok: true,
        stopToStopGapAccepts: next,
        version: nextVersion,
      });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/stop-to-stop-gap-accept/revoke`,
    requirePermission("fuel.accept_unexplained"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      if (String(period.status) === "locked") {
        return c.json({ error: "period_locked" }, 409);
      }
      const existing = Array.isArray(period.stop_to_stop_gap_accepts)
        ? (period.stop_to_stop_gap_accepts as Parameters<typeof revokeStopToStopGapAccept>[0])
        : [];
      const target = {
        bucketId: String(body.bucketId || "").trim() || undefined,
        vehicleId: String(body.vehicleId || "").trim(),
        startOdometer: Number(body.startOdometer) || 0,
        endOdometer: Number(body.endOdometer) || 0,
        endDate: String(body.endDate || "").slice(0, 10),
      };
      if (!target.vehicleId || !target.endDate) {
        return c.json({ error: "target_required" }, 400);
      }
      const next = revokeStopToStopGapAccept(existing, target);
      const actor = actorId(c);
      const now = new Date().toISOString();
      const nextVersion = (Number(period.version) || 1) + 1;
      const sb = getServiceClient();
      const { error } = await sb
        .from("fuel_reconciliation_period")
        .update({
          stop_to_stop_gap_accepts: next,
          version: nextVersion,
          updated_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId);
      if (error) return c.json({ error: error.message }, 500);
      await insertAudit(orgId, periodId, "stop_to_stop_gap_accept_revoke", { target }, actor);
      return c.json({ ok: true, stopToStopGapAccepts: next, version: nextVersion });
    },
  );

  /** Upsert fill-level flag disposition — desk + wizard share one record. */
  app.post(
    `${BASE}/fuel/flags/disposition`,
    requirePermission("fuel.edit_entry"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const entryId = String(body.entryId || "").trim();
      const flagCode = String(body.flagCode || "").trim();
      const action = String(body.action || "").trim();
      const note = String(body.note || "").trim();
      const periodId = String(body.periodId || "").trim() || null;
      const severity = String(body.severity || "").trim();
      if (!entryId || !flagCode) {
        return c.json({ error: "entryId and flagCode required" }, 400);
      }
      if (action !== "accepted" && action !== "corrected" && action !== "escalated") {
        return c.json({ error: "invalid action" }, 400);
      }
      if (action === "accepted" && severity === "critical" && note.length < 8) {
        return c.json({ error: "note_required", minLength: 8 }, 422);
      }
      if (action === "accepted" && severity === "critical") {
        const { hasPermission } = await import("./rbac_middleware.ts");
        const rbacUser = c.get("rbacUser") as { resolvedRole?: string } | undefined;
        const role = (rbacUser?.resolvedRole || "fleet_viewer") as import("./rbac_middleware.ts").Role;
        if (!hasPermission(role, "fuel.accept_unexplained")) {
          return c.json({ error: "forbidden", permission: "fuel.accept_unexplained" }, 403);
        }
      }
      const actor = actorId(c);
      if (!actor) return c.json({ error: "actor required" }, 400);
      const now = new Date().toISOString();
      const sb = getServiceClient();
      const row = {
        org_id: orgId,
        entry_id: entryId,
        flag_code: flagCode,
        action,
        note: note || null,
        period_id: periodId,
        actor_id: actor,
        at: now,
      };
      const { data, error } = await sb
        .from("fuel_flag_disposition")
        .upsert(row, { onConflict: "org_id,entry_id,flag_code" })
        .select("*")
        .maybeSingle();
      if (error) return c.json({ error: error.message }, 500);
      if (periodId) {
        await insertAudit(
          orgId,
          periodId,
          "flag_disposition",
          { entryId, flagCode, action, note: note || null },
          actor,
        );
      }
      return c.json({
        ok: true,
        disposition: {
          entryId,
          flagCode,
          action,
          note: note || null,
          actorId: actor,
          at: now,
          periodId,
          id: data?.id,
        },
      });
    },
  );

  /** List dispositions scoped by entry IDs (preferred) and/or periodId — never silent org-wide clip. */
  app.get(
    `${BASE}/fuel/flags/dispositions`,
    requirePermission("fuel.view"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ dispositions: [], truncated: false });
      const periodId = String(c.req.query("periodId") || "").trim();
      const entryIdsRaw = String(c.req.query("entryIds") || "").trim();
      const entryIds = entryIdsRaw
        ? [...new Set(entryIdsRaw.split(",").map((s) => s.trim()).filter(Boolean))]
        : [];
      if (!periodId && entryIds.length === 0) {
        return c.json({
          dispositions: [],
          truncated: false,
          error: "entryIds_or_periodId_required",
        }, 400);
      }
      const sb = getServiceClient();
      const CHUNK = 200;
      const PER_CHUNK_CAP = 2000;
      const rows: any[] = [];
      let truncated = false;

      if (entryIds.length > 0) {
        for (let i = 0; i < entryIds.length; i += CHUNK) {
          const slice = entryIds.slice(i, i + CHUNK);
          let q = sb
            .from("fuel_flag_disposition")
            .select("*")
            .eq("org_id", orgId)
            .in("entry_id", slice)
            .order("at", { ascending: false })
            .limit(PER_CHUNK_CAP);
          // Do not AND period_id here — null period_id rows would drop out (R3-3).
          const { data, error } = await q;
          if (error) return c.json({ error: error.message }, 500);
          const batch = data || [];
          if (batch.length >= PER_CHUNK_CAP) truncated = true;
          rows.push(...batch);
        }
      } else {
        // periodId-only fallback (may miss null period_id rows — prefer entryIds).
        const { data, error } = await sb
          .from("fuel_flag_disposition")
          .select("*")
          .eq("org_id", orgId)
          .eq("period_id", periodId)
          .order("at", { ascending: false })
          .limit(PER_CHUNK_CAP);
        if (error) return c.json({ error: error.message }, 500);
        const batch = data || [];
        if (batch.length >= PER_CHUNK_CAP) truncated = true;
        rows.push(...batch);
      }

      return c.json({
        dispositions: rows.map((r: any) => ({
          id: r.id,
          entryId: r.entry_id,
          flagCode: r.flag_code,
          action: r.action,
          note: r.note,
          actorId: r.actor_id,
          at: r.at,
          periodId: r.period_id,
        })),
        truncated,
      });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/unattributed-review`,
    requirePermission("fuel.accept_unexplained"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const note = String(body.note || "").trim();
      if (note.length < 8) {
        return c.json({ error: "note_too_short", minLength: 8 }, 422);
      }
      const amount = Number(body.amount);
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      if (String(period.status) === "locked") {
        return c.json({ error: "period_locked" }, 409);
      }
      const actor = actorId(c);
      const now = new Date().toISOString();
      const sb = getServiceClient();
      const { error } = await sb
        .from("fuel_reconciliation_period")
        .update({
          unattributed_reviewed_at: now,
          unattributed_reviewed_by: actor,
          unattributed_review_note: note,
          updated_at: now,
        })
        .eq("id", periodId)
        .eq("org_id", orgId);
      if (error) return c.json({ error: error.message }, 500);
      await insertAudit(
        orgId,
        periodId,
        "unattributed_review",
        { note, amount: Number.isFinite(amount) ? amount : null },
        actor,
      );
      return c.json({ ok: true, unattributedReviewedAt: now });
    },
  );

  // Stop-to-stop gap charge — list / recommend (no money) / approve (Pending ledger).
  app.get(
    `${BASE}/fuel/periods/:id/gap-charges`,
    requirePermission("fuel.view"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const statusFilter = String(c.req.query("status") || "").trim();
      const prefix = `gap_charge_rec:${orgId}:${periodId}:`;
      const rows = ((await kv.getByPrefix(prefix)) || []) as Record<string, unknown>[];
      let recommendations = rows.filter((r) => r && typeof r === "object");
      if (statusFilter) {
        recommendations = recommendations.filter((r) => String(r.status || "") === statusFilter);
      }
      recommendations.sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
      );
      return c.json({ recommendations });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/gap-charges/recommend`,
    requirePermission("fuel.edit_entry"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      // Q-1: refuse money-path mutations on locked periods.
      const period = await loadPeriod(orgId, periodId);
      const {
        buildRecommendPayload,
        gapChargeKvKey,
        assertPeriodNotLockedForGapCharge,
        assertGapChargeRecommendOverwrite,
      } = await import("./stop_to_stop_gap_charge_http.ts");
      const lockGate = assertPeriodNotLockedForGapCharge(period);
      if (!lockGate.ok) {
        if (lockGate.error === "period_not_found") return c.json({ error: "Not found" }, 404);
        return c.json({ error: "period_locked" }, 409);
      }
      // Q-2: never stamp a recommendation without a known actor.
      const actor = actorId(c);
      if (!actor) return c.json({ error: "actor_required" }, 401);
      const body = await c.req.json().catch(() => ({}));
      const { belongsToOrgStrict } = await import("./org_scope.ts");
      const vehicleId = String(body.vehicleId || "").trim();
      if (!vehicleId) return c.json({ error: "vehicleId required" }, 400);
      // N-5: never trust client-supplied assignment history for driver resolution.
      // P-4: verify vehicle belongs to caller's org (do not stampOrg — that overwrote org).
      const vehicleRaw = await kv.get(`vehicle:${vehicleId}`);
      if (!vehicleRaw || typeof vehicleRaw !== "object") {
        return c.json({ error: "vehicle_not_found" }, 404);
      }
      if (!belongsToOrgStrict(vehicleRaw as Record<string, unknown>, c)) {
        return c.json({ error: "vehicle_not_found" }, 404);
      }
      const vehicle = vehicleRaw as Record<string, unknown>;
      const bucketId = String(body.bucketId || "");
      if (!bucketId) return c.json({ error: "bucketId and vehicleId required" }, 400);
      const key = gapChargeKvKey(orgId, periodId, bucketId);
      const existing = (await kv.get(key)) as { status?: string; recommendedBy?: string } | null;
      const overwrite = assertGapChargeRecommendOverwrite({ actor, existing });
      if (!overwrite.ok) {
        return c.json({
          error: "already_recommended",
          message: "This gap charge is already recommended — a different person must approve it.",
        }, 409);
      }
      const rec = buildRecommendPayload({
        orgId,
        periodId,
        snapshotId: body.snapshotId ? String(body.snapshotId) : undefined,
        bucketId,
        vehicleId,
        amount: Number(body.amount) || 0,
        overLoggedKm: Number(body.overLoggedKm) || 0,
        reason: String(body.reason || "Over-logged distance"),
        confidenceTier: String(body.confidenceTier || "indeterminate"),
        startYmd: String(body.startYmd || "").split("T")[0],
        endYmd: String(body.endYmd || "").split("T")[0],
        vehicle: vehicle as any,
        recommendedBy: actor,
      });
      if (!rec.bucketId || !rec.vehicleId) {
        return c.json({ error: "bucketId and vehicleId required" }, 400);
      }
      if (rec.status === "blocked") {
        return c.json({ recommendation: rec }, 409);
      }
      await kv.set(key, rec);
      await insertAudit(orgId, periodId, "gap_charge_recommend", {
        bucketId: rec.bucketId,
        amount: rec.amount,
        driverId: rec.resolvedDriverId,
        recommendedBy: rec.recommendedBy,
      }, actor);
      return c.json({ recommendation: rec });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/gap-charges/approve`,
    requirePermission("fuel.second_approve"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      // Q-1: refuse money-path mutations on locked periods.
      const period = await loadPeriod(orgId, periodId);
      const {
        buildApproveTransaction,
        gapChargeKvKey,
        gapChargeIdempotencyKey,
        assertPeriodNotLockedForGapCharge,
        assertGapChargeDualControl,
      } = await import("./stop_to_stop_gap_charge_http.ts");
      const lockGate = assertPeriodNotLockedForGapCharge(period);
      if (!lockGate.ok) {
        if (lockGate.error === "period_not_found") return c.json({ error: "Not found" }, 404);
        return c.json({ error: "period_locked" }, 409);
      }
      const body = await c.req.json().catch(() => ({}));
      const bucketId = String(body.bucketId || "");
      if (!bucketId) return c.json({ error: "bucketId required" }, 400);
      const { stampOrgRequired } = await import("./org_scope.ts");
      const key = gapChargeKvKey(orgId, periodId, bucketId);
      const rec = (await kv.get(key)) as any;
      if (!rec || !rec.resolvedDriverId) {
        return c.json({ error: "recommendation_missing_or_blocked" }, 404);
      }
      if (String(rec.confidenceTier) !== "exact") {
        return c.json({ error: "confidence_not_exact" }, 422);
      }
      // Q-2: fail closed — never approve when actor or recommendedBy is missing.
      const dual = assertGapChargeDualControl({
        actor: actorId(c),
        recommendedBy: rec.recommendedBy,
      });
      if (!dual.ok) {
        const message =
          dual.error === "same_actor_forbidden"
            ? "A different person must approve this gap charge."
            : dual.error === "recommendation_missing_actor"
            ? "This recommendation has no recommender — re-recommend before approving."
            : "Signed-in user required to approve.";
        return c.json({ error: dual.error, message }, dual.status);
      }
      const actor = dual.actor;
      const idem = gapChargeIdempotencyKey(orgId, bucketId);
      // Idempotent: if already approved and ledger row exists, reuse.
      if (rec.transactionId) {
        const existing = await kv.get(`transaction:${rec.transactionId}`);
        if (existing && typeof existing === "object") {
          return c.json({
            recommendation: rec,
            transactionId: rec.transactionId,
            transaction: existing,
            idempotencyKey: idem,
            reused: true,
          });
        }
      }
      const tx = buildApproveTransaction({
        recommendation: rec,
        driverId: String(rec.resolvedDriverId),
      });
      const txId = String(tx.id);
      let stamped: Record<string, unknown>;
      try {
        stamped = stampOrgRequired(
          {
            ...tx,
            timestamp: new Date().toISOString(),
          } as Record<string, unknown>,
          c,
        );
      } catch (e: any) {
        return c.json({ error: e?.message || "org_stamp_failed" }, 400);
      }
      // N-4: write Pending ledger row before marking recommendation approved.
      await kv.set(`transaction:${txId}`, stamped);
      const persisted = await kv.get(`transaction:${txId}`);
      if (!persisted || typeof persisted !== "object") {
        return c.json({ error: "ledger_write_failed" }, 500);
      }
      const updated = {
        ...rec,
        status: "approved",
        transactionId: txId,
        approvedAt: new Date().toISOString(),
        approvedBy: actor,
      };
      await kv.set(key, updated);
      await insertAudit(orgId, periodId, "gap_charge_approve", {
        bucketId,
        transactionId: txId,
        idempotencyKey: idem,
        amount: rec.amount,
        driverId: rec.resolvedDriverId,
        recommendedBy: rec.recommendedBy,
        approvedBy: actor,
      }, actor);
      return c.json({
        recommendation: updated,
        transaction: persisted,
        transactionId: txId,
        idempotencyKey: idem,
        note: "Ledger status Pending — dispute via FuelDispute",
      });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/second-approve`,
    requirePermission("fuel.second_approve"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const actor = actorId(c);
      if (!actor) return c.json({ error: "actor required" }, 401);
      const body = await c.req.json().catch(() => ({}));
      await insertAudit(orgId, periodId, "second_approve", {
        note: body.note || null,
        periodVersion: Number(period.version) || 1,
      }, actor);
      // Distinct identity is enforced at finalize time vs job created_by.
      return c.json({ ok: true, actorId: actor });
    },
  );

  app.get(
    `${BASE}/fuel/periods/:id/evidence-pack`,
    requirePermission("fuel.view"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const sb = getServiceClient();
      const { data: audit } = await sb
        .from("fuel_period_audit")
        .select("*")
        .eq("period_id", periodId)
        .eq("org_id", orgId)
        .order("at", { ascending: true });
      const weekStart = ymd(period.week_start);
      const snaps = ((await kv.getByPrefix(`finalized_report:${weekStart}:`)) || []) as any[];
      return c.json({
        period: mapPeriod(period),
        audit: audit || [],
        snapshots: snaps.filter(
          (s) => !s.orgId || s.orgId === orgId || !s.org_id || s.org_id === orgId,
        ),
        generatedAt: new Date().toISOString(),
      });
    },
  );

  app.patch(
    `${BASE}/fuel/periods/:id/step`,
    requirePermission("fuel.edit_entry"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = periodIdParam(c);
      if (!periodId) return c.json({ error: "period id required" }, 400);
      const body = await c.req.json().catch(() => ({}));
      const step = String(body.step || "").trim();
      if (!step) return c.json({ error: "step required" }, 400);
      const note = String(body.note || "").trim() || null;
      const sb = getServiceClient();
      const { error } = await sb
        .from("fuel_reconciliation_period")
        .update({ current_step: step, updated_at: new Date().toISOString() })
        .eq("id", periodId)
        .eq("org_id", orgId);
      if (error) return c.json({ error: error.message }, 500);
      const actor = actorId(c);
      await insertAudit(orgId, periodId, "step", { step, note }, actor);
      return c.json({ ok: true, currentStep: step });
    },
  );

  app.get(`${BASE}/fuel/jobs/:jobId`, requirePermission("fuel.view"), async (c: Context) => {
    const orgId = getOrgId(c);
    if (!orgId) return c.json({ error: "org required" }, 400);
    const jobId = c.req.param("jobId");
    const sb = getServiceClient();
    const { data } = await sb
      .from("fuel_period_job")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", jobId)
      .maybeSingle();
    if (data) return c.json(data);
    return c.json({ error: "Job not found" }, 404);
  });

  app.post(
    `${BASE}/fuel/period-jobs/process`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const sb = getServiceClient();
      const { data: jobs } = await sb
        .from("fuel_period_job")
        .select("*")
        .eq("org_id", orgId)
        .eq("state", "queued")
        .order("created_at", { ascending: true })
        .limit(10);
      const results = [];
      for (const job of jobs || []) {
        results.push(await processJobRow(job as any));
      }
      return c.json({ processed: results.length, results });
    },
  );

  // Cron/service: build FinalizedFuelReport snapshots from pending entries when none exist.
  app.post(`${BASE}/fuel/periods/:id/build-snapshots`, async (c: Context) => {
    const secret = c.req.header("X-Fleet-Cron-Secret") || c.req.header("x-fleet-cron-secret") || "";
    const expected = CRON_SECRET();
    const orgFromAuth = getOrgId(c);
    const cronOk = Boolean(expected && secret === expected);
    if (!cronOk && !orgFromAuth) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const periodId = periodIdParam(c);
    if (!periodId) return c.json({ error: "period id required" }, 400);
    const sb = getServiceClient();
    const { data: row } = await sb
      .from("fuel_reconciliation_period")
      .select("*")
      .eq("id", periodId)
      .maybeSingle();
    if (!row) return c.json({ error: "not_found" }, 404);
    const orgId = String(row.org_id);
    if (!cronOk && orgFromAuth && orgFromAuth !== orgId) {
      return c.json({ error: "forbidden" }, 403);
    }
    const built = await buildFuelPeriodSnapshots({
      orgId,
      weekStart: ymd(row.week_start),
      weekEnd: ymd(row.week_end),
    });
    if (!built.ok) {
      return c.json({ ok: false, error: built.error || "build_failed", snapshots: [] }, 422);
    }
    return c.json({
      ok: true,
      snapshots: built.snapshots,
      totalSpend: built.totalSpend,
    });
  });

  app.post(`${BASE}/fuel/periods/auto-close`, async (c: Context) => {
    const secret = c.req.header("X-Fleet-Cron-Secret") || c.req.header("x-fleet-cron-secret") || "";
    const expected = CRON_SECRET();
    if (!expected || secret !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const sb = getServiceClient();
    const orgParam = c.req.query("orgId") || getOrgId(c) || "";
    let orgIds: string[] = [];
    if (orgParam === "all" || orgParam === "*") {
      const { data: orgs } = await sb
        .from("fuel_reconciliation_period")
        .select("org_id")
        .in("status", ["open", "ready", "in_review", "reopened"])
        .limit(500);
      orgIds = [...new Set((orgs || []).map((r: any) => String(r.org_id)).filter(Boolean))];
    } else if (orgParam) {
      orgIds = [orgParam];
    } else {
      return c.json({ error: "orgId required (or orgId=all)" }, 400);
    }

    const EPS = 0.009; // match FUEL_SPEND_EPS client badge
    let enqueued = 0;
    let skipped = 0;
    const skipByReason: Record<string, number> = {};
    const details: Array<{ orgId: string; periodId: string; result: string }> = [];

    const bumpSkip = (orgId: string, periodId: string, result: string) => {
      skipped += 1;
      skipByReason[result] = (skipByReason[result] || 0) + 1;
      details.push({ orgId, periodId, result });
    };

    // Prefs loaded per org inside the loop (org-scoped + general fallback).

    for (const orgId of orgIds) {
      const orgPrefs = await loadOrgPreferences(orgId);
      const secondApproverThreshold = secondApproverThresholdFromPrefs(orgPrefs);
      const dualMode = resolveAutoCloseDualApprovalMode(
        orgPrefs.fuelAutoCloseDualApprovalMode,
      );

      const { data: rows } = await sb
        .from("fuel_reconciliation_period")
        .select("*")
        .eq("org_id", orgId)
        .in("status", ["open", "ready", "in_review", "reopened"])
        .limit(50);

      for (const row of rows || []) {
        const periodId = String(row.id);
        const unexplained = Math.abs(Number(row.unexplained) || 0);
        const leakageOk = unexplained <= EPS || Boolean(row.leakage_reviewed_at);
        if (!leakageOk) {
          bumpSkip(orgId, periodId, "skip_leakage");
          continue;
        }
        // C-3b: empty counts are unevaluated — write real counts then re-evaluate.
        let counts = (row.counts && typeof row.counts === "object" ? row.counts : {}) as Record<
          string,
          { actionable?: number }
        >;
        let countKeys = Object.keys(counts);
        if (countKeys.length === 0) {
          const weekEndForCounts = ymd(row.week_end) || ymd(row.week_start);
          const [exN, dispN] = await Promise.all([
            countUnackedExceptionFills(orgId, ymd(row.week_start), weekEndForCounts),
            countOpenFuelDisputes(orgId, ymd(row.week_start), weekEndForCounts),
          ]);
          const signedUnexplainedForCounts = Number(row.unexplained) || 0;
          const leakageActionable =
            Math.abs(signedUnexplainedForCounts) > EPS && !row.leakage_reviewed_at;
          counts = buildServerFuelStepCounts({
            exceptionFillCount: exN,
            openDisputeCount: dispN,
            leakageActionable,
          });
          await sb
            .from("fuel_reconciliation_period")
            .update({ counts, updated_at: new Date().toISOString() })
            .eq("id", periodId)
            .eq("org_id", orgId);
          row.counts = counts;
          countKeys = Object.keys(counts);
        }
        let actionable = 0;
        for (const v of Object.values(counts)) {
          actionable += Number(v?.actionable) || 0;
        }
        const weekStart = ymd(row.week_start);

        let snaps = ((await kv.getByPrefix(`finalized_report:${weekStart}:`)) || []).filter(
          (s: any) => !s.orgId || s.orgId === orgId || !s.org_id || s.org_id === orgId,
        ) as any[];
        let totalSpend = Number(row.total_spend) || 0;
        // Money weeks: build settleable snapshots server-side when none exist yet (Program 4).
        if (totalSpend > EPS && snaps.length === 0) {
          const built = await buildFuelPeriodSnapshots({
            orgId,
            weekStart,
            weekEnd: ymd(row.week_end),
          });
          if (!built.ok || built.snapshots.length === 0) {
            bumpSkip(
              orgId,
              periodId,
              built.error === "missing_category_costs"
                ? "skip_missing_category_costs"
                : built.error === "no_settleable_entries"
                  ? "skip_missing_snapshots"
                  : "skip_build_failed",
            );
            continue;
          }
          snaps = built.snapshots as any[];
          if (built.totalSpend > totalSpend) totalSpend = built.totalSpend;
        }

        const closableInput = await buildFuelWeekClosableInputForPeriod(orgId, row, snaps);
        const closableBlockers = evaluateFuelWeekClosable(closableInput);
        if (closableBlockers.length > 0) {
          bumpSkip(orgId, periodId, `skip_${closableBlockers[0].code}`);
          continue;
        }
        if (actionable > 0) {
          bumpSkip(orgId, periodId, "skip_actionables");
          continue;
        }

        const version = Number(row.version) || 1;
        const idempotencyKey = `finalize:${periodId}:v${version}:autoclose`;
        const { data: existing } = await sb
          .from("fuel_period_job")
          .select("id,state")
          .eq("org_id", orgId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (existing) {
          bumpSkip(orgId, periodId, `skip_existing_${existing.state}`);
          continue;
        }

        // Calendar seal: never auto-lock an in-progress Mon–Sun week.
        if (!isSettlementPeriodEnded({ weekAnchor: weekStart })) {
          bumpSkip(orgId, periodId, "skip_period_not_ended");
          continue;
        }

        const needsDual =
          secondApproverThreshold > 0 && totalSpend > secondApproverThreshold;
        let createdBy: string | null = null;
        if (needsDual) {
          if (dualMode === "skip") {
            bumpSkip(orgId, periodId, "skip_needs_approval");
            continue;
          }
          // service_approve: system approver ≠ system finalizer (SoD)
          const approver = fuelAutoCloseApproverId();
          createdBy = fuelAutoCloseFinalizerId();
          if (approver === createdBy) {
            bumpSkip(orgId, periodId, "skip_service_actor_misconfigured");
            continue;
          }
          await insertAudit(
            orgId,
            periodId,
            "second_approve",
            { source: "auto_close_service", totalSpend, secondApproverThreshold },
            approver,
          );
        }

        const { data: job } = await sb
          .from("fuel_period_job")
          .insert({
            period_id: periodId,
            org_id: orgId,
            kind: "finalize",
            state: "queued",
            idempotency_key: idempotencyKey,
            period_version: version,
            cursor: {
              snapshots: snaps,
              completedDriverIds: [],
              failures: [],
              autoClose: true,
              totalSpend,
              secondApproverThreshold,
            },
            progress_total: Math.max(snaps.length, 1),
            created_by: createdBy,
          })
          .select("*")
          .single();
        if (!job) {
          bumpSkip(orgId, periodId, "insert_failed");
          continue;
        }
        const result = await processJobRow(job as any);
        await insertAudit(
          orgId,
          periodId,
          "auto_close",
          {
            ok: result.ok,
            error: (result as any).error || null,
            failures: (result as any).failures || [],
            secondApproverThreshold,
            dualMode,
          },
          createdBy,
        );
        // In-app alert for operators (same pattern as maintenance digest — pull-based).
        try {
          const alertId = `fuel-autoclose:${orgId}:${weekStart}:${new Date().toISOString().slice(0, 10)}`;
          await kv.set(`alert:${alertId}`, {
            id: alertId,
            orgId,
            type: "fuel_period_auto_close",
            severity: result.ok ? "info" : "warning",
            title: result.ok
              ? `Fuel week ${weekStart} auto-closed`
              : `Fuel week ${weekStart} auto-close incomplete`,
            body: result.ok
              ? "Eligible week locked by scheduled auto-close."
              : `Auto-close did not finish: ${(result as any).error || "partial failure"}. Retry Finalize.`,
            createdAt: new Date().toISOString(),
            read: false,
          });
        } catch {
          /* non-fatal */
        }
        if (result.ok) enqueued += 1;
        else {
          const failKey = `failed:${(result as any).error || "unknown"}`;
          skipByReason[failKey] = (skipByReason[failKey] || 0) + 1;
          skipped += 1;
        }
        details.push({
          orgId,
          periodId,
          result: result.ok ? "locked" : `failed:${(result as any).error || "unknown"}`,
        });
      }
    }

    // Run-level digest so cron logs / operators can see why nothing locked.
    try {
      const digestId = `fuel-autoclose-digest:${new Date().toISOString().slice(0, 10)}`;
      await kv.set(`alert:${digestId}`, {
        id: digestId,
        type: "fuel_period_auto_close_digest",
        severity: enqueued > 0 ? "info" : "info",
        title: `Fuel auto-close: ${enqueued} locked, ${skipped} skipped`,
        body: `skipByReason=${JSON.stringify(skipByReason)}`,
        skipByReason,
        enqueued,
        skipped,
        createdAt: new Date().toISOString(),
        read: false,
      });
    } catch {
      /* non-fatal */
    }

    return c.json({
      ok: true,
      enqueued,
      skipped,
      skipByReason,
      orgs: orgIds.length,
      details,
    });
  });
}
