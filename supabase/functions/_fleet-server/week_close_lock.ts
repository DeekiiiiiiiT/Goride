/**
 * C-3: org-week close mutual exclusion + idempotent close-run storage.
 * Uses ledger.week_close_locks / week_close_runs via SECURITY DEFINER RPCs.
 */
import { getServiceClient } from "./service_client.ts";

function sb() {
  return getServiceClient();
}

/** Stored close outcome (matches CloseWeekResult shape; kept loose to avoid cycles). */
export type WeekCloseRunResult = Record<string, unknown>;

/** Default lock TTL — stale claims are reclaimable after this. */
export const WEEK_CLOSE_LOCK_TTL_SECONDS = 120;

export async function tryClaimWeekCloseLock(
  orgId: string,
  weekKey: string,
  actorId: string,
  ttlSeconds = WEEK_CLOSE_LOCK_TTL_SECONDS,
): Promise<boolean> {
  const { data, error } = await sb().rpc("try_claim_week_close", {
    p_org_id: orgId,
    p_week_key: weekKey,
    p_actor: actorId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    console.warn("[week_close_lock] claim failed", error.message);
    throw new Error(`week close lock claim failed: ${error.message}`);
  }
  return data === true;
}

export async function releaseWeekCloseLock(
  orgId: string,
  weekKey: string,
  actorId: string,
): Promise<void> {
  const { error } = await sb().rpc("release_week_close_lock", {
    p_org_id: orgId,
    p_week_key: weekKey,
    p_actor: actorId,
  });
  if (error) {
    console.warn("[week_close_lock] release failed", error.message);
  }
}

export type WeekCloseRunRow = {
  id: string;
  organization_id: string;
  week_key: string;
  idempotency_key: string;
  status: "in_progress" | "completed" | "failed";
  result: WeekCloseRunResult | null;
  actor_id: string | null;
  error_code: string | null;
  error_message: string | null;
};

export async function findWeekCloseRun(
  orgId: string,
  idempotencyKey: string,
): Promise<WeekCloseRunRow | null> {
  const { data, error } = await sb()
    .from("week_close_runs")
    .select(
      "id, organization_id, week_key, idempotency_key, status, result, actor_id, error_code, error_message",
    )
    .eq("organization_id", orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WeekCloseRunRow | null) ?? null;
}

/** Insert in_progress run; returns existing row if unique conflict. */
export async function beginWeekCloseRun(opts: {
  orgId: string;
  weekKey: string;
  idempotencyKey: string;
  actorId: string;
}): Promise<{ run: WeekCloseRunRow; created: boolean }> {
  const existing = await findWeekCloseRun(opts.orgId, opts.idempotencyKey);
  if (existing) {
    // Allow retry after a prior failure with the same key.
    if (existing.status === "failed") {
      const { data, error } = await sb()
        .from("week_close_runs")
        .update({
          status: "in_progress",
          result: null,
          error_code: null,
          error_message: null,
          completed_at: null,
          actor_id: opts.actorId,
          week_key: opts.weekKey,
        })
        .eq("id", existing.id)
        .eq("status", "failed")
        .select(
          "id, organization_id, week_key, idempotency_key, status, result, actor_id, error_code, error_message",
        )
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return { run: data as WeekCloseRunRow, created: true };
      // Lost race — re-read.
      const again = await findWeekCloseRun(opts.orgId, opts.idempotencyKey);
      if (again) return { run: again, created: false };
    }
    return { run: existing, created: false };
  }

  const { data, error } = await sb()
    .from("week_close_runs")
    .insert({
      organization_id: opts.orgId,
      week_key: opts.weekKey,
      idempotency_key: opts.idempotencyKey,
      status: "in_progress",
      actor_id: opts.actorId,
    })
    .select(
      "id, organization_id, week_key, idempotency_key, status, result, actor_id, error_code, error_message",
    )
    .maybeSingle();

  if (error) {
    // Unique race — return the winner.
    if (String(error.code) === "23505" || /duplicate|unique/i.test(error.message)) {
      const again = await findWeekCloseRun(opts.orgId, opts.idempotencyKey);
      if (again) return { run: again, created: false };
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("week_close_runs insert returned no row");
  return { run: data as WeekCloseRunRow, created: true };
}

export async function completeWeekCloseRun(
  orgId: string,
  idempotencyKey: string,
  result: WeekCloseRunResult,
): Promise<void> {
  const { error } = await sb()
    .from("week_close_runs")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    })
    .eq("organization_id", orgId)
    .eq("idempotency_key", idempotencyKey);
  if (error) console.warn("[week_close_lock] complete run failed", error.message);
}

export async function failWeekCloseRun(
  orgId: string,
  idempotencyKey: string,
  code: string,
  message: string,
): Promise<void> {
  const { error } = await sb()
    .from("week_close_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_code: code,
      error_message: message,
    })
    .eq("organization_id", orgId)
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "in_progress");
  if (error) console.warn("[week_close_lock] fail run failed", error.message);
}
