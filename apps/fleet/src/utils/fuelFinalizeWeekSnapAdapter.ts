/**
 * NEW-13 — map a browser WeeklyFuelReport into fuel-core CalcInput and freeze money
 * through assembleWeekSnapshotsFromCalcInput (same assembler Deno build-snapshots uses).
 */
import {
  assembleWeekSnapshotsFromCalcInput,
  type BuiltWeekSnapshot,
  type WeekSnapEntry,
  type WeekSnapFuelRule,
} from '@roam/fuel-core';
import type { FuelEntry, WeeklyFuelReport } from '../types/fuel';
import {
  personalCostForCoverageSplit,
  personalEarnedCostAbsorbed,
} from './personalAllowance';
import { reportWeekYmdBounds } from './fuelWeekPeriod';

export type FreezeSnapMoney = {
  driverShare: number;
  companyShare: number;
  miscellaneousCost: number;
  totalGasCardCost: number;
  blendedRatio: number;
  postedDriverShare: number;
  postedCompanyShare: number;
  built: BuiltWeekSnapshot;
};

function toWeekSnapFuelRule(rule: WeekSnapFuelRule | null | undefined): WeekSnapFuelRule | null {
  if (!rule) return null;
  return {
    coverageType: rule.coverageType,
    coverageValue: rule.coverageValue,
    rideShareCoverage: rule.rideShareCoverage,
    companyUsageCoverage: rule.companyUsageCoverage,
    deadheadCoverage: rule.deadheadCoverage,
    personalCoverage: rule.personalCoverage,
    miscCoverage: rule.miscCoverage,
    category: rule.category,
  };
}

/** Build CalcInput category costs from the same FCS report the operator just reviewed. */
export function categoryCostsFromReport(report: WeeklyFuelReport): {
  rideShareCost: number;
  companyUsageCost: number;
  deadheadCost: number;
  personalUsageCost: number;
} {
  return {
    rideShareCost: Number(report.rideShareCost) || 0,
    companyUsageCost: Number(report.companyUsageCost) || 0,
    deadheadCost: Number(report.deadheadCost) || 0,
    // Full measured personal — leftover/misc identity matches FCS pre-PA math.
    personalUsageCost: Number(report.personalUsageCost) || 0,
  };
}

export function entriesToWeekSnapEntries(
  entries: FuelEntry[],
  report: WeeklyFuelReport,
): WeekSnapEntry[] {
  return entries.map((e) => {
    const stamped = Number((e as { driverShareRatio?: number }).driverShareRatio);
    return {
      id: e.id,
      amount: Number(e.amount) || 0,
      date: String(e.date || '').split('T')[0],
      driverId: e.driverId || report.driverId,
      vehicleId: e.vehicleId || report.vehicleId,
      driverShareRatio: Number.isFinite(stamped) ? stamped : null,
    };
  });
}

/**
 * Freeze driver-week money through assembleWeekSnapshotsFromCalcInput.
 * PA earned absorb is applied after assembly so company gets 100% of earned personal
 * (matches FuelCalculationService), while leftover misc stays tied to full personal.
 */
export function freezeReportMoneyThroughAssembler(args: {
  report: WeeklyFuelReport;
  settleEntries: FuelEntry[];
  fuelRule?: WeekSnapFuelRule | null;
  orgId?: string;
  builtBy?: string;
}): FreezeSnapMoney {
  const { report, settleEntries, fuelRule, orgId = '', builtBy = 'fuel_finalize_client' } = args;
  const { start, end } = reportWeekYmdBounds(report);
  const snapEntries = entriesToWeekSnapEntries(settleEntries, report);
  const entriesByDriver = new Map<string, WeekSnapEntry[]>([[report.driverId, snapEntries]]);
  const driverContexts = new Map([
    [
      report.driverId,
      {
        driverId: report.driverId,
        vehicleId: report.vehicleId,
        vehicleIds: report.vehicleIds || [report.vehicleId],
        fuelRule: toWeekSnapFuelRule(fuelRule),
        categoryCosts: categoryCostsFromReport(report),
      },
    ],
  ]);

  const builtList = assembleWeekSnapshotsFromCalcInput({
    weekStart: start,
    weekEnd: end,
    orgId,
    entriesByDriver,
    driverContexts,
    builtBy,
  });

  const built =
    builtList[0] ||
    ({
      weekStart: start,
      weekEnd: end,
      driverId: report.driverId,
      vehicleId: report.vehicleId,
      vehicleIds: report.vehicleIds || [report.vehicleId],
      totalGasCardCost: Number(report.totalGasCardCost) || 0,
      gasCardSpend: Number(report.totalGasCardCost) || 0,
      driverSpend: 0,
      companyShare: Number(report.companyShare) || 0,
      driverShare: Number(report.driverShare) || 0,
      miscellaneousCost: Number(report.miscellaneousCost) || 0,
      pendingCount: settleEntries.length,
      status: 'Finalized' as const,
      finalizedAt: new Date().toISOString(),
      postedDriverShare: Number(report.driverShare) || 0,
      postedCompanyShare: Number(report.companyShare) || 0,
      netPay: 0,
      fuelCycles: [],
      orgId,
      org_id: orgId,
      metadata: {
        builtBy,
        settledEntries: [],
        blendedRatio: 0,
        appliedFuelRule: fuelRule || null,
        brain: null,
      },
    } satisfies BuiltWeekSnapshot);

  let driverShare = built.driverShare;
  let companyShare = built.companyShare;
  const miscellaneousCost = built.miscellaneousCost;
  const totalGasCardCost = built.totalGasCardCost || Number(report.totalGasCardCost) || 0;

  // PA: FCS moves earned personal fully to company after category split.
  const earned = personalEarnedCostAbsorbed(report);
  const overage = personalCostForCoverageSplit(report);
  if (earned > 0.009 && Math.abs((Number(report.personalUsageCost) || 0) - overage - earned) < 0.02) {
    driverShare = Math.max(0, driverShare - earned);
    companyShare = companyShare + earned;
  }

  const blendedRatio = totalGasCardCost > 0 ? driverShare / totalGasCardCost : 0;
  const settleSpend = snapEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const postedDriverShare = settleSpend * blendedRatio;
  const postedCompanyShare = Math.max(0, settleSpend - postedDriverShare);

  return {
    driverShare,
    companyShare,
    miscellaneousCost,
    totalGasCardCost,
    blendedRatio,
    postedDriverShare,
    postedCompanyShare,
    built: {
      ...built,
      driverShare,
      companyShare,
      miscellaneousCost,
      postedDriverShare,
      postedCompanyShare,
      metadata: {
        ...built.metadata,
        blendedRatio,
      },
    },
  };
}
