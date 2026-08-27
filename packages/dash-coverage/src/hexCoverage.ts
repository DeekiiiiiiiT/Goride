/**
 * ADR 0013 coverage reason codes + customer copy.
 */
export type CoverageReasonCode =
  | 'market_inactive'
  | 'excluded_zone'
  | 'out_of_coverage'
  | 'too_far_from_store'
  | 'outside_parish';

export const COVERAGE_CUSTOMER_COPY: Record<CoverageReasonCode, string> = {
  market_inactive: 'Roam Rush is not available in this area yet.',
  excluded_zone: "We're not currently serving your address.",
  out_of_coverage: "You're outside our delivery zone.",
  too_far_from_store: "This store doesn't deliver that far.",
  outside_parish: "You're outside our delivery zone.",
};

export function customerCopyForReason(code: string | undefined | null): string {
  if (code && code in COVERAGE_CUSTOMER_COPY) {
    return COVERAGE_CUSTOMER_COPY[code as CoverageReasonCode];
  }
  return "You're outside our delivery zone.";
}

/** Hex-set evaluation (market cells). Merchant reach is a separate optional narrow. */
export function evaluateHexCoverage(opts: {
  customerCell: string;
  includeCells: Set<string> | string[];
  excludeCells?: Set<string> | string[];
  merchantCells?: Set<string> | string[] | null;
}): { inZone: boolean; reasonCode?: CoverageReasonCode } {
  const include = opts.includeCells instanceof Set ? opts.includeCells : new Set(opts.includeCells);
  const exclude = opts.excludeCells
    ? opts.excludeCells instanceof Set
      ? opts.excludeCells
      : new Set(opts.excludeCells)
    : new Set<string>();

  if (exclude.has(opts.customerCell)) {
    return { inZone: false, reasonCode: 'excluded_zone' };
  }
  if (!include.has(opts.customerCell)) {
    return { inZone: false, reasonCode: 'out_of_coverage' };
  }
  if (opts.merchantCells) {
    const merchant =
      opts.merchantCells instanceof Set ? opts.merchantCells : new Set(opts.merchantCells);
    if (!merchant.has(opts.customerCell)) {
      return { inZone: false, reasonCode: 'too_far_from_store' };
    }
  }
  return { inZone: true };
}
