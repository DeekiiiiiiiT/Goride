/**
 * Server-owned Consumption Reconciliation periods — SQL read model + finalize jobs.
 * Finalize job persists finalized_report snapshots + ledger (cursor-resumable).
 */
import type { Context } from "npm:hono";
import type { Hono } from "npm:hono";
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

const BASE = "/make-server-37f42386";
const CRON_SECRET = () => Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("CRON_SECRET") || "";

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

function finalizedReportKey(weekKey: string, driverId: string): string {
  return `finalized_report:${weekKey}:${driverId}`;
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
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    reopenedAt: row.reopened_at,
    reopenReason: row.reopen_reason,
    computedAt: row.computed_at,
    computedFromHash: row.computed_from_hash,
  };
}

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
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

/** Persist one driver-week: reverse prior wallet → settle → KV snapshot → ledger. */
async function persistFinalizedSnapshot(
  report: Record<string, any>,
  orgId: string,
  actor: string | null,
): Promise<void> {
  const weekKey = ymd(report.weekStart);
  const driverId = String(report.driverId || "");
  if (!weekKey || !driverId) throw new Error("snapshot missing weekStart/driverId");
  const key = finalizedReportKey(weekKey, driverId);
  // Always reverse then settle so job resume / re-finalize cannot double-post wallet txs.
  await reverseEnterpriseFuelSyncForSnapshot(report);
  await settleEnterpriseFuelFromSnapshot(report, orgId);
  const stamped = {
    ...report,
    orgId,
    org_id: orgId,
    status: report.status || "Finalized",
    finalizedAt: report.finalizedAt || new Date().toISOString(),
    finalizedByUserId: actor,
  };
  await kv.set(key, stamped);
  await postFuelFinalizedEventsFromReport(stamped);
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
    const threshold = Number(cursor.secondApproverThreshold) || 0;
    const totalSpend = Number(cursor.totalSpend) || Number(period.total_spend) || 0;
    if (threshold > 0 && totalSpend > threshold) {
      const { data: approvals } = await sb
        .from("fuel_period_audit")
        .select("actor_id,action")
        .eq("period_id", periodId)
        .eq("org_id", orgId)
        .eq("action", "second_approve")
        .order("at", { ascending: false })
        .limit(5);
      const other = (approvals || []).find(
        (a: any) => a.actor_id && actor && String(a.actor_id) !== String(actor),
      );
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

    const snapshots = Array.isArray(cursor.snapshots) ? (cursor.snapshots as any[]) : [];
    const completed: string[] = Array.isArray(cursor.completedDriverIds)
      ? (cursor.completedDriverIds as string[])
      : [];
    // Rebuild failures each run so a resumed retry of a previously-failed driver can clear.
    const failures: Array<{ driverId: string; error: string }> = [];
    const done = new Set(completed);

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
    await insertAudit(
      orgId,
      periodId,
      "finalize",
      {
        version: nextVersion,
        driversDone: [...done],
        failures,
        gapAccepted: Boolean(period.leakage_reviewed_at),
      },
      actor,
    );
  } else if (kind === "reopen") {
    const reason = String(cursor.reason || "");
    const weekStart = ymd(period.week_start);
    const snaps = ((await kv.getByPrefix(`finalized_report:${weekStart}:`)) || []) as any[];
    for (const snap of snaps) {
      if (snap?.orgId && snap.orgId !== orgId && snap.org_id && snap.org_id !== orgId) continue;
      try {
        await reverseEnterpriseFuelSyncForSnapshot(snap);
        await reverseFuelFinancialEventsForWeek(
          String(snap.driverId),
          weekStart,
          "fuel_period_reopen",
        );
      } catch (e) {
        console.warn("[fuel_period] reopen reverse failed", snap?.driverId, e);
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
        version: nextVersion,
        updated_at: now,
      })
      .eq("id", periodId)
      .eq("org_id", orgId);
    await insertAudit(orgId, periodId, "reopen", { reason, version: nextVersion }, actor);
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
    const row = await loadPeriod(orgId, c.req.param("id"));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(mapPeriod(row));
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
      const sb = getServiceClient();
      const all = ((await kv.getByPrefix("finalized_report:")) || []) as any[];
      const byWeek = new Map<string, any[]>();
      for (const snap of all) {
        const snapOrg = snap.orgId || snap.org_id;
        if (snapOrg && snapOrg !== orgId) continue;
        const wk = ymd(snap.weekStart || snap.week_start);
        if (!wk) continue;
        const list = byWeek.get(wk) || [];
        list.push(snap);
        byWeek.set(wk, list);
      }
      let upserted = 0;
      for (const [weekStart, snaps] of byWeek) {
        const weekEnd = ymd(snaps[0]?.weekEnd || snaps[0]?.week_end) || weekStart;
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
        if (!error) upserted += 1;
      }
      return c.json({ ok: true, upserted, weeks: byWeek.size });
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
            status: existing?.status || "locked",
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
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const sb = getServiceClient();
      const now = new Date().toISOString();
      const patch = {
        total_spend: Number(body.totalSpend) || 0,
        gas_card_spend: Number(body.gasCardSpend) || 0,
        cash_from_earnings: Number(body.cashFromEarnings) || 0,
        company_share: Number(body.companyShare) || 0,
        driver_share: Number(body.driverShare) || 0,
        unexplained: Number(body.unexplained) || 0,
        vehicle_count: Number(body.vehicleCount) || 0,
        driver_count: Number(body.driverCount) || 0,
        computed_at: now,
        computed_from_hash: String(body.computedFromHash || `client:${now}`),
        updated_at: now,
      };
      let row = await loadPeriod(orgId, periodId);
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
      }
      await insertAudit(orgId, String(row.id), "materialize", patch, actorId(c));
      return c.json({ ok: true, period: mapPeriod(row as any) });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/finalize`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = c.req.param("id");
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const ifMatch = c.req.header("If-Match");
      if (ifMatch != null && ifMatch !== "" && Number(ifMatch) !== Number(period.version)) {
        return c.json({ error: "version_conflict", currentVersion: period.version }, 409);
      }
      const body = await c.req.json().catch(() => ({}));
      const snapshots = Array.isArray(body.snapshots) ? body.snapshots : [];
      const idempotencyKey =
        c.req.header("Idempotency-Key") ||
        `finalize:${periodId}:v${Number(period.version) || 1}`;
      const sb = getServiceClient();
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
      const actor = actorId(c);
      // Program 4: UI service_only — record system second_approve before finalize if needed
      const orgPrefs = await loadOrgPreferences(orgId);
      const uiMode = resolveDualApprovalUiMode(orgPrefs.fuelDualApprovalUiMode);
      const thr =
        Number(body.secondApproverThreshold) ||
        secondApproverThresholdFromPrefs(orgPrefs);
      const spend = Number(body.totalSpend) || Number(period.total_spend) || 0;
      if (uiMode === "service_only" && thr > 0 && spend > thr && actor) {
        const approver = fuelAutoCloseApproverId();
        if (approver !== actor) {
          await insertAudit(
            orgId,
            periodId,
            "second_approve",
            { source: "ui_service_approve", totalSpend: spend, secondApproverThreshold: thr },
            approver,
          );
        }
      }
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
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = c.req.param("id");
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
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = c.req.param("id");
      const body = await c.req.json().catch(() => ({}));
      const note = String(body.note || "").trim() || null;
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
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
      await insertAudit(orgId, periodId, "leakage_review", { note }, actor);
      return c.json({ ok: true, leakageReviewedAt: now });
    },
  );

  app.post(
    `${BASE}/fuel/periods/:id/second-approve`,
    requirePermission("transactions.edit"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = c.req.param("id");
      const period = await loadPeriod(orgId, periodId);
      if (!period) return c.json({ error: "Not found" }, 404);
      const actor = actorId(c);
      if (!actor) return c.json({ error: "actor required" }, 401);
      const body = await c.req.json().catch(() => ({}));
      await insertAudit(orgId, periodId, "second_approve", { note: body.note || null }, actor);
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
      const periodId = c.req.param("id");
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
    requirePermission("fuel.view"),
    async (c: Context) => {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "org required" }, 400);
      const periodId = c.req.param("id");
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
    const periodId = c.req.param("id");
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
        // Mirror client actionableTotal when counts jsonb is present
        const counts = (row.counts && typeof row.counts === "object" ? row.counts : {}) as Record<
          string,
          { actionable?: number }
        >;
        let actionable = 0;
        for (const v of Object.values(counts)) {
          actionable += Number(v?.actionable) || 0;
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
              built.error === "no_settleable_entries"
                ? "skip_missing_snapshots"
                : "skip_build_failed",
            );
            continue;
          }
          snaps = built.snapshots as any[];
          if (built.totalSpend > totalSpend) totalSpend = built.totalSpend;
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
