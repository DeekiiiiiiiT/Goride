/**
 * Rolling fuel credit reads only locked earlier weeks.
 * The input hash still sees every earlier week, locked or not, so a recompute moves the later week.
 */
import { addDaysYmd } from './fleetTime.ts';
import { FUEL_ENGINE_VERSION } from './fuelEngine.ts';

export function priorWeekStarts(weekStart: string): string[] {
  return [3, 2, 1].map((n) => addDaysYmd(weekStart, -7 * n));
}

export function isChainFuelSnapshot(engineVersion: string): boolean {
  const version = String(engineVersion || '');
  return version === FUEL_ENGINE_VERSION
    || version === 'fuel-chain-v2'
    || version.startsWith('fuel-chain-v2.');
}

export type PriorWeekVarianceRow = {
  driverId: string;
  vehicleId: string;
  miscellaneousCost: number;
};

/** One of the three weeks before the week being prepared. Oldest first when listed. */
export type PriorWeekFact = {
  weekStart: string;
  /** Empty when this calendar week was never started. */
  status: string;
  version: number;
  engineVersion: string;
  variances: PriorWeekVarianceRow[];
};

export type PriorWeekCredit = {
  /** Oldest first. Locked chain snapshots only; an open week is 0. */
  byKey: Map<string, number[]>;
  /** Started weeks that are not locked. Oldest first. */
  openWeekStarts: string[];
  weeks: PriorWeekFact[];
};

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function buildPriorWeekCredit(facts: PriorWeekFact[]): PriorWeekCredit {
  const byKey = new Map<string, number[]>();
  const openWeekStarts: string[] = [];
  facts.forEach((fact, slot) => {
    const status = String(fact.status || '');
    if (status && status !== 'locked') openWeekStarts.push(fact.weekStart);
    if (status !== 'locked' || !isChainFuelSnapshot(fact.engineVersion)) return;
    for (const row of fact.variances || []) {
      const driverId = String(row.driverId || '');
      const vehicleId = String(row.vehicleId || '');
      if (!driverId || !vehicleId) continue;
      const series = byKey.get(`${driverId}:${vehicleId}`) || [0, 0, 0];
      series[slot] = round2(row.miscellaneousCost);
      byKey.set(`${driverId}:${vehicleId}`, series);
    }
  });
  return { byKey, openWeekStarts, weeks: facts };
}
