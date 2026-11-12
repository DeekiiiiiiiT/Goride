/**
 * Week Reconciliation Round 2b (WRA-27, 28, 30, 31): the one wrapper every change
 * to a week goes through.
 *   permission (route middleware) → claim (recon.claim_week_change: repeat-safety,
 *   version check, closed-week refusal, version bump, decision-log row, 2-minute
 *   publish hold, all in one transaction) → the change itself → on failure, an
 *   appended 'change_failed' row that points at the claim.
 * The correlation ID (header x-recon-correlation-id, or a new one) is written on
 * the log row and returned, so one action can be followed through the logs.
 */
import type { Context } from "npm:hono@4.3.11";
import { getServiceClientWithSchema } from "./service_client.ts";

export type ClaimStatus = "ok" | "replay" | "conflict" | "closed" | "version_required" | "not_found";

export type ClaimResult = {
  status: ClaimStatus;
  version?: number;
  current_version?: number;
  event_id?: number;
  kind?: string;
};

function reconDb() {
  return getServiceClientWithSchema("recon");
}

/** Idempotency-Key header, or `idempotencyKey` in the body. */
export function idempotencyKeyFrom(c: Context, body?: { idempotencyKey?: unknown } | null): string | null {
  const header = String(c.req.header("Idempotency-Key") || c.req.header("idempotency-key") || "").trim();
  if (header) return header.slice(0, 200);
  const fromBody = String(body?.idempotencyKey ?? "").trim();
  return fromBody ? fromBody.slice(0, 200) : null;
}

/** x-recon-correlation-id header, or a new ID for this action. */
export function correlationIdFrom(c: Context): string {
  const header = String(c.req.header("x-recon-correlation-id") || "").trim();
  return header ? header.slice(0, 120) : crypto.randomUUID();
}

/** Plain refusal for a claim that cannot go ahead; null when the change may proceed. */
export function claimRefusal(c: Context, claim: ClaimResult): Response | null {
  switch (claim.status) {
    case "conflict":
      return c.json({
        error: "WEEK_CHANGED",
        message: "This week changed while you were working. Reload the week and try again.",
        currentVersion: claim.current_version ?? null,
      }, 409);
    case "version_required":
      return c.json({
        error: "VERSION_REQUIRED",
        message: "expectedVersion is required for every change to a week.",
        currentVersion: claim.current_version ?? null,
      }, 400);
    case "closed":
      return c.json({
        error: "WEEK_CLOSED",
        message: "This week is closed. Changes to a closed week go through a correction.",
      }, 409);
    case "not_found":
      return c.json({
        error: "WEEK_NOT_READY",
        message: "This week is still being prepared. Try again in a minute.",
      }, 409);
    default:
      return null;
  }
}

export type WeekChangeOutcome<T> =
  | { kind: "applied"; result: T; version: number; eventId: number; correlationId: string }
  | { kind: "replay"; version: number; correlationId: string }
  | { kind: "refused"; response: Response };

/**
 * Claims the change, runs it, and logs a failure if it throws.
 * `apply` must only run after a successful claim, and should be safe to run once.
 */
export async function withWeekChange<T>(
  c: Context,
  opts: {
    runId: string;
    expectedVersion: number | null | undefined;
    actor: string;
    kind: string;
    step?: string | null;
    reason?: string | null;
    payload?: Record<string, unknown>;
    idempotencyKey?: string | null;
    /** WRA-32: an approver doing an approval action directly (not through a request). */
    selfApproved?: boolean;
    apply: () => Promise<T>;
  },
): Promise<WeekChangeOutcome<T>> {
  const correlationId = correlationIdFrom(c);
  const expected = opts.expectedVersion == null || !Number.isFinite(Number(opts.expectedVersion))
    ? null
    : Number(opts.expectedVersion);
  const { data, error } = await reconDb().rpc("claim_week_change", {
    p_run_id: opts.runId,
    p_expected_version: expected,
    p_idempotency_key: opts.idempotencyKey ?? null,
    p_actor: opts.actor,
    p_kind: opts.kind,
    p_step: opts.step ?? null,
    p_reason: opts.reason ?? null,
    p_payload: opts.payload ?? {},
    p_correlation_id: correlationId,
    p_self_approved: opts.selfApproved === true,
  });
  if (error) throw new Error(`week change claim failed: ${error.message}`);
  const claim = (data ?? { status: "not_found" }) as ClaimResult;

  if (claim.status === "replay") {
    return { kind: "replay", version: Number(claim.version ?? 0), correlationId };
  }
  const refusal = claimRefusal(c, claim);
  if (refusal) return { kind: "refused", response: refusal };

  try {
    const result = await opts.apply();
    return {
      kind: "applied",
      result,
      version: Number(claim.version),
      eventId: Number(claim.event_id),
      correlationId,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const { error: logErr } = await reconDb().from("run_events").insert({
      run_id: opts.runId,
      actor: opts.actor,
      kind: "change_failed",
      payload: { failedEventId: claim.event_id ?? null, failedKind: opts.kind, error: message.slice(0, 500) },
      correlation_id: correlationId,
      status: "applied",
    });
    if (logErr) console.warn("[recon] change_failed log write failed", logErr.message);
    throw e;
  }
}

/** WRA-11 / §9 step 4: weeks closed by legacy_cleanup cannot be reopened. */
export async function isLegacyCleanupWeek(orgId: string, line: string, weekKey: string): Promise<boolean> {
  const { data: run, error } = await reconDb().from("week_runs")
    .select("id").eq("organization_id", orgId).eq("service_line", line).eq("week_key", weekKey).maybeSingle();
  if (error) throw new Error(`week run read failed: ${error.message}`);
  if (!run) return false;
  const { count, error: evErr } = await reconDb().from("run_events")
    .select("id", { count: "exact", head: true }).eq("run_id", run.id).eq("kind", "legacy_cleanup");
  if (evErr) throw new Error(`legacy check failed: ${evErr.message}`);
  return (count ?? 0) > 0;
}

/**
 * WRA-30/32: history row for an approval action done directly by an approver
 * (Close, Reopen, Accept statement cash on the week-close routes). Self-approved by definition.
 * Weeks the calculator has not created yet have no run to log against; nothing is written then.
 */
export async function logDirectApproverAction(input: {
  orgId: string;
  line: string;
  weekKey: string;
  actor: string;
  kind: string;
  reason?: string | null;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
}): Promise<void> {
  const { data: run, error } = await reconDb().from("week_runs")
    .select("id, version").eq("organization_id", input.orgId).eq("service_line", input.line)
    .eq("week_key", input.weekKey).maybeSingle();
  if (error) throw new Error(`week run read failed: ${error.message}`);
  if (!run) return;
  const { error: insErr } = await reconDb().from("run_events").insert({
    run_id: (run as { id: string }).id,
    actor: input.actor,
    kind: input.kind,
    payload: input.payload ?? {},
    line: input.line,
    week_key: input.weekKey,
    reason: String(input.reason ?? "").trim() || null,
    correlation_id: input.correlationId ?? null,
    prepared_by: input.actor,
    approved_by: input.actor,
    self_approved: true,
    status: "applied",
    version_at_send: Number((run as { version: number }).version),
  });
  if (insErr) throw new Error(`history row failed: ${insErr.message}`);
}
