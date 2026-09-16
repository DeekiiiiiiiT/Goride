/**
 * Durable per-lane seal ledger for week_close (ADR-0019).
 * Table: public.week_seal_log (view over ledger.week_seal_log).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

export type SealLane = "fuel" | "toll" | "earnings";
export type SealStatus = "pending" | "in_progress" | "succeeded" | "failed";

export type WeekSealLogRow = {
  organization_id: string;
  week_key: string;
  lane: SealLane;
  status: SealStatus;
  attempts: number;
  idempotency_key: string;
  correlation_id: string | null;
  request_hash: string | null;
  result_json: Record<string, unknown> | null;
  last_error: string | null;
  sealed_at: string | null;
};

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function buildSealIdempotencyKey(
  organizationId: string,
  weekKey: string,
  lane: SealLane,
  attemptEpoch = Math.floor(Date.now() / 60_000),
): string {
  return `${organizationId}:${weekKey}:${lane}:${attemptEpoch}`;
}

/** Start or resume a seal attempt. Returns prior succeeded row for replay. */
export async function beginSealAttempt(opts: {
  organizationId: string;
  weekKey: string;
  lane: SealLane;
  idempotencyKey: string;
  correlationId?: string;
  requestHash?: string;
}): Promise<WeekSealLogRow | null> {
  const sb = admin();
  const { data: byKey } = await sb
    .from("week_seal_log")
    .select("*")
    .eq("organization_id", opts.organizationId)
    .eq("idempotency_key", opts.idempotencyKey)
    .maybeSingle();

  if (byKey?.status === "succeeded") {
    return byKey as WeekSealLogRow;
  }

  const { data: byLane } = await sb
    .from("week_seal_log")
    .select("*")
    .eq("organization_id", opts.organizationId)
    .eq("week_key", opts.weekKey)
    .eq("lane", opts.lane)
    .maybeSingle();

  if (byLane?.status === "succeeded" && byLane.idempotency_key === opts.idempotencyKey) {
    return byLane as WeekSealLogRow;
  }

  const attempts = (byLane?.attempts ?? 0) + 1;
  const row = {
    organization_id: opts.organizationId,
    week_key: opts.weekKey,
    lane: opts.lane,
    status: "in_progress" as const,
    attempts,
    idempotency_key: opts.idempotencyKey,
    correlation_id: opts.correlationId ?? null,
    request_hash: opts.requestHash ?? null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from("week_seal_log").upsert(row, {
    onConflict: "organization_id,week_key,lane",
  });
  if (error) {
    console.warn("[week_seal_log] beginSealAttempt upsert failed", error.message);
  }
  return null;
}

export async function completeSealAttempt(opts: {
  organizationId: string;
  weekKey: string;
  lane: SealLane;
  idempotencyKey: string;
  correlationId?: string;
  status: "succeeded" | "failed";
  resultJson?: unknown;
  lastError?: string;
}): Promise<void> {
  const sb = admin();
  const patch: Record<string, unknown> = {
    organization_id: opts.organizationId,
    week_key: opts.weekKey,
    lane: opts.lane,
    status: opts.status,
    idempotency_key: opts.idempotencyKey,
    correlation_id: opts.correlationId ?? null,
    last_error: opts.lastError ?? null,
    updated_at: new Date().toISOString(),
  };
  if (opts.status === "succeeded") {
    patch.result_json = opts.resultJson ?? {};
    patch.sealed_at = new Date().toISOString();
  }
  const { error } = await sb.from("week_seal_log").upsert(patch, {
    onConflict: "organization_id,week_key,lane",
  });
  if (error) {
    console.warn("[week_seal_log] completeSealAttempt failed", error.message);
  }
}
