/**
 * Fuel week finalize gate (Phase 0 characterization).
 *
 * "Miscellaneous cost" is the fuel spend residual after Ride Share / Ops /
 * Deadhead / Personal are allocated (see computeMiscellaneousCost). A large
 * |misc| relative to total spend means the week is *over-explained* — the
 * categorization does not add up and the leftover is being split as if it were
 * real cash. RECONCILIATION_SYSTEM_AUDIT.md headline problem #1 shows a week
 * whose residual flipped a driver into a −$27,898.73 debit.
 *
 * This module adds a characterization gate: flag any week where |misc| exceeds
 * a fixed fraction of total spend, and floor a negative misc so an
 * over-explained (fleet-owes-driver) residual is never split as a driver debit.
 */

/** Misc may not exceed this fraction of total spend before a week is gated. */
export const FUEL_MISC_MAX_RATIO = 0.25;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * True when the miscellaneous residual is too large relative to total spend
 * (|misc| > ratio × totalSpend). A zero/negative totalSpend with any nonzero
 * misc is over-explained by definition.
 */
export function isOverExplainedFuelWeek(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
): boolean {
  const spend = num(totalSpend);
  const misc = num(miscellaneousCost);
  if (spend <= 0) return misc !== 0;
  return Math.abs(misc) > ratio * spend;
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
