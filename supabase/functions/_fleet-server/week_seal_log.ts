/**
 * Durable per-lane seal ledger for week_close (ADR-0019).
 *
 * Closeout fixes C2a/b/c + D5:
 * - Idempotency key is intent generation (org:week:lane:gN), never wall clock.
 * - in_progress claim is conditional (insert / filtered update) — not read-then-upsert.
 * - Seal-log write failures throw (fail-closed).
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type SealLane = "fuel" | "toll" | "earnings";
export type SealStatus = "pending" | "in_progress" | "succeeded" | "failed";

/** Match week_close_lock TTL — in_progress younger than this blocks concurrent seal. */
export const SEAL_IN_PROGRESS_TTL_MS = 120_000;

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
  updated_at?: string | null;
};

export class WeekSealLogError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  constructor(
    code: string,
    message: string,
    status = 503,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WeekSealLogError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** Test seam — inject a stub client; production always uses service-role admin(). */
let _adminOverride: SupabaseClient | null = null;

export function __setWeekSealLogAdminForTests(client: SupabaseClient | null): void {
  _adminOverride = client;
}

function admin(): SupabaseClient {
  if (_adminOverride) return _adminOverride;
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Deterministic intent key. generation=0 for normal close; bump only on force reseal.
 * Format: {org}:{week}:{lane}:g{N}
 */
export function buildSealIdempotencyKey(
  organizationId: string,
  weekKey: string,
  lane: SealLane,
  generation = 0,
): string {
  const g = Number.isFinite(generation) && generation >= 0
    ? Math.floor(generation)
    : 0;
  return `${organizationId}:${weekKey}:${lane}:g${g}`;
}

/** Parse trailing :gN from an idempotency key. */
export function parseSealGeneration(idempotencyKey: string | null | undefined): number {
  if (!idempotencyKey) return 0;
  const m = /:g(\d+)$/.exec(idempotencyKey);
  return m ? Number(m[1]) : 0;
}

/**
 * Normal close → generation 0 (stable intent).
 * Force reseal → prior generation + 1 so receivers do not replay the old success.
 */
export async function resolveSealGeneration(opts: {
  organizationId: string;
  weekKey: string;
  lane: SealLane;
  force: boolean;
}): Promise<number> {
  if (!opts.force) return 0;
  const sb = admin();
  const { data, error } = await sb
    .from("week_seal_log")
    .select("idempotency_key")
    .eq("organization_id", opts.organizationId)
    .eq("week_key", opts.weekKey)
    .eq("lane", opts.lane)
    .maybeSingle();
  if (error) {
    throw new WeekSealLogError(
      "SEAL_LOG_READ_FAILED",
      `week_seal_log generation peek failed: ${error.message}`,
      503,
      { lane: opts.lane },
    );
  }
  return parseSealGeneration(data?.idempotency_key as string | undefined) + 1;
}

export function isFreshInProgress(row: WeekSealLogRow, nowMs = Date.now()): boolean {
  if (row.status !== "in_progress") return false;
  const updated = row.updated_at ? Date.parse(row.updated_at) : NaN;
  if (!Number.isFinite(updated)) return true;
  return nowMs - updated < SEAL_IN_PROGRESS_TTL_MS;
}

/**
 * Claim in_progress with a conditional write (D5).
 * - No row → insert; unique conflict → CLOSE_IN_PROGRESS
 * - Existing row → update only if status != in_progress OR updated_at is stale
 * - 0 rows updated → CLOSE_IN_PROGRESS
 */
async function claimInProgressRow(
  sb: SupabaseClient,
  opts: {
    organizationId: string;
    weekKey: string;
    lane: SealLane;
    idempotencyKey: string;
    correlationId?: string;
    requestHash?: string;
  },
  attempts: number,
  laneRow: WeekSealLogRow | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - SEAL_IN_PROGRESS_TTL_MS).toISOString();
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
    updated_at: nowIso,
  };

  if (!laneRow) {
    const { error } = await sb.from("week_seal_log").insert(row);
    if (error) {
      const msg = error.message || "";
      if (/duplicate|unique|conflict/i.test(msg)) {
        throw new WeekSealLogError(
          "CLOSE_IN_PROGRESS",
          `Seal lane ${opts.lane} already in progress for ${opts.weekKey}`,
          409,
          { week: opts.weekKey, lane: opts.lane },
        );
      }
      throw new WeekSealLogError(
        "SEAL_LOG_WRITE_FAILED",
        `week_seal_log begin insert failed: ${msg}`,
        503,
        { lane: opts.lane },
      );
    }
    return;
  }

  // Conditional update: refuse to overwrite a fresh in_progress row.
  const { data, error } = await sb
    .from("week_seal_log")
    .update(row)
    .eq("organization_id", opts.organizationId)
    .eq("week_key", opts.weekKey)
    .eq("lane", opts.lane)
    .or(`status.neq.in_progress,updated_at.lt.${staleBefore}`)
    .select("organization_id");

  if (error) {
    throw new WeekSealLogError(
      "SEAL_LOG_WRITE_FAILED",
      `week_seal_log begin conditional update failed: ${error.message}`,
      503,
      { lane: opts.lane },
    );
  }
  if (!data || data.length === 0) {
    throw new WeekSealLogError(
      "CLOSE_IN_PROGRESS",
      `Seal lane ${opts.lane} already in progress for ${opts.weekKey}`,
      409,
      { week: opts.weekKey, lane: opts.lane },
    );
  }
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
  const { data: byKey, error: byKeyErr } = await sb
    .from("week_seal_log")
    .select("*")
    .eq("organization_id", opts.organizationId)
    .eq("idempotency_key", opts.idempotencyKey)
    .maybeSingle();

  if (byKeyErr) {
    throw new WeekSealLogError(
      "SEAL_LOG_READ_FAILED",
      `week_seal_log read failed: ${byKeyErr.message}`,
      503,
      { lane: opts.lane },
    );
  }

  if (byKey?.status === "succeeded") {
    return byKey as WeekSealLogRow;
  }

  const { data: byLane, error: byLaneErr } = await sb
    .from("week_seal_log")
    .select("*")
    .eq("organization_id", opts.organizationId)
    .eq("week_key", opts.weekKey)
    .eq("lane", opts.lane)
    .maybeSingle();

  if (byLaneErr) {
    throw new WeekSealLogError(
      "SEAL_LOG_READ_FAILED",
      `week_seal_log lane read failed: ${byLaneErr.message}`,
      503,
      { lane: opts.lane },
    );
  }

  const laneRow = byLane as WeekSealLogRow | null;

  if (laneRow?.status === "succeeded" && laneRow.idempotency_key === opts.idempotencyKey) {
    return laneRow;
  }

  // Fast path refuse (still enforced by conditional write below for races)
  if (laneRow && isFreshInProgress(laneRow)) {
    throw new WeekSealLogError(
      "CLOSE_IN_PROGRESS",
      `Seal lane ${opts.lane} already in progress for ${opts.weekKey}`,
      409,
      { week: opts.weekKey, lane: opts.lane },
    );
  }

  const attempts = (laneRow?.attempts ?? 0) + 1;
  await claimInProgressRow(sb, opts, attempts, laneRow);
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
    throw new WeekSealLogError(
      "SEAL_LOG_WRITE_FAILED",
      `week_seal_log complete failed: ${error.message}`,
      503,
      { lane: opts.lane },
    );
  }
}
