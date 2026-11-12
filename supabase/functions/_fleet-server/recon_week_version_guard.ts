/**
 * WRA-27: week-version check for the toll, fuel and settlement routes the Week
 * Reconciliation steps call. Opt-in by header, so screens that do not send it yet
 * (today's embedded wizards) keep working; the Round 4 step panels always send it.
 *
 *   x-recon-week: <week run id>@<version the screen loaded>
 *
 * Before the change: a moved week → 409 WEEK_CHANGED; a closed week → 409 WEEK_CLOSED.
 * After a successful change: recon.claim_week_change bumps the version, writes the
 * history row and sets the 2-minute publish hold, like every desk change.
 */
import type { Context, Next } from "npm:hono@4.3.11";
import { getServiceClientWithSchema } from "./service_client.ts";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import { correlationIdFrom, idempotencyKeyFrom } from "./recon_week_change.ts";

const CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HEADER_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@(\d+)$/i;

export function parseWeekHeader(value: string | undefined | null): { runId: string; version: number } | "bad" | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const m = HEADER_RE.exec(raw);
  if (!m) return "bad";
  return { runId: m[1].toLowerCase(), version: Number(m[2]) };
}

export type WeekReconClient = {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        };
      };
    };
  };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
};

export type WeekGuardDeps = {
  reconClient: () => WeekReconClient;
  requireAuthStrict: (c: Context, next: () => Promise<void | Response>) => Promise<void | Response>;
};

const defaultDeps: WeekGuardDeps = {
  reconClient: () => getServiceClientWithSchema("recon") as unknown as WeekReconClient,
  requireAuthStrict: async (c, next) => {
    let inner: void | Response | undefined;
    const wrapped: Next = async () => {
      inner = await next();
    };
    const auth = await requireAuth({ strict: true })(c, wrapped);
    if (auth instanceof Response) return auth;
    if (inner instanceof Response) return inner;
  },
};

export async function runWeekVersionGuardCore(
  c: Context,
  next: Next,
  parsed: { runId: string; version: number },
  deps: WeekGuardDeps = defaultDeps,
): Promise<Response | void> {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ error: "WEEK_NOT_READY", message: "This week is still being prepared." }, 409);
  }
  const recon = deps.reconClient();
  const { data: run, error } = await recon.from("week_runs")
    .select("id, version, state")
    .eq("id", parsed.runId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) return c.json({ error: "WEEK_READ_FAILED", message: error.message }, 500);
  if (!run) return c.json({ error: "WEEK_NOT_READY", message: "This week is still being prepared." }, 409);
  if ((run as { state: string }).state === "closed") {
    return c.json({ error: "WEEK_CLOSED", message: "This week is closed. Changes go through a correction." }, 409);
  }
  if (Number((run as { version: number }).version) !== parsed.version) {
    return c.json({
      error: "WEEK_CHANGED",
      message: "This week changed while you were working. Reload the week and try again.",
      currentVersion: (run as { version: number }).version,
    }, 409);
  }

  await next();

  if (c.res.status >= 400) return;
  const user = c.get("rbacUser") as { userId?: string } | undefined;
  const { data: claim, error: claimErr } = await recon.rpc("claim_week_change", {
    p_run_id: parsed.runId,
    p_expected_version: parsed.version,
    p_idempotency_key: idempotencyKeyFrom(c, null),
    p_actor: user?.userId ?? "unknown",
    p_kind: `lane_change:${c.req.method} ${new URL(c.req.url).pathname}`.slice(0, 200),
    p_step: null,
    p_reason: null,
    p_payload: {},
    p_correlation_id: correlationIdFrom(c),
    p_self_approved: false,
  });
  if (claimErr) {
    console.warn("[recon] lane change history failed", claimErr.message);
  } else if ((claim as { status?: string } | null)?.status !== "ok" && (claim as { status?: string } | null)?.status !== "replay") {
    console.warn("[recon] lane change claim", (claim as { status?: string } | null)?.status);
  }
}

export function reconWeekVersionGuardWith(deps: WeekGuardDeps = defaultDeps) {
  return async (c: Context, next: Next) => {
    if (!CHANGING.has(c.req.method)) return next();
    const parsed = parseWeekHeader(c.req.header("x-recon-week"));
    if (parsed === null) return next();
    if (parsed === "bad") {
      return c.json({ error: "BAD_WEEK_HEADER", message: "x-recon-week must be <week run id>@<version>" }, 400);
    }
    const gated = await deps.requireAuthStrict(c, async () => runWeekVersionGuardCore(c, next, parsed, deps));
    if (gated instanceof Response) return gated;
  };
}

export const reconWeekVersionGuard = reconWeekVersionGuardWith();
