import { getServiceClient } from "./service_client.ts";
import { closeWeek } from "./week_close.ts";
import { advanceCloseWorkflow, plainComputeFailure } from "./recon_projection.ts";
import { hashDriverWeekFacts, hashVehicleWeekFacts } from "./recon_unit_hash.ts";
import { markReconWeekRunClosed } from "./week_close_recon.ts";

type WorkflowRow = {
  id: string;
  organization_id: string;
  week_key: string;
  service_line: string;
  kind: string;
  state: string;
  step: string;
  started_by: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
};

const WORKFLOW_COLUMNS =
  "id, organization_id, week_key, service_line, kind, state, step, started_by, error, result";

function recon() {
  return getServiceClient().schema("recon");
}

function weekOf(row: { week_key?: string }): string {
  return String(row.week_key || "").slice(0, 10);
}

export async function findOpenWorkflow(
  orgId: string,
  weekKey: string,
  serviceLine: string,
  kind: "refresh" | "close",
): Promise<WorkflowRow | null> {
  const { data } = await recon()
    .from("close_workflows")
    .select(WORKFLOW_COLUMNS)
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", serviceLine)
    .eq("kind", kind)
    .eq("state", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as WorkflowRow | null) ?? null;
}

export async function startWeekWorkflow(opts: {
  orgId: string;
  weekKey: string;
  serviceLine: string;
  kind: "refresh" | "close";
  actorId: string;
}): Promise<WorkflowRow> {
  const open = await findOpenWorkflow(opts.orgId, opts.weekKey, opts.serviceLine, opts.kind);
  if (open) return open;

  if (opts.kind === "refresh") {
    await getServiceClient().rpc("recon_mark_week_pending", {
      p_org: opts.orgId,
      p_week: opts.weekKey,
      p_line: opts.serviceLine,
    });
  }

  const { data, error } = await recon()
    .from("close_workflows")
    .insert({
      organization_id: opts.orgId,
      week_key: opts.weekKey,
      service_line: opts.serviceLine,
      kind: opts.kind,
      state: "running",
      step: "waiting",
      started_by: opts.actorId,
    })
    .select(WORKFLOW_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message || "Could not start the week update");
  return data as WorkflowRow;
}

