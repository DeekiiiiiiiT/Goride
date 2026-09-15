/**
 * Pure week money compute — isomorphic Engine A core for server recompute (Stage 5).
 * No I/O. Client display and server authority must call the same function.
 */
import {
  assembleLeftoverWeekMoney,
  type FuelCoverageRule,
} from './fuelCoverageSplit.ts';
import { classifyFuelMiscResidual, type FuelMiscResidualKind } from './fuelFinalizeGate.ts';

export type ComputeFuelWeekInput = {
  totalSpend: number;
  rideShareCost: number;
  companyUsageCost: number;
  deadheadCost: number;
  personalUsageCost: number;
  rule?: FuelCoverageRule | null;
  driverId?: string;
  vehicleId?: string;
  weekStart?: string;
  weekEnd?: string;
};

export type WeekCalc = {
  totalSpend: number;
  companyShare: number;
  driverShare: number;
  miscellaneousCost: number;
  overExplainedCost: number;
  residualKind: FuelMiscResidualKind;
  driverId?: string;
  vehicleId?: string;
  weekStart?: string;
  weekEnd?: string;
};

export function computeFuelWeek(input: ComputeFuelWeekInput): WeekCalc {
  const money = assembleLeftoverWeekMoney({
    totalSpend: Number(input.totalSpend) || 0,
    rideShareCost: Number(input.rideShareCost) || 0,
    companyUsageCost: Number(input.companyUsageCost) || 0,
    deadheadCost: Number(input.deadheadCost) || 0,
    personalUsageCost: Number(input.personalUsageCost) || 0,
    rule: input.rule,
  });
  return {
    totalSpend: Number(input.totalSpend) || 0,
    companyShare: money.companyShare,
    driverShare: money.driverShare,
    miscellaneousCost: money.miscellaneousCost,
    overExplainedCost: money.overExplainedCost,
    residualKind: classifyFuelMiscResidual(
      Number(input.totalSpend) || 0,
      money.miscellaneousCost,
    ),
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
  };
}

const EPS = 0.01;

/** Per-field absolute deltas for shadow/enforce compare. */
export function diffWeekCalc(
  reviewed: Pick<WeekCalc, 'totalSpend' | 'companyShare' | 'driverShare' | 'miscellaneousCost'>,
  recomputed: Pick<WeekCalc, 'totalSpend' | 'companyShare' | 'driverShare' | 'miscellaneousCost'>,
): { field: string; delta: number }[] {
  const fields: Array<keyof typeof reviewed> = [
    'totalSpend',
    'companyShare',
    'driverShare',
    'miscellaneousCost',
  ];
  const out: { field: string; delta: number }[] = [];
  for (const f of fields) {
    const delta = (Number(recomputed[f]) || 0) - (Number(reviewed[f]) || 0);
    if (Math.abs(delta) > EPS) out.push({ field: f, delta });
  }
  return out;
}

export function weekCalcMatches(
  a: Parameters<typeof diffWeekCalc>[0],
  b: Parameters<typeof diffWeekCalc>[1],
  eps = EPS,
): boolean {
  return diffWeekCalc(a, b).every((d) => Math.abs(d.delta) <= eps);
}
