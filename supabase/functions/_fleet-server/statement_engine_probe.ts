/**
 * Pass 5: fresh engine recomputes for statement↔engine compare (no writes).
 */
import {
  compareFuelStatementVsEngine,
  compareTollStatementVsEngine,
  compareEarningsStatementVsEngine,
  type StatementEngineDrift,
  type FuelEngineAmounts,
  type TollEngineAmounts,
  type EarningsEngineAmounts,
} from "../../../packages/finance-core/src/statementEngineCompare.ts";
import type { WeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";
import { computeTollWeekNetting } from "../../../packages/toll-core/src/tollWeekNetting.ts";
import { sumActiveTollChargedToDriverMajor } from "./toll_charged_from_financial_events.ts";
import { computeEarningsEngineAmountsForWeek } from "./earnings_week_seal.ts";
import { resolveFuelCloseAmounts } from "./fuel_week_seal.ts";

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

async function loadCanonicalTollEventsForDriverWeek(
  driverId: string,
  weekKey: string,
): Promise<Record<string, unknown>[]> {
  // Reuse seal path so probe and seal cannot diverge (Pass 5).
  const { loadCanonicalTollEventsForDriverWeek: load } = await import("./toll_week_seal.ts");
  return load(driverId, weekKey);
}

export async function probeTollEngineAmounts(
  organizationId: string,
  weekKey: string,
  driverId: string,
): Promise<TollEngineAmounts> {
  let tollSpend = 0;
  let reimbursed = 0;
  let chargedToDriver = 0;
  try {
    const events = await loadCanonicalTollEventsForDriverWeek(driverId, weekKey);
    if (events.length > 0) {
      const net = computeTollWeekNetting(events);
      tollSpend = round2(net.tagSpend + net.cashWashSpend);
      reimbursed = round2(net.platformReimbursed + net.disputeRecovered);
      chargedToDriver = round2(net.chargedToDrivers);
    }
    const wallet = await sumActiveTollChargedToDriverMajor({
      weekKey,
      driverId,
      organizationId,
    });
    if (wallet.hasEvents) chargedToDriver = wallet.charged;
  } catch (e) {
    console.warn("[statement_engine_probe] toll probe failed", driverId, weekKey, e);
  }
  return { totalSpend: tollSpend, chargedToDriver, reimbursed };
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
      // Skip engine compare for explicit zero N/A seals (no activity by design).
      if (s.closeReason === "zero_activity_na") continue;
      const engine = await probeTollEngine(organizationId, weekKey, driverId);
      drifts.push(...compareTollStatementVsEngine(s, engine));
    } else if (s.kind === "earnings") {
      const engine = await computeEarningsEngineAmountsForWeek(driverId, weekKey);
      if (engine) drifts.push(...compareEarningsStatementVsEngine(s, engine));
    }
  }
  return drifts;
}
