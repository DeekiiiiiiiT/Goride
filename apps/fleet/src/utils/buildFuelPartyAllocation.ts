/**
 * Week Money Check — company vs driver category allocation lines for overlay.
 * Reconstructs frozen driverShare / companyShare (incl. Personal Allowance absorb).
 * Do not recompute leftover misc from overage-only personal — use report.miscellaneousCost.
 */
import { floorMiscForSplit } from '@roam/fuel-core';
import type { FuelScenario, WeeklyFuelReport } from '../types/fuel';
import { splitAllCategoryCosts } from './fuelCoverageSplit';
import { reportWeekYmdBounds } from './fuelWeekPeriod';
import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';
import { resolveActiveFuelPolicyForDriverWeek } from './fuelPolicyVersion';
import {
  personalCostForCoverageSplit,
  personalEarnedCostAbsorbed,
} from './personalAllowance';

export type FuelPartyAllocationParty = 'driver' | 'company';

export type FuelPartyAllocationLine = {
  key: string;
  label: string;
  amount: number;
  tooltip: string;
};

const LINE_META: Record<string, { label: string; tooltip: string }> = {
  rideShare: {
    label: 'Ride share',
    tooltip:
      'Fuel attributed to paid trip / en-route / open / unavailable km under your rideshare coverage rule.',
  },
  personal: {
    label: 'Personal',
    tooltip:
      'Personal overage after allowance — fuel for personal km beyond the earned band this week (charged to the driver when coverage sends it there).',
  },
  personalAllowance: {
    label: 'Personal allowance',
    tooltip:
      'Company-absorbed personal km inside the driver’s earned band this week.',
  },
  companyUsage: {
    label: 'Company usage',
    tooltip:
      'Fuel for company misc / maintenance adjustments (non-trip work use) under company coverage.',
  },
  deadhead: {
    label: 'Deadhead',
    tooltip:
      'Fuel for repositioning / empty cruising km between trips, split by your deadhead coverage rule.',
  },
  misc: {
    label: 'Unexplained (misc) — company-held',
    tooltip:
      'Leftover fuel spend after categories, timing, and unattributed fills — company-held under current policy; never billed to the driver.',
  },
  windowTiming: {
    label: 'Window timing',
    tooltip:
      'First-fill tank-window timing cost — company-held carve-out, not unexplained leakage.',
  },
  unattributedFill: {
    label: 'Unattributed fills',
    tooltip:
      'Fills logged without an odometer — purchase value of unmeasured fills; company-held until reviewed.',
  },
};

export function buildFuelPartyAllocation(
  reports: WeeklyFuelReport[],
  scenarios: FuelScenario[],
  party: FuelPartyAllocationParty,
): { lines: FuelPartyAllocationLine[]; total: number } {
  const sums = {
    rideShare: 0,
    companyUsage: 0,
    deadhead: 0,
    personal: 0,
    personalAllowance: 0,
    misc: 0,
    windowTiming: 0,
    unattributedFill: 0,
  };

  for (const r of reports) {
    const spend = Number(r.totalGasCardCost) || 0;
    const shareMag =
      Math.abs(Number(r.driverShare) || 0) + Math.abs(Number(r.companyShare) || 0);
    // O-2: do not drop zero-spend rows that still carry frozen shares into Total.
    if (spend <= FUEL_SPEND_EPS && shareMag <= FUEL_SPEND_EPS) continue;

    const { start } = reportWeekYmdBounds(r);
    const policy = resolveActiveFuelPolicyForDriverWeek(scenarios, r.driverId, start);
    const rule =
      policy?.scenario?.rules.find((x) => x.category === 'Fuel') ||
      ({ coverageType: 'Full', coverageValue: 100 } as const);

    // Mirror engine PA path: split overage personal + frozen misc; earned → company line.
    const { miscForSplit } = floorMiscForSplit(Number(r.miscellaneousCost) || 0);
    const split = splitAllCategoryCosts(
      {
        rideShare: Number(r.rideShareCost) || 0,
        companyUsage: Number(r.companyUsageCost) || 0,
        deadhead: Number(r.deadheadCost) || 0,
        personal: personalCostForCoverageSplit(r),
        misc: miscForSplit,
      },
      rule,
    );
    const side = party === 'driver' ? split.driver : split.company;
    sums.rideShare += side.rideShare;
    sums.companyUsage += side.companyUsage;
    sums.deadhead += side.deadhead;
    sums.personal += side.personal;
    sums.misc += side.misc;
    if (party === 'company') {
      sums.personalAllowance += personalEarnedCostAbsorbed(r);
      sums.windowTiming += Number(r.windowTimingCost) || 0;
      sums.unattributedFill += Number(r.unattributedFillCost) || 0;
    }
  }

  const keys =
    party === 'company'
      ? ([
          'rideShare',
          'personal',
          'personalAllowance',
          'companyUsage',
          'deadhead',
          'misc',
          'windowTiming',
          'unattributedFill',
        ] as const)
      : (['rideShare', 'personal', 'companyUsage', 'deadhead', 'misc'] as const);

  const lines: FuelPartyAllocationLine[] = keys.map((key) => ({
    key,
    label: LINE_META[key].label,
    tooltip: LINE_META[key].tooltip,
    amount: sums[key],
  }));

  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { lines, total };
}
