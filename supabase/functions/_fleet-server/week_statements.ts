/**
 * Weekly statement store (audit §6, Phase 4/5).
 *
 * Publishes / reads immutable versioned statements from public.week_statements
 * (ledger.week_statements via security-invoker view). Fuel finalize, toll
 * finish and the earnings/cash block each publish their lane; close signs them;
 * a new fact on a closed week is a restatement (version n+1), never an in-place
 * update.
 */
import { getServiceClient } from "./service_client.ts";
import {
  hashWeekStatement,
  mapRowToWeekStatement,
  shadowCompareStatementsVsProjection,
  type LegacyProjectionForShadow,
  type StatementShadowDrift,
  type WeekStatement,
  type WeekStatementKind,
} from "../../../packages/finance-core/src/weekStatement.ts";

/** Statement engine identity — bump when statement math changes (invalidates hashes). */
export const WEEK_STATEMENT_ENGINE_VERSION = "week-statement@1";

/**
 * Feature flag: when on, rebuildDriverFinancialPeriod reads week_statements as
 * the source of truth instead of the legacy projection path. Defaults OFF; flip
 * per-env only after shadow compare shows zero drift for a full week.
 */
export const PROJECTION_READS_WEEK_STATEMENTS: boolean =
  (Deno.env.get("PROJECTION_READS_WEEK_STATEMENTS") ?? "").trim().toLowerCase() === "true";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);

export type PublishWeekStatementInput = {
  kind: WeekStatementKind;
  organizationId: string;
  driverId: string;
  weekKey: string;
  amountsMinor: Record<string, number>;
  sourceRowIds?: string[];
  engineVersion?: string;
  /** Publish already-closed (e.g. finalize that signs immediately). Default draft. */
  status?: "draft" | "closed";
  closedBy?: string | null;
  closeReason?: string | null;
};

/**
 * Insert a new statement version for a driver-week lane. Version is
 * max(existing) + 1 (1 when none). A prior CLOSED version of the same lane is
 * marked `restated` and referenced via `supersedes`, so history is append-only.
 */
export async function publishWeekStatement(input: PublishWeekStatementInput): Promise<WeekStatement> {
  const weekKey = WEEK_KEY(input.weekKey);
  const { data: existingRows, error: loadErr } = await sb()
    .from("week_statements")
    .select("id, version, status")
    .eq("organization_id", input.organizationId)
    .eq("driver_id", input.driverId)
    .eq("week_key", weekKey)
    .eq("kind", input.kind)
    .order("version", { ascending: false });
  if (loadErr) throw new Error(loadErr.message);

  const priorMaxVersion = existingRows?.length ? Number(existingRows[0].version) || 0 : 0;
  const priorClosed = (existingRows ?? []).find((r) => r.status === "closed");
  const nextVersion = priorMaxVersion + 1;
  const status = input.status ?? "draft";

  const statement: WeekStatement = {
    kind: input.kind,
    organizationId: input.organizationId,
    driverId: input.driverId,
    weekKey,
    version: nextVersion,
    status,
    amountsMinor: input.amountsMinor ?? {},
    sourceRowIds: (input.sourceRowIds ?? []).map(String),
    engineVersion: input.engineVersion ?? WEEK_STATEMENT_ENGINE_VERSION,
    supersedes: priorClosed ? String(priorClosed.id) : null,
    closedAt: status === "closed" ? new Date().toISOString() : null,
    closedBy: status === "closed" ? (input.closedBy ?? null) : null,
    closeReason: status === "closed" ? (input.closeReason ?? null) : null,
  };
  statement.sourceHash = await hashWeekStatement(statement);

  const { data: inserted, error: insErr } = await sb()
    .from("week_statements")
    .insert({
      kind: statement.kind,
      organization_id: statement.organizationId,
      driver_id: statement.driverId,
      week_key: statement.weekKey,
      version: statement.version,
      status: statement.status,
      amounts_minor: statement.amountsMinor,
      source_row_ids: statement.sourceRowIds,
      source_hash: statement.sourceHash,
      engine_version: statement.engineVersion,
      closed_at: statement.closedAt,
      closed_by: statement.closedBy,
      close_reason: statement.closeReason,
      supersedes: statement.supersedes,
    })
    .select("*")
    .single();
  if (insErr) throw new Error(insErr.message);

  // Retire the prior closed version ONLY when this publish is itself closed —
  // a draft restatement must leave the standing closed row until it is signed.
  if (priorClosed && status === "closed") {
    await sb()
      .from("week_statements")
      .update({ status: "restated" })
      .eq("id", priorClosed.id);
  }

  return mapRowToWeekStatement(inserted as Record<string, unknown>);
}

