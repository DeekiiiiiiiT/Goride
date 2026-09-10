/**
 * Pass 5: fresh engine recomputes for statement↔engine compare (no writes).
 */
import {
  compareFuelStatementVsEngine,
  compareTollStatementVsEngine,
  compareEarningsStatementVsEngine,
  shouldSkipZeroActivityTollCompare,
  type StatementEngineDrift,
  type FuelEngineAmounts,
  type TollEngineAmounts,
} from "../../../packages/finance-core/src/statementEngineCompare.ts";
import type { WeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";
import { computeEarningsEngineAmountsForWeek } from "./earnings_week_seal.ts";
import { resolveFuelCloseAmounts } from "./fuel_week_seal.ts";
import { resolveTollCloseAmounts } from "./toll_close_amounts.ts";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Same preference order as sealFuelWeek — locked weeks must not compare against a divergent rebuild. */
export async function probeFuelEngineAmounts(
  organizationId: string,
  weekKey: string,
  driverId: string,
): Promise<FuelEngineAmounts | null> {
  try {
    const amounts = await resolveFuelCloseAmounts({
      organizationId,
      weekKey,
      driverId,
    });
    return {
      driverShare: round2(amounts.driverShare),
      companyShare: round2(amounts.companyShare),
    };
  } catch (e) {
    console.warn("[statement_engine_probe] fuel probe failed", driverId, weekKey, e);
    return null;
  }
}

async function probeFuelEngine(
  organizationId: string,
  weekKey: string,
  driverId: string,
): Promise<FuelEngineAmounts | null> {
  return probeFuelEngineAmounts(organizationId, weekKey, driverId);
}

export async function probeTollEngineAmounts(
  organizationId: string,
  weekKey: string,
  driverId: string,
): Promise<TollEngineAmounts> {
  try {
    // Shared preference with sealTollWeek (toll_close_amounts).
    const amounts = await resolveTollCloseAmounts({
      organizationId,
      weekKey,
      driverId,
    });
    return {
      totalSpend: amounts.totalSpend,
      chargedToDriver: amounts.chargedToDriver,
      reimbursed: amounts.reimbursed,
    };
  } catch (e) {
    console.warn("[statement_engine_probe] toll probe failed", driverId, weekKey, e);
    return { totalSpend: 0, chargedToDriver: 0, reimbursed: 0 };
  }
}

async function probeTollEngine(
  organizationId: string,
  weekKey: string,
  driverId: string,
): Promise<TollEngineAmounts> {
  return probeTollEngineAmounts(organizationId, weekKey, driverId);
}

/**
 * Compare closed statements for one driver-week to fresh engines.
 * Skips draft/missing lanes (those already block via closeInvariants).
 */
export async function compareDriverWeekStatementsToEngines(opts: {
  organizationId: string;
  driverId: string;
  weekKey: string;
  statements: readonly WeekStatement[];
}): Promise<StatementEngineDrift[]> {
  const { organizationId, driverId, weekKey, statements } = opts;
  const drifts: StatementEngineDrift[] = [];

  for (const s of statements) {
    if (s.status !== "closed") continue;
    if (s.kind === "fuel") {
      const engine = await probeFuelEngine(organizationId, weekKey, driverId);
      if (engine) drifts.push(...compareFuelStatementVsEngine(s, engine));
    } else if (s.kind === "toll") {
      const engine = await probeTollEngine(organizationId, weekKey, driverId);
      // Genuine empty-week N/A only — late tolls after $0 seal must drift.
      if (shouldSkipZeroActivityTollCompare(s.closeReason, engine)) continue;
      drifts.push(...compareTollStatementVsEngine(s, engine));
    } else if (s.kind === "earnings") {
      const engine = await computeEarningsEngineAmountsForWeek(driverId, weekKey);
      if (engine) drifts.push(...compareEarningsStatementVsEngine(s, engine));
    }
  }
  return drifts;
}
