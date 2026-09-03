/**
 * Category coverage split — shared by browser FuelCalculationService and Deno week assembler.
 * Ported from apps/fleet fuelCoverageSplit (single SoT for leftover + shares).
 */

export type FuelCoverageCategory =
  | 'rideShare'
  | 'companyUsage'
  | 'deadhead'
  | 'personal'
  | 'misc';

export type CategoryCosts = Record<FuelCoverageCategory, number>;

export type CategorySplit = {
  company: CategoryCosts;
  driver: CategoryCosts;
};

export type FuelCoverageRule = {
  coverageType?: string;
  coverageValue?: number;
  rideShareCoverage?: number;
  companyUsageCoverage?: number;
  deadheadCoverage?: number;
  personalCoverage?: number;
  miscCoverage?: number;
};

const ZERO_COSTS: CategoryCosts = {
  rideShare: 0,
  companyUsage: 0,
  deadhead: 0,
  personal: 0,
  misc: 0,
};

export function getCompanyCoveragePercent(
  category: FuelCoverageCategory,
  rule: FuelCoverageRule,
): number {
  if (category === 'rideShare' && rule.rideShareCoverage !== undefined) {
    return rule.rideShareCoverage;
  }
  if (category === 'companyUsage' && rule.companyUsageCoverage !== undefined) {
    return rule.companyUsageCoverage;
  }
  if (category === 'deadhead') {
    if (rule.deadheadCoverage !== undefined) return rule.deadheadCoverage;
    if (rule.companyUsageCoverage !== undefined) return rule.companyUsageCoverage;
  }
  if (category === 'personal' && rule.personalCoverage !== undefined) {
    return rule.personalCoverage;
  }
  if (category === 'misc' && rule.miscCoverage !== undefined) return rule.miscCoverage;
  return Number(rule.coverageValue) || 0;
}

export function getCategoryCoverageSplit(
  category: FuelCoverageCategory,
  amount: number,
  rule: FuelCoverageRule | undefined,
): { company: number; driver: number } {
  if (!rule) return { company: amount, driver: 0 };

  if (rule.coverageType === 'Full') {
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
    if (category === 'companyUsage' || category === 'deadhead') {
      return { company: amount, driver: 0 };
    }
    const companyPay = Math.min(amount, rule.coverageValue || 0);
    return { company: companyPay, driver: amount - companyPay };
  }

  return { company: amount, driver: 0 };
}

export function splitAllCategoryCosts(
  costs: CategoryCosts,
  rule: FuelCoverageRule | undefined,
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

/** Spend residual after Ride Share / Ops / Deadhead / Personal (cash leakage). */
export function computeMiscellaneousCost(
  totalSpend: number,
  categorized: {
    rideShare?: number;
    companyUsage?: number;
    deadhead?: number;
    personal?: number;
  },
): number {
  const allocated =
    (Number(categorized.rideShare) || 0) +
    (Number(categorized.companyUsage) || 0) +
    (Number(categorized.deadhead) || 0) +
    (Number(categorized.personal) || 0);
  return totalSpend - allocated;
}

export function sumCategoryShare(side: CategoryCosts): number {
  return (
    side.rideShare + side.companyUsage + side.deadhead + side.personal + side.misc
  );
}

/**
 * Week money from spend + category $ + policy — browser and Deno must match.
 */
export function assembleLeftoverWeekMoney(input: {
  totalSpend: number;
  rideShareCost: number;
  companyUsageCost: number;
  deadheadCost: number;
  personalUsageCost: number;
  rule?: FuelCoverageRule | null;
}): {
  miscellaneousCost: number;
  companyShare: number;
  driverShare: number;
  costs: CategoryCosts;
  split: CategorySplit;
} {
  const miscellaneousCost = computeMiscellaneousCost(input.totalSpend, {
    rideShare: input.rideShareCost,
    companyUsage: input.companyUsageCost,
    deadhead: input.deadheadCost,
    personal: input.personalUsageCost,
  });
  const costs: CategoryCosts = {
    rideShare: input.rideShareCost,
    companyUsage: input.companyUsageCost,
    deadhead: input.deadheadCost,
    personal: input.personalUsageCost,
    misc: miscellaneousCost,
  };
  const split = splitAllCategoryCosts(costs, input.rule || undefined);
  return {
    miscellaneousCost,
    companyShare: sumCategoryShare(split.company),
    driverShare: sumCategoryShare(split.driver),
    costs,
    split,
  };
}
