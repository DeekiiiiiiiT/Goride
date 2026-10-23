/**
 * R19-01: one writer for recon.week_blockers. The worker saves a driver's
 * blockers and the week's whole-week blockers here, with the same checks the
 * Close preview runs, so the steps, the Close panel and the close workflow
 * all read one answer. Worker-only: the P&L tie runs every engine.
 */
import { getServiceClient } from "./service_client.ts";
import { driverCloseBlockers, periodIsFrozen } from "./week_close.ts";
import { getLatestWeekStatements } from "./week_statements.ts";
import { listOpenFinanceReconDrifts } from "./finance_recon_drift.ts";
import { summarizeTollUsageOrphansByDriverForWeek } from "./toll_financial_reset.ts";
import { loadWeekCloseReconContext } from "./week_close_recon.ts";
import { weekPnlTieSides } from "./business_week_pnl.ts";
import { weekPnlTieBlockers } from "../../../packages/finance-core/src/weekPnlTie.ts";
import type { CloseBlocker } from "../../../packages/finance-core/src/closeInvariants.ts";
import type { StatementEngineDrift } from "../../../packages/finance-core/src/statementEngineCompare.ts";
import { blockerRowKey, blockerRowsForScope } from "./recon_week_blocker_rows.ts";
import type { BlockerScope as Scope, ReconServiceLine } from "./recon_week_blocker_rows.ts";

export type { ReconServiceLine } from "./recon_week_blocker_rows.ts";

function recon() {
  return getServiceClient().schema("recon");
}

/** Saves the new rows first, then removes rows that no longer apply. Throws on any error. */
async function replaceScopeBlockers(scope: Scope, blockers: CloseBlocker[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = blockerRowsForScope(scope, blockers, now);
  if (rows.length) {
    const { error } = await recon()
      .from("week_blockers")
      .upsert(rows, { onConflict: "organization_id,week_key,service_line,driver_id,code,source_id" });
    if (error) throw new Error(`week blockers save failed: ${error.message}`);
  }
  let existing = recon()
    .from("week_blockers")
    .select("id, code, source_id")
    .eq("organization_id", scope.orgId)
    .eq("week_key", scope.weekKey)
    .eq("service_line", scope.serviceLine);
  existing = scope.driverId ? existing.eq("driver_id", scope.driverId) : existing.is("driver_id", null);
  const { data, error: readErr } = await existing;
  if (readErr) throw new Error(`week blockers read failed: ${readErr.message}`);
  const keep = new Set(rows.map((row) => blockerRowKey(row.code, row.source_id)));
  const stale = ((data ?? []) as Array<{ id: string; code: string; source_id: string | null }>)
    .filter((row) => !keep.has(blockerRowKey(row.code, row.source_id)))
    .map((row) => row.id);
  if (stale.length) {
    const { error } = await recon().from("week_blockers").delete().in("id", stale);
    if (error) throw new Error(`week blockers cleanup failed: ${error.message}`);
  }
}

/** A driver's blockers, worked out exactly like the Close preview. Frozen drivers with no restatement have none. */
export async function writeDriverWeekBlockers(
  orgId: string,
  weekKey: string,
  driverId: string,
  serviceLine: ReconServiceLine,
): Promise<void> {
  const { data: period, error } = await getServiceClient()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("period_anchor", weekKey)
    .maybeSingle();
  if (error) throw new Error(`period read failed: ${error.message}`);
  const scope: Scope = { orgId, weekKey, serviceLine, driverId };
  if (!period) {
    await replaceScopeBlockers(scope, []);
    return;
  }
  const row = period as Record<string, unknown>;
  const frozen = periodIsFrozen(row);
  const statements = await getLatestWeekStatements(orgId, driverId, weekKey);
  const storedDrifts: StatementEngineDrift[] = (await listOpenFinanceReconDrifts(orgId, weekKey))
    .filter((item) => item.driver_id === driverId)
    .map((item) => ({
      kind: item.kind,
      field: item.field,
      statementMinor: Number(item.statement_minor) || 0,
      engineMinor: Number(item.engine_minor) || 0,
      deltaMinor: Number(item.delta_minor) || 0,
    }));
  let tollSummary = null;
  try {
    tollSummary = (await summarizeTollUsageOrphansByDriverForWeek(weekKey)).get(driverId) ?? null;
  } catch (e) {
    console.warn("[recon] toll event ledger skipped", e);
  }
  const result = await driverCloseBlockers({
    orgId,
    week: weekKey,
    driverId,
    period: row,
    frozen,
    statements,
    storedDrifts,
    tollSummary,
  });
  // Same rule as the preview: a frozen driver only counts while a restatement waits.
  const counts = !frozen || result.acceptRestatementDrafts;
  await replaceScopeBlockers(scope, counts ? result.blockers : []);
}

/**
 * Whole-week blockers: missing or stale sources, plus the settlement ↔ P&L tie.
 * `withPnlTie` runs every engine for the week, so only the close workflow asks for it.
 * Any other refresh drops the old P&L row: the facts moved, and Close re-checks it.
 */
export async function writeWeekLevelBlockers(
  orgId: string,
  weekKey: string,
  serviceLine: ReconServiceLine,
  opts: { withPnlTie: boolean },
): Promise<void> {
  const context = await loadWeekCloseReconContext(orgId, weekKey, serviceLine);
  const blockers: CloseBlocker[] = [...context.sourceBlockers];
  if (opts.withPnlTie) {
    const { data: periods, error } = await getServiceClient()
      .from("driver_financial_periods")
      .select("driver_id")
      .eq("organization_id", orgId)
      .eq("period_anchor", weekKey);
    if (error) throw new Error(`period read failed: ${error.message}`);
    const driverIds = (periods ?? []).map((p) => String((p as { driver_id?: string }).driver_id || "")).filter(Boolean);
    const sides = await weekPnlTieSides(orgId, weekKey, driverIds, { skipEngineProbe: false });
    blockers.push(...weekPnlTieBlockers({
      week: weekKey,
      settlementSum: sides.settlementSumForWeek,
      businessPnl: sides.businessWeekPnl,
      probed: true,
    }));
  }
  await replaceScopeBlockers({ orgId, weekKey, serviceLine, driverId: null }, blockers);
}

/** Blocking rows for one week and service line, in plain words. Fails closed. */
export async function listWeekBlocks(
  orgId: string,
  weekKey: string,
  serviceLine: ReconServiceLine,
): Promise<Array<{ code: string; driverId: string | null; message: string }>> {
  const { data, error } = await recon()
    .from("week_blockers")
    .select("code, driver_id, message")
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("service_line", serviceLine)
    .eq("severity", "block");
  if (error) throw new Error(`week blockers read failed: ${error.message}`);
  return ((data ?? []) as Array<{ code: string; driver_id: string | null; message: string | null }>).map((row) => ({
    code: row.code,
    driverId: row.driver_id,
    message: row.message || row.code,
  }));
}
