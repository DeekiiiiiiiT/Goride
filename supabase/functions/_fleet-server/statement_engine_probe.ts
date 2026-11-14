/**
 * Pass 5: fresh engine recomputes for statement↔engine compare (no writes).
 */
import {
  compareFuelStatementVsEngine,
  compareEarningsStatementVsEngine,
  type StatementEngineDrift,
  type FuelEngineAmounts,
} from "../../../packages/finance-core/src/statementEngineCompare.ts";
import type { WeekStatement } from "../../../packages/finance-core/src/weekStatement.ts";
import { computeEarningsEngineAmountsForWeek } from "./earnings_week_seal.ts";
import {
  loadFuelCloseRebuildMap,
  resolveFuelCloseAmounts,
  type FuelCloseAmounts,
} from "./fuel_week_seal.ts";

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Same preference order as sealFuelWeek — locked weeks must not compare against a divergent rebuild. */
export async function probeFuelEngineAmounts(
  organizationId: string,
  weekKey: string,
  driverId: string,
  /** P-4: pass shared week rebuild row (or null) so probe does not rebuild per driver. */
  fromRebuild?: FuelCloseAmounts | null,
): Promise<FuelEngineAmounts | null> {
  try {
    const amounts = await resolveFuelCloseAmounts({
      organizationId,
      weekKey,
      driverId,
      ...(fromRebuild !== undefined ? { fromRebuild } : {}),
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
  fromRebuild?: FuelCloseAmounts | null,
): Promise<FuelEngineAmounts | null> {
  return probeFuelEngineAmounts(organizationId, weekKey, driverId, fromRebuild);
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

  // P-4: one rebuild map per compare (not per fuel statement / resolve call).
  let fuelRebuild: FuelCloseAmounts | null | undefined = undefined;
  if (statements.some((s) => s.status === "closed" && s.kind === "fuel")) {
    try {
      const map = await loadFuelCloseRebuildMap(organizationId, weekKey);
      fuelRebuild = map.get(driverId) || null;
    } catch {
      fuelRebuild = null;
    }
  }

  for (const s of statements) {
    if (s.status !== "closed") continue;
    // Tolls: the toll statement is the new toll system's sealed result; that system runs its own nightly money checks.
    if (s.kind === "fuel") {
      const engine = await probeFuelEngine(organizationId, weekKey, driverId, fuelRebuild);
      if (engine) drifts.push(...compareFuelStatementVsEngine(s, engine));
    } else if (s.kind === "earnings") {
      const engine = await computeEarningsEngineAmountsForWeek(driverId, weekKey);
      if (engine) drifts.push(...compareEarningsStatementVsEngine(s, engine));
    }
  }
  return drifts;
}
