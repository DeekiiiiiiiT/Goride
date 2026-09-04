/**
 * Shared split math re-exports @roam/fuel-core (SoT for display + finalize freeze).
 * Fleet-only helpers below stay here for policy matrix / scenario UI.
 */
import type { FuelRule } from '../types/fuel';
import {
  getCompanyCoveragePercent,
  type CategoryCosts,
  type CategorySplit,
  type FuelCoverageCategory,
} from '@roam/fuel-core';

export {
  getCompanyCoveragePercent,
  getCategoryCoverageSplit,
  splitAllCategoryCosts,
  type FuelCoverageCategory,
  type CategoryCosts,
  type CategorySplit,
} from '@roam/fuel-core';

/** Resolve display matrix rows (company % / driver %) for policy cards. */
export function getCoverageMatrixRows(rule: FuelRule | undefined): {
  key: FuelCoverageCategory;
  label: string;
  companyPct: number;
  driverPct: number;
}[] {
  const labels: { key: FuelCoverageCategory; label: string }[] = [
    { key: 'rideShare', label: 'Ride Share' },
    { key: 'companyUsage', label: 'Company Ops' },
    { key: 'deadhead', label: 'Deadhead' },
    { key: 'personal', label: 'Personal' },
    { key: 'misc', label: 'Misc / Leakage' },
  ];

  if (!rule) {
    return labels.map(({ key, label }) => ({ key, label, companyPct: 100, driverPct: 0 }));
  }

  if (rule.coverageType === 'Full') {
    return labels.map(({ key, label }) =>
      key === 'personal'
        ? { key, label, companyPct: 0, driverPct: 100 }
        : { key, label, companyPct: 100, driverPct: 0 },
    );
  }

  if (rule.coverageType === 'Fixed_Amount') {
    // Fixed is $ not % — show qualitative markers via 100/0 for locked categories.
    return labels.map(({ key, label }) => {
      if (key === 'personal') return { key, label, companyPct: 0, driverPct: 100 };
      if (key === 'companyUsage' || key === 'deadhead') return { key, label, companyPct: 100, driverPct: 0 };
      return { key, label, companyPct: -1, driverPct: -1 }; // signal: allowance-based
    });
  }

  return labels.map(({ key, label }) => {
    const companyPct = getCompanyCoveragePercent(key, rule);
    return { key, label, companyPct, driverPct: 100 - companyPct };
  });
}

/** Ensure Percentage rules persist all five granular fields (display = stored). */
export function normalizePercentageRule(rule: FuelRule): FuelRule {
  if (rule.coverageType !== 'Percentage') return rule;
  return {
    ...rule,
    rideShareCoverage: rule.rideShareCoverage ?? rule.coverageValue,
    companyUsageCoverage: rule.companyUsageCoverage ?? rule.coverageValue,
    deadheadCoverage: rule.deadheadCoverage ?? rule.companyUsageCoverage ?? rule.coverageValue,
    personalCoverage: rule.personalCoverage ?? rule.coverageValue,
    miscCoverage: rule.miscCoverage ?? rule.coverageValue,
  };
}

/** Sample week costs for at-a-glance policy card previews. */
export const SAMPLE_WEEK_COSTS: CategoryCosts = {
  rideShare: 100,
  companyUsage: 40,
  deadhead: 30,
  personal: 40,
  misc: 20,
};

export function sumSplitTotals(split: CategorySplit): { company: number; driver: number } {
  const sum = (c: CategoryCosts) =>
    c.rideShare + c.companyUsage + c.deadhead + c.personal + c.misc;
  return { company: sum(split.company), driver: sum(split.driver) };
}
