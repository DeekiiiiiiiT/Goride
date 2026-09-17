/**
 * Fuel week finalize gate (Phase 0 characterization).
 *
 * "Miscellaneous cost" is the fuel spend residual after Ride Share / Ops /
 * Deadhead / Personal are allocated (see computeMiscellaneousCost). A large
 * |misc| relative to total spend means the week residual needs review.
 *
 * C-7: negative misc (over-explained) and positive misc (under-explained) are
 * opposite problems — never conflate them in product copy or hard-blocks.
 *
 * F-9: residual must pass BOTH the ratio band and an absolute JMD ceiling.
 */

/** Misc may not exceed this fraction of total spend before a week is gated. */
export const FUEL_MISC_MAX_RATIO = 0.25;

/** Absolute JMD ceiling — high-spend weeks cannot free-pass large residuals. */
export const FUEL_MISC_MAX_ABS_JMD = 5000;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type FuelMiscResidualKind = 'ok' | 'over_explained' | 'under_explained';

/**
 * Classify residual sign + magnitude. over = modelled costs exceed spend;
 * under = spend not fully explained by categories.
 * F-9: ok only when |misc| ≤ ratio×spend AND |misc| ≤ absCap.
 */
export function classifyFuelMiscResidual(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): FuelMiscResidualKind {
  const spend = num(totalSpend);
  const misc = num(miscellaneousCost);
  if (spend <= 0) {
    if (misc === 0) return 'ok';
    return misc < 0 ? 'over_explained' : 'under_explained';
  }
  const withinRatio = Math.abs(misc) <= ratio * spend;
  const withinAbs = Math.abs(misc) <= absCap;
  if (withinRatio && withinAbs) return 'ok';
  return misc < 0 ? 'over_explained' : 'under_explained';
}

/** Negative residual beyond gate — modelling artefact; hard block. */
export function isOverExplainedResidual(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): boolean {
  return classifyFuelMiscResidual(totalSpend, miscellaneousCost, ratio, absCap) === 'over_explained';
}

/** Positive residual beyond gate — possibly real cash loss; reviewable. */
export function isUnderExplainedResidual(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): boolean {
  return classifyFuelMiscResidual(totalSpend, miscellaneousCost, ratio, absCap) === 'under_explained';
}

/**
 * True when |misc| is too large relative to total spend (legacy abs gate).
 * Prefer classifyFuelMiscResidual / isOverExplainedResidual for new code.
 */
export function isOverExplainedFuelWeek(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): boolean {
  return classifyFuelMiscResidual(totalSpend, miscellaneousCost, ratio, absCap) !== 'ok';
}

/**
 * Gate helper — true when the week's misc is WITHIN the allowed band and may
 * finalize without human review. Inverse of isOverExplainedFuelWeek.
 */
export function isFuelMiscWithinGate(
  totalSpend: number,
  miscellaneousCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): boolean {
  return !isOverExplainedFuelWeek(totalSpend, miscellaneousCost, ratio, absCap);
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

/** Minimal row shape for per-report residual classification (F-4). */
export type FuelResidualSpendRow = {
  totalSpend: number;
  miscellaneousCost: number;
  vehicleId?: string;
  driverId?: string;
};

export type FuelResidualBlockerRow = FuelResidualSpendRow & {
  pctOfSpend: number | null;
  kind: 'over_explained' | 'under_explained';
};

function toBlockerRow(
  row: FuelResidualSpendRow,
  kind: 'over_explained' | 'under_explained',
): FuelResidualBlockerRow {
  const spend = num(row.totalSpend);
  const misc = num(row.miscellaneousCost);
  return {
    totalSpend: spend,
    miscellaneousCost: misc,
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    pctOfSpend: spend > 0 ? Math.round((Math.abs(misc) / spend) * 100) : null,
    kind,
  };
}

/** Per-row over-explained residuals — never finalize these. */
export function listOverExplainedResidualRows(
  rows: FuelResidualSpendRow[],
): FuelResidualBlockerRow[] {
  return rows
    .filter((r) => isOverExplainedResidual(r.totalSpend, r.miscellaneousCost))
    .map((r) => toBlockerRow(r, 'over_explained'));
}

/** Per-row under-explained residuals — reviewable with leakage acceptance. */
export function listUnderExplainedResidualRows(
  rows: FuelResidualSpendRow[],
): FuelResidualBlockerRow[] {
  return rows
    .filter((r) => isUnderExplainedResidual(r.totalSpend, r.miscellaneousCost))
    .map((r) => toBlockerRow(r, 'under_explained'));
}

/**
 * N-2: no-odometer fill spend uses the same ratio + absolute caps as misc.
 * Returns true when unattributed exceeds the gate (needs wizard acknowledgment).
 */
export function isUnattributedBeyondGate(
  totalSpend: number,
  unattributedFillCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): boolean {
  const spend = num(totalSpend);
  const unattr = Math.max(0, num(unattributedFillCost));
  if (unattr <= 0) return false;
  if (spend <= 0) return unattr > 0;
  return !(unattr <= ratio * spend && unattr <= absCap);
}

/** Alias — classify unattributed against the misc gate band. */
export function classifyUnattributedResidual(
  totalSpend: number,
  unattributedFillCost: number,
  ratio: number = FUEL_MISC_MAX_RATIO,
  absCap: number = FUEL_MISC_MAX_ABS_JMD,
): 'ok' | 'needs_review' {
  return isUnattributedBeyondGate(totalSpend, unattributedFillCost, ratio, absCap)
    ? 'needs_review'
    : 'ok';
}

/**
 * F-4: flags from snapshot/report rows so opposite residuals cannot cancel
 * in a week aggregate.
 */
export function residualFlagsFromSpendRows(rows: FuelResidualSpendRow[]): {
  anyOverExplained: boolean;
  anyUnderExplained: boolean;
} {
  return {
    anyOverExplained: listOverExplainedResidualRows(rows).length > 0,
    anyUnderExplained: listUnderExplainedResidualRows(rows).length > 0,
  };
}

/** Map finalized snaps / reports into residual spend rows. */
export function residualSpendRowsFromSnapshots(
  snaps: Array<Record<string, unknown> | null | undefined>,
): FuelResidualSpendRow[] {
  return (snaps || [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map((s) => ({
      totalSpend: num(s.totalGasCardCost ?? s.totalSpend),
      miscellaneousCost: num(s.miscellaneousCost),
      vehicleId: s.vehicleId != null ? String(s.vehicleId) : undefined,
      driverId: s.driverId != null ? String(s.driverId) : undefined,
    }));
}
