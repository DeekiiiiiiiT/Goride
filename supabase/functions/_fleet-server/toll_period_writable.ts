/**
 * TR-C2: refuse toll mutations when the week is sealed.
 * Mode via TOLL_PERIOD_WRITE_GUARD=off|shadow|enforce (default enforce) —
 * same shape as FUEL_SERVER_ENGINE.
 */
import type { Context } from "npm:hono@4.3.11";
import { startOfWeek, format } from "npm:date-fns";
import { getServiceClient } from "./service_client.ts";
import { getOrgId } from "./org_scope.ts";

export type TollPeriodWriteGuardMode = "off" | "shadow" | "enforce";

export type TollPeriodState = "open" | "in_review" | "ready" | "sealed" | "reopened";

/** Landing chip (TR-M9): Closed > Sealed > Reviewed. */
export type TollSealChip = "reviewed" | "sealed" | "closed";

export function deriveTollSealChip(input: {
  periodState?: string | null;
  hasClosedTollStatement?: boolean;
  weekClosed?: boolean;
}): TollSealChip | null {
  if (input.weekClosed) return "closed";
  const state = String(input.periodState || "").toLowerCase();
  if (state === "sealed" || input.hasClosedTollStatement) return "sealed";
  if (state === "ready") return "reviewed";
  return null;
}

export class TollPeriodSealedError extends Error {
  readonly code = "PERIOD_SEALED";
  readonly status = 409;
  readonly weekKey: string;
  readonly reopenPath: string;
  readonly source: "period" | "week_statements";

  constructor(weekKey: string, source: "period" | "week_statements") {
    super(
      `PERIOD_SEALED: toll week ${weekKey} is sealed and cannot accept reconciliation writes. Reopen first.`,
    );
    this.name = "TollPeriodSealedError";
    this.weekKey = weekKey;
    this.source = source;
    this.reopenPath = `/toll-reconciliation/periods/${weekKey}/reopen`;
  }
}

export function getTollPeriodWriteGuardMode(): TollPeriodWriteGuardMode {
  const raw = String(Deno.env.get("TOLL_PERIOD_WRITE_GUARD") || "enforce").toLowerCase();
  if (raw === "shadow") return "shadow";
  if (raw === "off" || raw === "false" || raw === "0") return "off";
  if (raw === "enforce" || raw === "on" || raw === "true" || raw === "1") return "enforce";
  return "enforce";
}

export function tollPeriodIdFor(organizationId: string, weekKey: string): string {
  return `${organizationId}:${weekKey}`;
}

export type TollPeriodSealedProbe = {
  sealed: boolean;
  source: "period" | "week_statements" | "none";
  state: TollPeriodState | null;
};

/** Pure sealed decision (period row + whether any closed toll statement exists). */
export function decideTollPeriodSealed(input: {
  periodState: string | null | undefined;
  hasClosedTollStatement: boolean;
}): TollPeriodSealedProbe {
  const state = (input.periodState || null) as TollPeriodState | null;
  if (state === "sealed") {
    return { sealed: true, source: "period", state };
  }
  // Explicit reopen restores writability even if standing week_statements exist.
  if (state === "reopened") {
    return { sealed: false, source: "period", state };
  }
  if (input.hasClosedTollStatement) {
    return { sealed: true, source: "week_statements", state };
  }
  return { sealed: false, source: "none", state };
}

export async function probeTollPeriodSealed(
  organizationId: string,
  weekKey: string,
): Promise<TollPeriodSealedProbe> {
  const sb = getServiceClient();
  const wk = String(weekKey).slice(0, 10);

  const { data: period, error: periodErr } = await sb
    .from("toll_reconciliation_period")
    .select("state")
    .eq("organization_id", organizationId)
    .eq("week_key", wk)
    .maybeSingle();
  if (periodErr) throw new Error(periodErr.message);

  const { data: stmts, error: stmtErr } = await sb
    .from("week_statements")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("week_key", wk)
    .eq("kind", "toll")
    .eq("status", "closed")
    .limit(1);
  if (stmtErr) throw new Error(stmtErr.message);

  return decideTollPeriodSealed({
    periodState: period?.state ? String(period.state) : null,
    hasClosedTollStatement: Array.isArray(stmts) && stmts.length > 0,
  });
}