async function latestShadowVerdict(): Promise<"ok" | "mismatch" | "pending"> {
  const { data } = await recon()
    .from("worker_alerts")
    .select("kind")
    .in("kind", ["shadow_ok", "shadow_mismatch", "nightly_started"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const kind = String((data as { kind?: string } | null)?.kind || "");
  if (kind === "shadow_ok") return "ok";
  if (kind === "shadow_mismatch") return "mismatch";
  return "pending";
}

async function countUnits(orgId: string, weekKey: string): Promise<{
  pending: number;
  blockers: number;
  hashMismatches: number;
}> {
  const { data: units } = await recon()
    .from("projection_state")
    .select("unit_kind, driver_id, vehicle_id, status, inputs_hash")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey);
  let pending = 0;
  let hashMismatches = 0;
  for (const row of units ?? []) {
    const status = String((row as { status?: string }).status || "");
    if (status === "pending") {
      pending += 1;
      continue;
    }
    if (status !== "fresh") continue;
    const kind = String((row as { unit_kind?: string }).unit_kind || "");
    const stored = String((row as { inputs_hash?: string }).inputs_hash || "");
    let fresh = stored;
    if (kind === "vehicle_week") {
      fresh = await hashVehicleWeekFacts(orgId, weekKey, String((row as { vehicle_id?: string }).vehicle_id || ""));
    } else if (kind === "driver_week" || kind === "courier_week") {
      fresh = await hashDriverWeekFacts(orgId, weekKey, String((row as { driver_id?: string }).driver_id || ""));
    }
    if (fresh !== stored) {
      hashMismatches += 1;
      await getServiceClient().rpc("recon_enqueue_unit", {
        p_org: orgId,
        p_kind: kind,
        p_week: weekKey,
        p_driver: (row as { driver_id?: string | null }).driver_id ?? null,
        p_vehicle: (row as { vehicle_id?: string | null }).vehicle_id ?? null,
      });
    }
  }
  const { count } = await recon()
    .from("week_blockers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("severity", "block");
  return { pending: pending + hashMismatches, blockers: count ?? 0, hashMismatches };
}

export async function advanceOneCloseWorkflow(row: WorkflowRow): Promise<WorkflowRow> {
  if (row.state !== "running") return row;
  const week = weekOf(row);
  try {
    const counts = await countUnits(row.organization_id, week);
    const step = (row.step === "freezing" ? "freezing" : row.step === "checking" ? "checking" : "waiting") as
      | "waiting"
      | "checking"
      | "blocked"
      | "freezing"
      | "done";
    const next = advanceCloseWorkflow({
      step,
      pending: counts.pending,
      hashMismatches: 0,
      blockers: counts.blockers,
    });

    if (next.step === "freezing" && row.kind === "close") {
      const shadow = await latestShadowVerdict();
      if (shadow !== "ok") {
        const waiting = shadow === "pending";
        const message = waiting
          ? "The nightly check has not cleared yet. Close stays off until it reports no differences."
          : "The nightly check found a money difference. Resolve it before closing this week.";
        const { data } = await recon()
          .from("close_workflows")
          .update({
            state: waiting ? "running" : "blocked",
            step: waiting ? "waiting" : "blocked",
            error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .select(WORKFLOW_COLUMNS)
          .single();
        return (data as WorkflowRow) ?? row;
      }
      const result = await closeWeek(row.organization_id, week, row.started_by || "recon-worker", "Closed from Week Reconciliation", {
        skipPrepare: true,
        skipEngineProbe: true,
        serviceLine: row.service_line === "rush_delivery" ? "rush_delivery" : "rideshare",
      });
      try {
        await markReconWeekRunClosed(
          row.organization_id,
          week,
          row.service_line === "rush_delivery" ? "rush_delivery" : "rideshare",
          row.started_by || "recon-worker",
        );
      } catch (e) {
        console.warn("[recon] mark run closed failed", e);
      }
      const state = result.closed ? "succeeded" : "blocked";
      const { data } = await recon()
        .from("close_workflows")
        .update({
          state,
          step: result.closed ? "done" : "blocked",
          result: result as unknown as Record<string, unknown>,
          error: result.closed ? null : "This week still has something to fix before it can close.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select(WORKFLOW_COLUMNS)
        .single();
      return (data as WorkflowRow) ?? row;
    }

    if (next.step === "freezing" && row.kind === "refresh") {
      const { data } = await recon()
        .from("close_workflows")
        .update({
          state: "succeeded",
          step: "done",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select(WORKFLOW_COLUMNS)
        .single();
      return (data as WorkflowRow) ?? row;
    }

    const { data } = await recon()
      .from("close_workflows")
      .update({
        state: next.state === "succeeded" ? "succeeded" : next.state === "blocked" ? "blocked" : "running",
        step: next.step,
        error: next.state === "blocked" ? "This week still has something to fix before it can close." : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select(WORKFLOW_COLUMNS)
      .single();
    return (data as WorkflowRow) ?? row;
  } catch (e) {
    const message = plainComputeFailure(e instanceof Error ? e.message : "Close failed");
    await recon()
      .from("close_workflows")
      .update({ state: "failed", step: "blocked", error: message, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ...row, state: "failed", step: "blocked", error: message };
  }
}

export async function loadWorkflow(id: string): Promise<WorkflowRow | null> {
  const { data } = await recon()
    .from("close_workflows")
    .select(WORKFLOW_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as WorkflowRow | null) ?? null;
}

export async function advanceOpenCloseWorkflows(limit = 1): Promise<number> {
  const { data } = await recon()
    .from("close_workflows")
    .select(WORKFLOW_COLUMNS)
    .eq("state", "running")
    .order("started_at", { ascending: true })
    .limit(limit);
  let n = 0;
  for (const row of (data ?? []) as WorkflowRow[]) {
    await advanceOneCloseWorkflow(row);
    n += 1;
  }
  return n;
}
