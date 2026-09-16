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
  /** F-1: tank-window timing carved before residual. */
  windowTimingCost?: number;
  rule?: FuelCoverageRule | null;
  driverId?: string;
  vehicleId?: string;
  weekStart?: string;
  weekEnd?: string;
  /** N-17: PA earned personal absorbed fully to company after category split (major units). */
  personalAllowanceEarnedCost?: number;
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
  personalAllowanceEarnedCost: number;
};

/** Apply FCS Personal Allowance absorb: earned personal moves fully to company. */
export function applyPersonalAllowanceAbsorb(
  companyShare: number,
  driverShare: number,
  earnedRaw: number | null | undefined,
): { companyShare: number; driverShare: number; earned: number } {
  const earned = Number(earnedRaw) || 0;
  if (earned <= 0.009) {
    return { companyShare, driverShare, earned: 0 };
  }
  return {
    driverShare: Math.max(0, driverShare - earned),
    companyShare: companyShare + earned,
    earned,
  };
}

export function computeFuelWeek(input: ComputeFuelWeekInput): WeekCalc {
  const money = assembleLeftoverWeekMoney({
    totalSpend: Number(input.totalSpend) || 0,
    rideShareCost: Number(input.rideShareCost) || 0,
    companyUsageCost: Number(input.companyUsageCost) || 0,
    deadheadCost: Number(input.deadheadCost) || 0,
    personalUsageCost: Number(input.personalUsageCost) || 0,
    windowTimingCost: Number(input.windowTimingCost) || 0,
    rule: input.rule,
  });
  const absorbed = applyPersonalAllowanceAbsorb(
    money.companyShare,
    money.driverShare,
    input.personalAllowanceEarnedCost,
  );
  return {
    totalSpend: Number(input.totalSpend) || 0,
    companyShare: absorbed.companyShare,
    driverShare: absorbed.driverShare,
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
    personalAllowanceEarnedCost: absorbed.earned,
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
