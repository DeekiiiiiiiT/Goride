/**
 * Fuel week finalize gate (Phase 0 characterization).
 *
 * "Miscellaneous cost" is the fuel spend residual after Ride Share / Ops /
 * Deadhead / Personal are allocated (see computeMiscellaneousCost). A large
 * |misc| relative to total spend means the week residual needs review.
 *
 * C-7: negative misc (over-explained) and positive misc (under-explained) are
 * opposite problems — never conflate them in product copy or hard-blocks.
 */

/** Misc may not exceed this fraction of total spend before a week is gated. */
export const FUEL_MISC_MAX_RATIO = 0.25;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type FuelMiscResidualKind = 'ok' | 'over_explained' | 'under_explained';

/**
 * Classify residual sign + magnitude. over = modelled costs exceed spend;
 * under = spend not fully explained by categories.
 */
export function classifyFuelMiscResidual(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
): FuelMiscResidualKind {
  const spend = num(totalSpend);
  const misc = num(miscellaneousCost);
  if (spend <= 0) {
    if (misc === 0) return 'ok';
    return misc < 0 ? 'over_explained' : 'under_explained';
  }
  if (Math.abs(misc) <= ratio * spend) return 'ok';
  return misc < 0 ? 'over_explained' : 'under_explained';
}

/** Negative residual beyond ratio — modelling artefact; hard block. */
export function isOverExplainedResidual(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
): boolean {
  return classifyFuelMiscResidual(totalSpend, miscellaneousCost, ratio) === 'over_explained';
}

/** Positive residual beyond ratio — possibly real cash loss; reviewable. */
export function isUnderExplainedResidual(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
): boolean {
  return classifyFuelMiscResidual(totalSpend, miscellaneousCost, ratio) === 'under_explained';
}

/**
 * True when |misc| is too large relative to total spend (legacy abs gate).
 * Prefer classifyFuelMiscResidual / isOverExplainedResidual for new code.
 */
export function isOverExplainedFuelWeek(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
): boolean {
  return classifyFuelMiscResidual(totalSpend, miscellaneousCost, ratio) !== 'ok';
}

/**
 * Gate helper — true when the week's misc is WITHIN the allowed band and may
 * finalize without human review. Inverse of isOverExplainedFuelWeek.
 */
export function isFuelMiscWithinGate(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
): boolean {
  return !isOverExplainedFuelWeek(totalSpend, miscellaneousCost, ratio);
}

export type FlooredMiscSplit = {
  /** Misc to split as real cash (never negative). */
  miscForSplit: number;
  /** Magnitude of a negative misc — fleet over-explained, not a driver debit. */
  overExplainedCost: number;
};

/**
 * Split a raw misc into the amount that may be allocated as cash and the
 * over-explained magnitude that must NOT hit a driver's balance.
 * A negative misc (fleet owes driver) floors to 0 for the split and is
 * reported separately instead of being passed through Math.abs().
 */
export function floorMiscForSplit(miscellaneousCost: number): FlooredMiscSplit {
  const misc = num(miscellaneousCost);
  return {
    miscForSplit: Math.max(0, misc),
    overExplainedCost: misc < 0 ? -misc : 0,
  };
}