/** Latest (highest-version) statement for a driver-week lane, or null. */
export async function getLatestWeekStatement(
  organizationId: string,
  driverId: string,
  weekKey: string,
  kind: WeekStatementKind,
): Promise<WeekStatement | null> {
  const { data, error } = await sb()
    .from("week_statements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("week_key", WEEK_KEY(weekKey))
    .eq("kind", kind)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRowToWeekStatement(data as Record<string, unknown>) : null;
}

/** All lanes' latest statements for a driver-week (fuel / toll / earnings). */
export async function getLatestWeekStatements(
  organizationId: string,
  driverId: string,
  weekKey: string,
): Promise<WeekStatement[]> {
  const { data, error } = await sb()
    .from("week_statements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("driver_id", driverId)
    .eq("week_key", WEEK_KEY(weekKey))
    .order("version", { ascending: false });
  if (error) throw new Error(error.message);
  const byKind = new Map<string, WeekStatement>();
  for (const row of data ?? []) {
    const s = mapRowToWeekStatement(row as Record<string, unknown>);
    if (!byKind.has(s.kind)) byKind.set(s.kind, s); // first = highest version
  }
  return [...byKind.values()];
}

/**
 * Mark statements closed for a driver-week (called by the close path). Only
 * `draft` rows advance to `closed`; already-closed rows are left untouched.
 */
export async function closeWeekStatements(
  organizationId: string,
  driverId: string,
  weekKey: string,
  closedBy: string,
  closeReason: string,
): Promise<number> {
  const latest = await getLatestWeekStatements(organizationId, driverId, weekKey);
  let closed = 0;
  for (const s of latest) {
    if (s.status !== "draft" || !s.id) continue;
    const { error } = await sb()
      .from("week_statements")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: closedBy,
        close_reason: closeReason,
      })
      .eq("id", s.id)
      .eq("status", "draft");
    if (error) throw new Error(error.message);
    closed++;
  }
  return closed;
}

// ── Shadow compare (Phase 4 flag rollout gate) ───────────────────────────────

export type WeekStatementShadowReport = {
  driverId: string;
  weekKey: string;
  drifts: StatementShadowDrift[];
  clean: boolean;
};

/**
 * Load the latest lane statements + the legacy projection row and return every
 * field that drifts. Zero drift over a full week is the gate for turning
 * PROJECTION_READS_WEEK_STATEMENTS on.
 */
export async function shadowCompareWeek(
  organizationId: string,
  driverId: string,
  weekKey: string,
): Promise<WeekStatementShadowReport> {
  const week = WEEK_KEY(weekKey);
  const statements = await getLatestWeekStatements(organizationId, driverId, week);
  const { data: period, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "fuel_deduction, fuel_fleet_share, toll_spend, toll_charged_to_driver, toll_reimbursed, cash_collected, driver_share, fleet_share, tips_paid_to_driver, earnings_gross",
    )
    .eq("driver_id", driverId)
    .eq("period_anchor", week)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const drifts = shadowCompareStatementsVsProjection(
    statements,
    (period ?? {}) as LegacyProjectionForShadow,
  );
  return { driverId, weekKey: week, drifts, clean: drifts.length === 0 };
}

// ── Restatement (Phase 5.5) ───────────────────────────────────────────────────

export type RequestRestatementInput = {
  statementId: string;
  actorId: string;
  reason: string;
  /** Optional revised amounts; defaults to a copy of the prior closed amounts. */
  amountsMinor?: Record<string, number>;
  sourceRowIds?: string[];
};

/**
 * Open a restatement: create version n+1 DRAFT that supersedes the prior CLOSED
 * statement for the same lane. Never mutates the closed row in place. The new
 * draft is signed later through the normal close path (audit row + visible
 * delta preserved by append-only versioning).
 */
export async function requestRestatement(input: RequestRestatementInput): Promise<WeekStatement> {
  const { data: prior, error } = await sb()
    .from("week_statements")
    .select("*")
    .eq("id", input.statementId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!prior) throw new Error(`RESTATEMENT_TARGET_MISSING: ${input.statementId}`);
  if (prior.status !== "closed") {
    throw new Error(
      `RESTATEMENT_TARGET_NOT_CLOSED: statement ${input.statementId} is '${prior.status}', only closed statements can be restated`,
    );
  }

  const priorStmt = mapRowToWeekStatement(prior as Record<string, unknown>);
  const draft = await publishWeekStatement({
    kind: priorStmt.kind,
    organizationId: priorStmt.organizationId,
    driverId: priorStmt.driverId,
    weekKey: priorStmt.weekKey,
    amountsMinor: input.amountsMinor ?? priorStmt.amountsMinor,
    sourceRowIds: input.sourceRowIds ?? priorStmt.sourceRowIds,
    status: "draft",
    closeReason: input.reason,
  });

  // Annotate the restatement request on the new draft for audit trace.
  if (draft.id) {
    await sb()
      .from("week_statements")
      .update({ close_reason: `restatement:${input.reason} (actor:${input.actorId})` })
      .eq("id", draft.id);
  }
  return draft;
}

/** Draft restatements awaiting close/sign (org-wide queue). */
export async function listPendingRestatements(
  organizationId: string,
  opts?: { limit?: number; offset?: number },
): Promise<WeekStatement[]> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 100, 1), 500);
  const offset = Math.max(0, Number(opts?.offset) || 0);
  // Restatement drafts always supersede a prior closed statement.
  const { data, error } = await sb()
    .from("week_statements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "draft")
    .not("supersedes", "is", null)
    .order("week_key", { ascending: false })
    .order("version", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRowToWeekStatement(row as Record<string, unknown>));
}
