/**
 * Pass 5.4 / H-4: Week P&L sides for Close Week settlement↔P&L tie.
 *
 * Non-tautological by construction:
 *   - settlement composition = sealed week_statements (desk / signed facts)
 *   - business P&L          = fresh engine recomputes (fuel/earnings probes; tolls = new toll system's week result)
 *
 * Comparing statement↔statement after cutover was x≈x; this can still fail.
 */
import { getServiceClient } from "./service_client.ts";
import {
  getLatestWeekStatementsForOrgWeek,
  type WeekStatementsByDriver,
} from "./week_statements.ts";
import { statementAmountMajor } from "../../../packages/finance-core/src/weekStatement.ts";
import type { WeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";
import { probeFuelEngineAmounts } from "./statement_engine_probe.ts";
import { findDriverTollLineInWeek, parseWeekDriversRpc } from "./toll_v2_settlement_inputs.ts";
import { computeEarningsEngineAmountsForWeek } from "./earnings_week_seal.ts";

function sb() {
  return getServiceClient();
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Fleet P&L contribution from one lane statement (major units). */
export function statementLanePnlMajor(s: WeekStatement): number {
  if (s.kind === "earnings") return statementAmountMajor(s, "companyShare");
  if (s.kind === "fuel") return statementAmountMajor(s, "companyShare");
  if (s.kind === "toll") {
    if (s.amountsMinor && "netLoss" in s.amountsMinor) {
      return statementAmountMajor(s, "netLoss");
    }
    const spend = statementAmountMajor(s, "totalSpend");
    const reimb = statementAmountMajor(s, "reimbursed");
    const charged = statementAmountMajor(s, "chargedToDriver");
    return round2(spend - reimb - charged);
  }
  return 0;
}

/** Σ sealed statement P&L for an org-week (settlement side of the tie). */
export function sumSettlementPnlFromStatements(
  byDriver: WeekStatementsByDriver,
): number {
  let total = 0;
  for (const stmts of byDriver.values()) {
    for (const s of stmts) {
      // Prefer closed; drafts still contribute when closing is in progress.
      if (s.status === "restated") continue;
      total = round2(total + statementLanePnlMajor(s));
    }
  }
  return total;
}

/**
 * Fresh engine recompute for org-week fleet P&L (business side of the tie).
 * Returns null when no engine lane produced a number (honest degrade).
 */
export async function sumBusinessWeekPnlMajor(
  organizationId: string,
  weekKey: string,
  driverIds?: string[],
): Promise<number | null> {
  const orgId = String(organizationId || "").trim();
  const week = String(weekKey || "").slice(0, 10);
  if (!orgId || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return null;

  let ids = driverIds;
  if (!ids) {
    const { data: periods, error } = await sb()
      .from("driver_financial_periods")
      .select("driver_id")
      .eq("organization_id", orgId)
      .eq("period_anchor", week);
    if (error) {
      console.warn("[business_week_pnl] period load failed", error.message);
      return null;
    }
    ids = (periods ?? []).map((p) => String(p.driver_id || "")).filter(Boolean);
  }

  // Tolls come from the new toll system (one read per company-week): the sealed result once sealed, live before.
  // Its driver line's fleetMinor is the toll net loss the toll statement records. A failed read throws, so close stops
  // (a null here would only be a warning and the tie would go unchecked).
  const { data: tollWeek, error: tollErr } = await sb().rpc("toll_sys_week_drivers", {
    p_company: orgId,
    p_week: week,
  });
  if (tollErr) {
    throw new Error(`[business_week_pnl] toll week read failed: ${tollErr.message}`);
  }
  const tollBundle = parseWeekDriversRpc(tollWeek);

  let total = 0;
  let any = false;
  for (const driverId of ids) {
    const [fuel, earn] = await Promise.all([
      probeFuelEngineAmounts(orgId, week, driverId),
      computeEarningsEngineAmountsForWeek(driverId, week),
    ]);
    const toll = findDriverTollLineInWeek(tollBundle, driverId);
    if (earn) {
      any = true;
      total = round2(total + Number(earn.companyShare || 0));
    }
    if (fuel) {
      any = true;
      total = round2(total + Number(fuel.companyShare || 0));
    }
    if (toll) {
      any = true;
      total = round2(total + (Number(toll.fleetMinor) || 0) / 100);
    }
  }

  return any ? total : null;
}

/** Load statements once + both P&L sides for Close Week. */
export async function weekPnlTieSides(
  organizationId: string,
  weekKey: string,
  driverIds: string[],
  opts?: { skipEngineProbe?: boolean },
): Promise<{
  statementsByDriver: WeekStatementsByDriver;
  settlementSumForWeek: number;
  businessWeekPnl: number | null;
}> {
  const statementsByDriver = await getLatestWeekStatementsForOrgWeek(
    organizationId,
    weekKey,
  );
  // Ensure every period driver is present (empty array) for reuse in loops.
  for (const id of driverIds) {
    if (!statementsByDriver.has(id)) statementsByDriver.set(id, []);
  }
  const settlementSumForWeek = sumSettlementPnlFromStatements(statementsByDriver);
  // Page reads use the saved settlement. They do not probe every driver.
  const businessWeekPnl = opts?.skipEngineProbe
    ? null
    : await sumBusinessWeekPnlMajor(organizationId, weekKey, driverIds);
  return { statementsByDriver, settlementSumForWeek, businessWeekPnl };
}
