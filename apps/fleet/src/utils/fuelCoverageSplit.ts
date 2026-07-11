import type { FuelRule } from '../types/fuel';

export type FuelCoverageCategory = 'rideShare' | 'companyUsage' | 'deadhead' | 'personal' | 'misc';

export type CategoryCosts = Record<FuelCoverageCategory, number>;

export type CategorySplit = {
  company: CategoryCosts;
  driver: CategoryCosts;
};

const ZERO_COSTS: CategoryCosts = {
  rideShare: 0,
  companyUsage: 0,
  deadhead: 0,
  personal: 0,
  misc: 0,
};

/** Company coverage % (0–100) for Percentage rules — single fallback chain for all surfaces. */
export function getCompanyCoveragePercent(
  category: FuelCoverageCategory,
  rule: FuelRule,
): number {
  if (category === 'rideShare' && rule.rideShareCoverage !== undefined) return rule.rideShareCoverage;
  if (category === 'companyUsage' && rule.companyUsageCoverage !== undefined) return rule.companyUsageCoverage;
  if (category === 'deadhead') {
    if (rule.deadheadCoverage !== undefined) return rule.deadheadCoverage;
    if (rule.companyUsageCoverage !== undefined) return rule.companyUsageCoverage;
  }
  if (category === 'personal' && rule.personalCoverage !== undefined) return rule.personalCoverage;
  if (category === 'misc' && rule.miscCoverage !== undefined) return rule.miscCoverage;
  return rule.coverageValue;
}

/**
 * Per-category split for Full / Percentage.
 * Fixed_Amount: use splitAllCategoryCosts — single-category Fixed calls use degraded
 * semantics (ops/deadhead full company; personal full driver; rideShare/misc capped by allowance alone).
 */
export function getCategoryCoverageSplit(
  category: FuelCoverageCategory,
  amount: number,
  rule: FuelRule | undefined,
): { company: number; driver: number } {
  if (!rule) return { company: amount, driver: 0 };

  if (rule.coverageType === 'Full') {
    // Personal always on the driver; all other categories fully company.
    if (category === 'personal') return { company: 0, driver: amount };
    return { company: amount, driver: 0 };
  }

  if (rule.coverageType === 'Percentage') {
    const pct = getCompanyCoveragePercent(category, rule);
    const companyPay = amount * (pct / 100);
    return { company: companyPay, driver: amount - companyPay };
  }

  if (rule.coverageType === 'Fixed_Amount') {
    if (category === 'personal') return { company: 0, driver: amount };
    if (category === 'companyUsage' || category === 'deadhead') return { company: amount, driver: 0 };
    const companyPay = Math.min(amount, rule.coverageValue || 0);
    return { company: companyPay, driver: amount - companyPay };
  }

  return { company: amount, driver: 0 };
}

/**
 * Week-level split — canonical for reconciliation + ScenarioSplitDashboard.
 * Fixed_Amount: Personal → driver; Company Ops + Deadhead → company;
 * one weekly allowance applied to Ride Share + Misc combined (pro-rated if over).
 */
export function splitAllCategoryCosts(
  costs: CategoryCosts,
  rule: FuelRule | undefined,
): CategorySplit {
  if (!rule) {
    return {
      company: { ...costs },
      driver: { ...ZERO_COSTS },
    };
  }

  if (rule.coverageType === 'Percentage' || rule.coverageType === 'Full') {
    const company = { ...ZERO_COSTS };
    const driver = { ...ZERO_COSTS };
    (Object.keys(costs) as FuelCoverageCategory[]).forEach((cat) => {
      const split = getCategoryCoverageSplit(cat, costs[cat], rule);
      company[cat] = split.company;
      driver[cat] = split.driver;
    });
    return { company, driver };
  }

  // Fixed_Amount
  const allowance = rule.coverageValue || 0;
  const company: CategoryCosts = {
    rideShare: 0,
    companyUsage: costs.companyUsage,
    deadhead: costs.deadhead,
    personal: 0,
    misc: 0,
  };
  const driver: CategoryCosts = {
    rideShare: 0,
    companyUsage: 0,
    deadhead: 0,
    personal: costs.personal,
    misc: 0,
  };

  const variable = costs.rideShare + costs.misc;
  const coveredVariable = Math.min(allowance, Math.max(0, variable));
  if (variable > 0 && coveredVariable > 0) {
    const ratio = coveredVariable / variable;
    company.rideShare = costs.rideShare * ratio;
    company.misc = costs.misc * ratio;
  }
  driver.rideShare = costs.rideShare - company.rideShare;
  driver.misc = costs.misc - company.misc;

  return { company, driver };
}

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
