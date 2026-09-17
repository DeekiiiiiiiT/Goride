/** Operator-facing names for Consumption Reconciliation (M17 / U-13). */
export const UNEXPLAINED_LABEL = 'Unexplained';
export const OVER_EXPLAINED_LABEL = 'Over-explained';
/** F-1/N-2: first-fill tank-window timing — not leakage. */
export const WINDOW_TIMING_LABEL = 'Tank window / timing';
/** N-2: fills logged without an odometer — unmeasured burn, gated separately. */
export const UNATTRIBUTED_FILL_LABEL = 'Fills without odometer';
/** R-4: honest operator tooltip — purchase value; also offsets overstated km/L in-window. */
export const UNATTRIBUTED_FILL_TOOLTIP =
  'Fills without odometer — purchase value of unmeasured fills. When they sit inside the odometer window they also offset overstated km/L (categories look low by the same fuel).';

export function unexplainedLabel(amount: number): string {
  return amount < 0 ? OVER_EXPLAINED_LABEL : UNEXPLAINED_LABEL;
}

/**
 * F-11: Unavailable km stay in rideshare (locked rule). Documented for operators —
 * non-revenue Unavailable time is absorbed at the rideshare coverage rate by design.
 */
export const UNAVAILABLE_KM_POLICY =
  'Unavailable distance counts as rideshare km (locked product rule).';

/** Residual vs spend — never emit "beyond of spend" when pct is null. */
export function residualVsSpendPhrase(absPct: number | null): string {
  return absPct != null ? `${absPct}% of spend` : 'unmeasurable vs spend (spend is $0)';
}

/** Period badge: unlocked weeks are Open, not "Draft". */
export function fuelPeriodLockBadge(locked: boolean): 'Locked' | 'Open' {
  return locked ? 'Locked' : 'Open';
}

/** Settlement-preview fill status — distinct from period lock badge. */
export function fuelFillSettlementStatus(
  periodLocked: boolean,
  pendingCount: number,
): 'Period locked' | 'Fills pending' | 'Ready' {
  if (periodLocked) return 'Period locked';
  if (pendingCount > 0) return 'Fills pending';
  return 'Ready';
}