/**
 * Guard mutating toll routes. Shadow logs only; enforce throws TollPeriodSealedError.
 * off = no-op.
 */
export async function assertTollPeriodWritable(
  organizationId: string,
  weekKey: string,
  opts?: { route?: string; mode?: TollPeriodWriteGuardMode },
): Promise<void> {
  const mode = opts?.mode ?? getTollPeriodWriteGuardMode();
  if (mode === "off") return;

  const wk = String(weekKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) return;

  const probe = await probeTollPeriodSealed(organizationId, wk);
  if (!probe.sealed) return;

  const route = opts?.route || "unknown";
  if (mode === "shadow") {
    console.warn(
      `[tollPeriodWriteGuard][shadow] would refuse PERIOD_SEALED week=${wk} source=${probe.source} route=${route}`,
    );
    return;
  }

  throw new TollPeriodSealedError(wk, probe.source === "none" ? "period" : probe.source);
}

/** JSON body for 409 PERIOD_SEALED responses. */
export function periodSealedBody(err: TollPeriodSealedError): Record<string, unknown> {
  return {
    error: "PERIOD_SEALED",
    message: err.message,
    weekKey: err.weekKey,
    reopenPath: err.reopenPath,
    source: err.source,
  };
}

export async function insertTollPeriodAudit(
  organizationId: string,
  periodId: string,
  action: string,
  payload: Record<string, unknown>,
  actorId: string | null | undefined,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from("toll_period_audit").insert({
    period_id: periodId,
    organization_id: organizationId,
    actor_id: actorId || "00000000-0000-0000-0000-000000000000",
    action,
    payload,
  });
  if (error) {
    console.warn("[toll_period_audit] insert failed", action, error.message);
  }
}

export async function upsertTollPeriodRow(
  organizationId: string,
  weekKey: string,
  patch: Record<string, unknown>,
  opts?: { expectedVersion?: number | null },
): Promise<Record<string, unknown>> {
  const sb = getServiceClient();
  const wk = String(weekKey).slice(0, 10);
  const id = tollPeriodIdFor(organizationId, wk);
  const now = new Date().toISOString();

  const { data: existing } = await sb
    .from("toll_reconciliation_period")
    .select("version")
    .eq("organization_id", organizationId)
    .eq("week_key", wk)
    .maybeSingle();

  const currentVersion = Number((existing as any)?.version) || 1;
  if (opts?.expectedVersion != null && opts.expectedVersion !== currentVersion) {
    const err = new Error("version_conflict");
    (err as any).code = "version_conflict";
    (err as any).currentVersion = currentVersion;
    throw err;
  }

  const nextVersion = existing ? currentVersion + 1 : 1;
  const row = {
    id,
    organization_id: organizationId,
    week_key: wk,
    updated_at: now,
    ...patch,
    version: nextVersion,
  };
  const { data, error } = await sb
    .from("toll_reconciliation_period")
    .upsert(row, { onConflict: "organization_id,week_key" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

/** Monday week key from a fleet calendar day (yyyy-MM-dd) — matches toll_period_controller. */
export function mondayWeekKeyFromCalendarDay(ymd: string): string {
  const day = String(ymd || "").slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const base = new Date(y, m - 1, d);
  if (isNaN(base.getTime())) return day;
  return format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/**
 * HTTP chokepoint for mutating toll routes.
 * Returns a 409 Response when enforce + sealed; otherwise null (continue).
 */
export async function refuseIfTollPeriodSealed(
  c: Context,
  weekKey: string | null | undefined,
  route: string,
): Promise<Response | null> {
  const orgId = getOrgId(c);
  if (!orgId) return null;
  const wk = weekKey ? String(weekKey).slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) return null;
  try {
    await assertTollPeriodWritable(orgId, wk, { route });
    return null;
  } catch (e) {
    if (e instanceof TollPeriodSealedError) {
      try {
        const { logTollReconCommand } = await import("./toll_recon_metrics.ts");
        logTollReconCommand({
          name: route,
          outcome: "PERIOD_SEALED",
          weekKey: wk,
        });
      } catch {
        /* metrics best-effort */
      }
      return c.json(periodSealedBody(e), 409);
    }
    throw e;
  }
}
