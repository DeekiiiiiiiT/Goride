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
    const failures: Array<{ driverId: string; error: string }> = Array.isArray(cursor.failures)
      ? (cursor.failures as any[])
      : [];
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

    if (failures.length > 0 && done.size === 0) {
      await sb
        .from("fuel_period_job")
        .update({ state: "failed", failures, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      return { ok: false, error: "all_drivers_failed", failures };
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
        if (existing.state === "queued" || existing.state === "running") {
          const result = await processJobRow(existing as any);
          return c.json(
            { jobId: existing.id, state: result.ok ? "succeeded" : "failed", ...result },
            202,
          );
        }
        return c.json({ jobId: existing.id, state: existing.state }, 202);
      }
      const actor = actorId(c);
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
            secondApproverThreshold: body.secondApproverThreshold,
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

  app.post(`${BASE}/fuel/periods/auto-close`, async (c: Context) => {
    const secret = c.req.header("X-Fleet-Cron-Secret") || "";
    const expected = CRON_SECRET();
    if (!expected || secret !== expected) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const orgId = c.req.query("orgId") || getOrgId(c);
    if (!orgId) return c.json({ error: "orgId required" }, 400);
    const sb = getServiceClient();
    const { data: rows } = await sb
      .from("fuel_reconciliation_period")
      .select("*")
      .eq("org_id", orgId)
      .in("status", ["open", "ready", "in_review", "reopened"])
      .limit(50);
    let enqueued = 0;
    for (const row of rows || []) {
      const unexplained = Math.abs(Number(row.unexplained) || 0);
      if (unexplained > 0.02 && !row.leakage_reviewed_at) continue;
      const periodId = String(row.id);
      const version = Number(row.version) || 1;
      const idempotencyKey = `finalize:${periodId}:v${version}:autoclose`;
      const { data: existing } = await sb
        .from("fuel_period_job")
        .select("id")
        .eq("org_id", orgId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) continue;
      const weekStart = ymd(row.week_start);
      const snaps = ((await kv.getByPrefix(`finalized_report:${weekStart}:`)) || []) as any[];
      if (!snaps.length) continue;
      const { data: job } = await sb
        .from("fuel_period_job")
        .insert({
          period_id: periodId,
          org_id: orgId,
          kind: "finalize",
          state: "queued",
          idempotency_key: idempotencyKey,
          period_version: version,
          cursor: { snapshots: snaps, completedDriverIds: [], failures: [], autoClose: true },
          progress_total: snaps.length,
        })
        .select("*")
        .single();
      if (job) {
        await processJobRow(job as any);
        enqueued += 1;
      }
    }
    return c.json({ ok: true, enqueued });
  });
}
