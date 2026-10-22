/**
 * Host decision (Phase 0.4): one driver-week already costs 2–4 seconds of CPU
 * in production, past the 1 second edge budget. The loop that keeps the queue
 * under a minute runs in scripts/recon-worker.ts. Page routes do not import
 * this file. Default host: container.
 */
import { getServiceClient } from "./service_client.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  allocateSharedCost,
  netCourierPayout,
  tollClosingBalance,
} from "../../../packages/finance-core/src/courierWeekMoney.ts";
import { checkCloseInvariants } from "../../../packages/finance-core/src/closeInvariants.ts";
import {
  assembleCloseInvariantInput,
  earningsStatementForClose,
  fuelStatementForClose,
  tollStatementForClose,
} from "../../../packages/finance-core/src/closeInvariantInput.ts";
import {
  DRIVER_SHADOW_MONEY_FIELDS,
  VEHICLE_SHADOW_MONEY_FIELDS,
  diffShadowMoney,
} from "../../../packages/finance-core/src/shadowMoney.ts";
import { hasPendingRestatementDrafts, mapRowToWeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";
import { engineDriftsToCloseBlockers } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import type { StatementEngineDrift } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import { prepareFuelWeekReports } from "./fuel_week_prepare.ts";
import { rebuildOneDriverPeriod } from "./driver_financial_periods.ts";
import { loadWeekCloseReconContext } from "./week_close_recon.ts";
import { hashDriverWeekFacts, hashVehicleWeekFacts } from "./recon_unit_hash.ts";
import { nextAttemptStatus, plainComputeFailure } from "./recon_projection.ts";
import { listOpenFinanceReconDrifts } from "./finance_recon_drift.ts";
import { advanceOpenCloseWorkflows } from "./recon_close_workflow.ts";
import { logReconPhase } from "./recon_phase_log.ts";
import { isPeriodFrozen } from "./settlement_period_freeze.ts";
import { summarizeTollUsageOrphansByDriverForWeek } from "./toll_financial_reset.ts";

export const RECON_WORKER_HOST_DECISION = "container" as const;

type UnitMessage = {
  organizationId?: string;
  unitKind?: string;
  weekKey?: string;
  driverId?: string | null;
  vehicleId?: string | null;
  /** Set by the nightly pass so a recompute can be compared to the last result. */
  reason?: string | null;
};

function sb() {
  return getServiceClient();
}

function recon() {
  return sb().schema("recon");
}

function mode(): "shadow" | "live" {
  return Deno.env.get("RECON_PROJECTION_MODE") === "shadow" ? "shadow" : "live";
}

function unitQuery(
  msg: UnitMessage,
) {
  const weekKey = String(msg.weekKey || "").slice(0, 10);
  let query = recon()
    .from("projection_state")
    .select("attempts")
    .eq("organization_id", String(msg.organizationId || ""))
    .eq("unit_kind", String(msg.unitKind || ""))
    .eq("week_key", weekKey);
  query = msg.driverId ? query.eq("driver_id", msg.driverId) : query.is("driver_id", null);
  query = msg.vehicleId ? query.eq("vehicle_id", msg.vehicleId) : query.is("vehicle_id", null);
  return query;
}

async function bumpFailure(msg: UnitMessage, error: string): Promise<"pending" | "failed"> {
  const { data } = await unitQuery(msg).maybeSingle();
  const attempts = Number((data as { attempts?: number } | null)?.attempts || 0) + 1;
  const status = nextAttemptStatus(attempts);
  let update = recon()
    .from("projection_state")
    .update({
      attempts,
      status,
      last_error: plainComputeFailure(error),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", String(msg.organizationId || ""))
    .eq("unit_kind", String(msg.unitKind || ""))
    .eq("week_key", String(msg.weekKey || "").slice(0, 10));
  update = msg.driverId ? update.eq("driver_id", msg.driverId) : update.is("driver_id", null);
  update = msg.vehicleId ? update.eq("vehicle_id", msg.vehicleId) : update.is("vehicle_id", null);
  await update;
  return status;
}

async function markFresh(msg: UnitMessage, inputsHash: string): Promise<void> {
  let update = recon()
    .from("projection_state")
    .update({
      status: "fresh",
      inputs_hash: inputsHash,
      computed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", msg.organizationId)
    .eq("unit_kind", msg.unitKind)
    .eq("week_key", String(msg.weekKey || "").slice(0, 10));
  update = msg.driverId ? update.eq("driver_id", msg.driverId) : update.is("driver_id", null);
  update = msg.vehicleId ? update.eq("vehicle_id", msg.vehicleId) : update.is("vehicle_id", null);
  await update;
}

async function enqueueUnit(
  orgId: string,
  kind: string,
  weekKey: string,
  driverId: string | null,
  vehicleId: string | null,
  reason: string | null,
): Promise<void> {
  const { error } = await sb().rpc("recon_enqueue_unit", {
    p_org: orgId,
    p_kind: kind,
    p_week: weekKey,
    p_driver: driverId,
    p_vehicle: vehicleId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

/** Nightly-only. Resolves cleared shadow rows and does not touch engine drifts. */
async function syncShadowMoney(opts: {
  organizationId: string;
  driverId: string;
  weekKey: string;
  kind: "fuel" | "earnings";
  deltas: Array<{ field: string; previous: number; next: number }>;
}): Promise<void> {
  const now = new Date().toISOString();
  const openFields = new Set<string>();
  for (const delta of opts.deltas) {
    const field = `shadow_${delta.field}`;
    openFields.add(field);
    const { error } = await sb().from("finance_recon_drift").upsert({
      organization_id: opts.organizationId,
      driver_id: opts.driverId,
      week_key: opts.weekKey,
      kind: opts.kind,
      field,
      statement_minor: Math.round(delta.previous * 100),
      engine_minor: Math.round(delta.next * 100),
      delta_minor: Math.round((delta.previous - delta.next) * 100),
      status: "open",
      source: "shadow",
      detected_at: now,
      resolved_at: null,
    }, { onConflict: "organization_id,driver_id,week_key,kind,field" });
    if (error) throw new Error(error.message);
  }
  const { data: openRows, error: loadErr } = await sb()
    .from("finance_recon_drift")
    .select("id, field")
    .eq("organization_id", opts.organizationId)
    .eq("driver_id", opts.driverId)
    .eq("week_key", opts.weekKey)
    .eq("kind", opts.kind)
    .eq("source", "shadow")
    .eq("status", "open");
  if (loadErr) throw new Error(loadErr.message);
  for (const row of openRows ?? []) {
    if (openFields.has(String((row as { field?: string }).field || ""))) continue;
    await sb()
      .from("finance_recon_drift")
      .update({ status: "resolved", resolved_at: now })
      .eq("id", (row as { id: string }).id);
  }
}

async function writeDriverBlockers(orgId: string, weekKey: string, driverId: string, serviceLine: "rideshare" | "rush_delivery") {
  const period = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("period_anchor", weekKey)
    .maybeSingle();
  const { data: statementRows } = await sb()
    .from("week_statements")
    .select("*")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("week_key", weekKey);
  const byKind = new Map<string, ReturnType<typeof mapRowToWeekStatement>>();
  for (const row of statementRows ?? []) {
    const statement = mapRowToWeekStatement(row as Record<string, unknown>);
    byKind.set(statement.kind, statement);
  }
  const statements = [...byKind.values()];
  const row = (period.data ?? null) as Record<string, unknown> | null;
  const meta = (row?.metadata as Record<string, unknown> | null) ?? null;
  const fc = (meta?.financeCore as Record<string, unknown> | undefined) || {};
  const acceptRestatementDrafts = Boolean(row) && isPeriodFrozen({
    metadata: meta,
    settlementStatus: row?.settlement_status != null ? String(row.settlement_status) : null,
    signedAt: fc.signedAt != null ? String(fc.signedAt) : null,
    status: row?.status != null ? String(row.status) : null,
    closedAt: row?.closed_at != null ? String(row.closed_at) : null,
  }) && hasPendingRestatementDrafts(statements);

  const stored = await listOpenFinanceReconDrifts(orgId, weekKey);
  const drifts: StatementEngineDrift[] = stored
    .filter((item) => item.driver_id === driverId)
    .map((item) => ({
      kind: item.kind,
      field: item.field,
      statementMinor: Number(item.statement_minor) || 0,
      engineMinor: Number(item.engine_minor) || 0,
      deltaMinor: Number(item.delta_minor) || 0,
    }));
  const engineDrifts = drifts.length
    ? engineDriftsToCloseBlockers(drifts, { driverId, week: weekKey })
    : [];

  let tollEventLedger: ReturnType<typeof assembleCloseInvariantInput>["tollEventLedger"] = null;
  try {
    const orphans = await summarizeTollUsageOrphansByDriverForWeek(weekKey);
    const sum = orphans.get(driverId);
    tollEventLedger = sum
      ? {
        orphanCount: sum.orphanCount,
        orphanAmountMajor: sum.orphanAmountMajor,
        eventSpendMajor: sum.eventSpendMajor,
        ledgerSpendMajor: sum.ledgerSpendMajor,
        missingEventCount: sum.missingEventCount,
        missingEventAmountMajor: sum.missingEventAmountMajor,
        ineligibleEventCount: sum.ineligibleEventCount,
        ineligibleEventAmountMajor: sum.ineligibleEventAmountMajor,
        amountMismatchCount: sum.amountMismatchCount,
        amountMismatchAmountMajor: sum.amountMismatchAmountMajor,
      }
      : null;
  } catch (e) {
    console.warn("[recon] toll event ledger skipped", e);
  }

  const blockers = row
    ? checkCloseInvariants(assembleCloseInvariantInput({
      period: row as never,
      fuelStatement: fuelStatementForClose(byKind.get("fuel"), acceptRestatementDrafts),
      tollStatement: tollStatementForClose(byKind.get("toll"), acceptRestatementDrafts),
      earningsStatement: earningsStatementForClose(byKind.get("earnings"), acceptRestatementDrafts),
      skipSettlementDeskClear: acceptRestatementDrafts,
      engineDrifts,
      tollEventLedger,
    }))
    : [];
  await recon()
    .from("week_blockers")
    .delete()
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", serviceLine)
    .eq("driver_id", driverId);
  if (blockers.length) {
    await recon().from("week_blockers").insert(blockers.map((blocker) => ({
      organization_id: orgId,
      week_key: weekKey,
      service_line: serviceLine,
      driver_id: driverId,
      code: blocker.code,
      severity: blocker.severity,
      fingerprint: `${blocker.code}:${driverId}`,
      message: blocker.message,
    })));
  }
  const context = await loadWeekCloseReconContext(orgId, weekKey, serviceLine);
  await recon()
    .from("week_blockers")
    .delete()
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", serviceLine)
    .is("driver_id", null);
  if (context.sourceBlockers.length) {
    await recon().from("week_blockers").insert(context.sourceBlockers.map((blocker) => ({
      organization_id: orgId,
      week_key: weekKey,
      service_line: serviceLine,
      driver_id: null,
      code: blocker.code,
      severity: blocker.severity,
      fingerprint: blocker.code,
      message: blocker.message,
    })));
  }
}

async function processVehicle(msg: UnitMessage): Promise<void> {
  const orgId = String(msg.organizationId || "");
  const weekKey = String(msg.weekKey || "").slice(0, 10);
  const vehicleId = String(msg.vehicleId || "");
  const started = Date.now();
  const prepared = await prepareFuelWeekReports({
    orgId,
    weekStart: weekKey,
    weekEnd: periodEndForAnchor(weekKey),
    vehicleId,
    persistDistance: mode() === "live",
  });
  logReconPhase("worker_vehicle_week", started, {
    orgId,
    weekKey,
    vehicleId,
    rows: prepared.reports.length,
  });
  if (!prepared.ok) throw new Error(prepared.error || "Fuel week could not be calculated");
  const hash = await hashVehicleWeekFacts(orgId, weekKey, vehicleId);
  const { data: previous } = await recon()
    .from("fuel_vehicle_week_shadow")
    .select("payload")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("vehicle_id", vehicleId)
    .maybeSingle();
  const priorPayload = (previous as { payload?: { totalSpend?: number } } | null)?.payload ?? null;
  if (msg.reason === "nightly") {
    await syncShadowMoney({
      organizationId: orgId,
      driverId: vehicleId,
      weekKey,
      kind: "fuel",
      deltas: diffShadowMoney(
        priorPayload ? { totalSpend: priorPayload.totalSpend } : null,
        { totalSpend: prepared.totalSpend },
        VEHICLE_SHADOW_MONEY_FIELDS,
      ),
    });
  }
  await recon().from("fuel_vehicle_week_shadow").upsert({
    organization_id: orgId,
    week_key: weekKey,
    vehicle_id: vehicleId,
    inputs_hash: hash,
    payload: { reports: prepared.reports, totalSpend: prepared.totalSpend },
    computed_at: new Date().toISOString(),
  }, { onConflict: "organization_id,week_key,vehicle_id" });
  await markFresh(msg, hash);
}

async function processDriver(msg: UnitMessage): Promise<void> {
  const orgId = String(msg.organizationId || "");
  const weekKey = String(msg.weekKey || "").slice(0, 10);
  const driverId = String(msg.driverId || "");
  const started = Date.now();
  const row = await rebuildOneDriverPeriod(driverId, weekKey);
  logReconPhase("worker_driver_week", started, { orgId, weekKey, driverId });
  const hash = await hashDriverWeekFacts(orgId, weekKey, driverId);
  const { data: previous } = await recon()
    .from("driver_week_shadow")
    .select("payload")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("driver_id", driverId)
    .maybeSingle();
  if (msg.reason === "nightly") {
    await syncShadowMoney({
      organizationId: orgId,
      driverId,
      weekKey,
      kind: "earnings",
      deltas: diffShadowMoney(
        (previous as { payload?: Record<string, unknown> } | null)?.payload ?? null,
        row as unknown as Record<string, unknown>,
        DRIVER_SHADOW_MONEY_FIELDS,
      ),
    });
  }
  await recon().from("driver_week_shadow").upsert({
    organization_id: orgId,
    week_key: weekKey,
    driver_id: driverId,
    inputs_hash: hash,
    payload: row as unknown as Record<string, unknown>,
    computed_at: new Date().toISOString(),
  }, { onConflict: "organization_id,week_key,driver_id" });
  await writeDriverBlockers(orgId, weekKey, driverId, "rideshare");
  await markFresh(msg, hash);
}

async function processCourier(msg: UnitMessage): Promise<void> {
  const orgId = String(msg.organizationId || "");
  const weekKey = String(msg.weekKey || "").slice(0, 10);
  const courierId = String(msg.driverId || "");
  const end = periodEndForAnchor(weekKey);
  const [rideshare, delivery, period, previous] = await Promise.all([
    sb().from("fleet_trips").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("driver_id", courierId)
      .eq("service_line", "rideshare").gte("date", weekKey).lte("date", end),
    sb().from("fleet_trips").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("driver_id", courierId)
      .eq("service_line", "rush_delivery").gte("date", weekKey).lte("date", end),
    sb().from("driver_financial_periods").select("driver_share, fuel_fleet_share, toll_charged_to_driver, toll_spend")
      .eq("driver_id", courierId).eq("period_anchor", weekKey).maybeSingle(),
    recon().from("courier_week_result").select("toll_closing")
      .eq("organization_id", orgId).eq("courier_id", courierId)
      .lt("week_key", weekKey).order("week_key", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const shared = allocateSharedCost(Number(period.data?.fuel_fleet_share) || 0, {
    rideshare: rideshare.count ?? 0,
    delivery: delivery.count ?? 0,
  });
  const net = netCourierPayout(
    Number(period.data?.driver_share) || 0,
    shared.delivery,
    Number(period.data?.toll_charged_to_driver) || 0,
  );
  const tollClosing = tollClosingBalance(
    Number((previous.data as { toll_closing?: number } | null)?.toll_closing) || 0,
    0,
    Number(period.data?.toll_spend) || 0,
  );
  const hash = await hashDriverWeekFacts(orgId, weekKey, courierId);
  await recon().from("courier_week_result").upsert({
    organization_id: orgId,
    week_key: weekKey,
    courier_id: courierId,
    shared_cost: shared.delivery,
    net_payout: net,
    toll_closing: tollClosing,
    inputs_hash: hash,
    payload: { shared, net, tollClosing },
    computed_at: new Date().toISOString(),
  }, { onConflict: "organization_id,week_key,courier_id" });
  await writeDriverBlockers(orgId, weekKey, courierId, "rush_delivery");
  await markFresh(msg, hash);
}

async function processOne(msg: UnitMessage): Promise<void> {
  if (msg.unitKind === "vehicle_week") return processVehicle(msg);
  if (msg.unitKind === "courier_week") return processCourier(msg);
  return processDriver(msg);
}

export async function processReconQueueBatch(qty = 1): Promise<{ processed: number }> {
  const { data, error } = await sb().rpc("recon_read_recompute_batch", { p_qty: qty, p_vt: 300 });
  if (error) {
    console.warn("[recon] queue read failed", error.message);
    return { processed: 0 };
  }
  let processed = 0;
  for (const row of (data ?? []) as Array<{ msg_id: number; message: UnitMessage }>) {
    const message = row.message || {};
    try {
      await processOne(message);
      await sb().rpc("recon_archive_recompute", { p_msg_id: row.msg_id });
      processed += 1;
    } catch (e) {
      const status = await bumpFailure(message, e instanceof Error ? e.message : "update failed");
      if (status === "failed") {
        await sb().rpc("recon_archive_recompute", { p_msg_id: row.msg_id });
      }
    }
  }
  return { processed };
}

export async function runNightlyIntegrity(): Promise<{
  enqueued: number;
  alerts: string[];
  startedAt: string;
  weekKeys: string[];
}> {
  const startedAt = new Date().toISOString();
  const alerts: string[] = [];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 120);
  const sinceKey = since.toISOString().slice(0, 10);
  const { data: periods } = await sb()
    .from("driver_financial_periods")
    .select("organization_id, driver_id, period_anchor, status")
    .gte("period_anchor", sinceKey)
    .limit(5000);
  const closedByOrg = new Map<string, string[]>();
  const weekKeys = new Set<string>();
  let enqueued = 0;
  for (const row of periods ?? []) {
    const orgId = String((row as { organization_id?: string }).organization_id || "");
    const driverId = String((row as { driver_id?: string }).driver_id || "");
    const weekKey = String((row as { period_anchor?: string }).period_anchor || "").slice(0, 10);
    const status = String((row as { status?: string }).status || "");
    if (!orgId || !driverId || !weekKey) continue;
    if (status === "closed") {
      const list = closedByOrg.get(orgId) ?? [];
      if (!list.includes(weekKey)) list.push(weekKey);
      closedByOrg.set(orgId, list);
      continue;
    }
    await enqueueUnit(orgId, "driver_week", weekKey, driverId, null, "nightly");
    weekKeys.add(weekKey);
    enqueued += 1;
  }
  for (const [orgId, weeks] of closedByOrg) {
    const recent = weeks.sort().slice(-4);
    for (const weekKey of recent) {
      weekKeys.add(weekKey);
      for (const row of periods ?? []) {
        if (String((row as { organization_id?: string }).organization_id) !== orgId) continue;
        if (String((row as { period_anchor?: string }).period_anchor || "").slice(0, 10) !== weekKey) continue;
        if (String((row as { status?: string }).status) !== "closed") continue;
        await enqueueUnit(
          orgId,
          "driver_week",
          weekKey,
          String((row as { driver_id?: string }).driver_id || ""),
          null,
          "nightly",
        );
        enqueued += 1;
      }
    }
  }

  const keys = [...weekKeys];
  if (keys.length) {
    const { data: vehicles } = await recon()
      .from("projection_state")
      .select("organization_id, week_key, vehicle_id")
      .eq("unit_kind", "vehicle_week")
      .in("week_key", keys);
    for (const vehicle of vehicles ?? []) {
      const orgId = String((vehicle as { organization_id?: string }).organization_id || "");
      const weekKey = String((vehicle as { week_key?: string }).week_key || "").slice(0, 10);
      const vehicleId = String((vehicle as { vehicle_id?: string }).vehicle_id || "");
      if (!orgId || !weekKey || !vehicleId) continue;
      await enqueueUnit(orgId, "vehicle_week", weekKey, null, vehicleId, "nightly");
      enqueued += 1;
    }
  }

  const { data: health } = await sb().rpc("recon_queue_health");
  const oldest = Number((health as { oldestSeconds?: number } | null)?.oldestSeconds || 0);
  const failed = Number((health as { failedUnits?: number } | null)?.failedUnits || 0);
  if (oldest > 300) alerts.push("queue_older_than_5_minutes");
  if (failed > 0) alerts.push("dead_letter");
  const { data: cpu } = await recon()
    .from("projection_state")
    .select("id")
    .ilike("last_error", "%compute resources%")
    .limit(1);
  if ((cpu ?? []).length > 0) alerts.push("cpu_shutdown");
  for (const kind of alerts) {
    await recon().from("worker_alerts").insert({ kind, detail: health ?? {} });
    console.error(JSON.stringify({ reconAlert: kind, health }));
  }
  await recon().from("worker_alerts").insert({
    kind: "nightly_started",
    detail: { startedAt, enqueued, weekKeys: keys },
  });
  return { enqueued, alerts, startedAt, weekKeys: keys };
}

/** Call once the nightly queue has drained. Writes shadow_ok or shadow_mismatch. */
export async function finishNightlyIntegrity(
  startedAt: string,
  weekKeys: string[],
): Promise<{ mismatches: number; drained: boolean }> {
  const { data: health } = await sb().rpc("recon_queue_health");
  const oldest = (health as { oldestSeconds?: number | null } | null)?.oldestSeconds;
  if (oldest != null && Number(oldest) > 0) return { mismatches: -1, drained: false };

  let mismatches = 0;
  if (weekKeys.length) {
    const { count, error } = await sb()
      .from("finance_recon_drift")
      .select("id", { count: "exact", head: true })
      .eq("source", "shadow")
      .eq("status", "open")
      .in("week_key", weekKeys);
    if (error) throw new Error(error.message);
    mismatches = count ?? 0;
    const { count: failedUnits, error: failedErr } = await recon()
      .from("projection_state")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .in("week_key", weekKeys);
    if (failedErr) throw new Error(failedErr.message);
    mismatches += failedUnits ?? 0;
  }
  const kind = mismatches > 0 ? "shadow_mismatch" : "shadow_ok";
  await recon().from("worker_alerts").insert({
    kind,
    detail: { startedAt, mismatches, weekKeys },
  });
  if (mismatches > 0) console.error(JSON.stringify({ reconAlert: kind, mismatches, startedAt }));
  return { mismatches, drained: true };
}

export async function runReconWorkerTick(qty = 1): Promise<{ processed: number; workflows: number }> {
  const processed = await processReconQueueBatch(qty);
  const workflows = await advanceOpenCloseWorkflows(1);
  return { processed: processed.processed, workflows };
}
