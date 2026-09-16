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
    // F-8: true unexplained is company-held (not driver-billable via coverage %).
    return { company: amount, driver: 0 };
  }

  if (rule.coverageType === 'Percentage') {
    // F-8: misc / true unexplained never hits driver via Percentage sweep.
    if (category === 'misc') return { company: amount, driver: 0 };
    const pct = getCompanyCoveragePercent(category, rule);
    const companyPay = amount * (pct / 100);
    return { company: companyPay, driver: amount - companyPay };
  }

  if (rule.coverageType === 'Fixed_Amount') {
    if (category === 'personal') return { company: 0, driver: amount };
    if (category === 'companyUsage' || category === 'deadhead' || category === 'misc') {
      return { company: amount, driver: 0 };
    }
    const companyPay = Math.min(amount, rule.coverageValue || 0);
    return { company: companyPay, driver: amount - companyPay };
  }

  return { company: amount, driver: 0 };
}

/** H-10: known coverage types only — unknown must become a blocker, not Fixed_Amount. */
export function isKnownCoverageType(coverageType: unknown): boolean {
  const t = String(coverageType || '');
  return t === 'Full' || t === 'Percentage' || t === 'Fixed_Amount';
}

export function coverageRuleIsResolved(rule?: FuelCoverageRule | null): boolean {
  if (!rule) return false;
  return isKnownCoverageType(rule.coverageType);
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
  // F-8: misc is company-absorbed; Fixed_Amount allowance applies to rideShare only
  // (never pool misc with rideshare — that crowded out legitimate coverage).
  const company: CategoryCosts = {
    rideShare: 0,
    companyUsage: costs.companyUsage,
    deadhead: costs.deadhead,
    personal: 0,
    misc: costs.misc,
  };
  const driver: CategoryCosts = {
    rideShare: 0,
    companyUsage: 0,
    deadhead: 0,
    personal: costs.personal,
    misc: 0,
  };

  const coveredRideShare = Math.min(allowance, Math.max(0, costs.rideShare));
  company.rideShare = coveredRideShare;
  driver.rideShare = costs.rideShare - company.rideShare;

  return { company, driver };
}

/**
 * Litres outside the fill-to-fill efficiency set (first fill + no-odo fills).
 * Valued at price → windowTimingCost (F-1 / F-2) — inventory timing, not leakage.
 */
export function computeWindowTimingLiters(
  totalLiters: number,
  efficiencyFuel: number,
): number {
  return Math.max(0, (Number(totalLiters) || 0) - (Number(efficiencyFuel) || 0));
}

export function computeWindowTimingCost(
  totalLiters: number,
  efficiencyFuel: number,
  pricePerLiter: number,
): number {
  if (!(Number(pricePerLiter) > 0)) return 0;
  return computeWindowTimingLiters(totalLiters, efficiencyFuel) * pricePerLiter;
}

/**
 * True unexplained after Ride Share / Ops / Deadhead / Personal and window timing.
 * F-1: miscellaneousCost must NOT include first-fill / no-odo timing artefact.
 */
export function computeMiscellaneousCost(
  totalSpend: number,
  categorized: {
    rideShare?: number;
    companyUsage?: number;
    deadhead?: number;
    personal?: number;
    /** Named tank-window timing — carved out of unexplained (F-1). */
    windowTiming?: number;
  },
): number {
  const allocated =
    (Number(categorized.rideShare) || 0) +
    (Number(categorized.companyUsage) || 0) +
    (Number(categorized.deadhead) || 0) +
    (Number(categorized.personal) || 0) +
    (Number(categorized.windowTiming) || 0);
  return totalSpend - allocated;
}

export function sumCategoryShare(side: CategoryCosts): number {
  return (
    side.rideShare + side.companyUsage + side.deadhead + side.personal + side.misc
  );
}

import { floorMiscForSplit, isOverExplainedFuelWeek } from './fuelFinalizeGate.ts';

/**
 * Week money from spend + category $ + policy — browser and Deno must match.
 * Negative misc is floored for the split (C-2); over-explained magnitude is
 * returned separately and must never hit driverShare via Math.abs.
 */
export function assembleLeftoverWeekMoney(input: {
  totalSpend: number;
  rideShareCost: number;
  companyUsageCost: number;
  deadheadCost: number;
  personalUsageCost: number;
  /** F-1: tank-window timing carved out before residual. */
  windowTimingCost?: number;
  rule?: FuelCoverageRule | null;
}): {
  miscellaneousCost: number;
  windowTimingCost: number;
  overExplainedCost: number;
  overExplained: boolean;
  companyShare: number;
  driverShare: number;
  costs: CategoryCosts;
  split: CategorySplit;
  /** C-4: |Σ categories + timing + misc − totalSpend| — must be ≤ ε after assemble. */
  spendTieDelta: number;
} {
  const windowTimingCost = Math.max(0, Number(input.windowTimingCost) || 0);
  const miscellaneousCost = computeMiscellaneousCost(input.totalSpend, {
    rideShare: input.rideShareCost,
    companyUsage: input.companyUsageCost,
    deadhead: input.deadheadCost,
    personal: input.personalUsageCost,
    windowTiming: windowTimingCost,
  });
  const { miscForSplit, overExplainedCost } = floorMiscForSplit(miscellaneousCost);
  const costs: CategoryCosts = {
    rideShare: input.rideShareCost,
    companyUsage: input.companyUsageCost,
    deadhead: input.deadheadCost,
    personal: input.personalUsageCost,
    misc: miscForSplit,
  };
  const split = splitAllCategoryCosts(costs, input.rule || undefined);
  // Timing is company-held outside the coverage category split.
  const companyShare = sumCategoryShare(split.company) + windowTimingCost;
  const categorySum =
    input.rideShareCost +
    input.companyUsageCost +
    input.deadheadCost +
    input.personalUsageCost +
    windowTimingCost +
    miscellaneousCost;
  const spendTieDelta = categorySum - (Number(input.totalSpend) || 0);
  return {
    miscellaneousCost,
    windowTimingCost,
    overExplainedCost,
    overExplained: isOverExplainedFuelWeek(input.totalSpend, miscellaneousCost),
    companyShare,
    driverShare: sumCategoryShare(split.driver),
    costs,
    split,
    spendTieDelta,
  };
}

/** C-4 freeze invariant — categories + timing + misc must reconstruct spend. */
export function assertCategoryCostsTieSpend(
  totalSpend: number,
  categoryCosts: {
    rideShareCost: number;
    companyUsageCost: number;
    deadheadCost: number;
    personalUsageCost: number;
  },
  miscellaneousCost: number,
  eps = 0.02,
  windowTimingCost = 0,
): boolean {
  const sum =
    (Number(categoryCosts.rideShareCost) || 0) +
    (Number(categoryCosts.companyUsageCost) || 0) +
    (Number(categoryCosts.deadheadCost) || 0) +
    (Number(categoryCosts.personalUsageCost) || 0) +
    (Number(windowTimingCost) || 0) +
    (Number(miscellaneousCost) || 0);
  return Math.abs(sum - (Number(totalSpend) || 0)) <= eps;
}
