/**
 * Shared close-week blocker vocabulary (audit §6.5 / Phase 7).
 *
 * One vocabulary across Fuel, Tolls and Settlement so every surface names a
 * blocker the same way. The cross-system invariant codes come from
 * `@roam/finance-core` (`checkCloseInvariants`); this maps each to a lane, a
 * plain-English label and a deep-link target so the "Close the Week" screen and
 * the Driver Settlements desk speak the same language.
 */
import type { CloseBlocker } from '@roam/finance-core';

export type { CloseBlocker } from '@roam/finance-core';

/** The three lanes a week must clear before it can close. */
export type CloseLane = 'fuel' | 'toll' | 'settlement';

/** Lane state shown on each card. */
export type CloseLaneStatus = 'clear' | 'blocked' | 'pending' | 'loading';

/** Page id each lane's Review button deep-links to (see pageRegistry / App.tsx). */
export const LANE_REVIEW_PAGE: Record<CloseLane, string> = {
  fuel: 'fuel-reconciliation',
  toll: 'toll-tags',
  settlement: 'driver-settlements',
};

export const LANE_LABEL: Record<CloseLane, string> = {
  fuel: 'Fuel',
  toll: 'Tolls',
  settlement: 'Settlement',
};

/** Map an invariant code to its owning lane. */
export function laneForBlockerCode(code: string): CloseLane {
  const c = String(code || '').toUpperCase();
  if (c.startsWith('FUEL')) return 'fuel';
  if (c.startsWith('TOLL')) return 'toll';
  // CASH_*, EARNINGS_*, STATEMENT_*, SETTLEMENT_* all settle in the money lane.
  return 'settlement';
}

/** Plain-English label for each known blocker code (falls back to the raw message). */
const BLOCKER_LABELS: Record<string, string> = {
  FUEL_STATEMENT_MISSING: 'Fuel statement not published',
  FUEL_DRIVER_SHARE_MISMATCH: 'Fuel driver share does not tie to statement',
  FUEL_FLEET_SHARE_MISMATCH: 'Fuel fleet share does not tie to statement',
  TOLL_STATEMENT_MISSING: 'Toll statement not published',
  TOLL_SPEND_MISMATCH: 'Toll spend does not tie to statement',
  TOLL_CHARGED_MISMATCH: 'Toll charged-to-driver does not tie to statement',
  TOLL_IDENTITY_UNBALANCED: 'Toll cards do not balance (Spend − Reimbursed − Charged − Net Loss ≠ 0)',
  EARNINGS_STATEMENT_MISSING: 'Earnings statement not published',
  CASH_SOURCE_MISMATCH: 'Trip CSV cash disagrees with ledger cash',
  CASH_COLLECTED_MISMATCH: 'Cash collected does not tie to earnings statement',
  EARNINGS_GROSS_IDENTITY: 'Gross ≠ driver share + fleet share + tips',
  STATEMENT_ACCOUNTS_UNBALANCED: 'Statement accounts do not net to zero',
  SETTLEMENT_PNL_MISMATCH: 'Driver settlements do not tie to Business Finance P&L',
};

export function humanBlockerLabel(blocker: Pick<CloseBlocker, 'code' | 'message'>): string {
  return BLOCKER_LABELS[String(blocker.code || '').toUpperCase()] || blocker.message || blocker.code;
}

/** Group blockers by lane for per-card display. */
export function summarizeBlockersByLane(
  blockers: readonly CloseBlocker[] | null | undefined,
): Record<CloseLane, CloseBlocker[]> {
  const out: Record<CloseLane, CloseBlocker[]> = { fuel: [], toll: [], settlement: [] };
  for (const b of blockers ?? []) {
    out[laneForBlockerCode(b.code)].push(b);
  }
  return out;
}

/** Only `block`-severity blockers stop a close; `warn` is informational. */
export function blockingCount(blockers: readonly CloseBlocker[] | null | undefined): number {
  return (blockers ?? []).filter((b) => b.severity !== 'warn').length;
}

/** Derive a lane status from its blocker list. */
export function laneStatusFromBlockers(
  blockers: readonly CloseBlocker[] | null | undefined,
  opts?: { loading?: boolean },
): CloseLaneStatus {
  if (opts?.loading) return 'loading';
  return blockingCount(blockers) > 0 ? 'blocked' : 'clear';
}

// ── Lane metric shapes the Close Week cards render ──────────────────────────

export type FuelLaneMetrics = {
  /** Driver share of fuel (period.fuel_deduction). */
  driverShare: number;
  /** Fleet share of fuel (period.fuel_fleet_share). */
  fleetShare: number;
  /** True when the org-wide fuel week is locked. */
  finalized: boolean;
};

export type TollLaneMetrics = {
  spend: number;
  reimbursed: number;
  chargedToDrivers: number;
  netLoss: number;
  /** Spend − Reimbursed − ChargedToDrivers − NetLoss (≈ 0 when the cards tie). */
  identityResidual: number;
  identityCloses: boolean;
};

export type SettlementLaneMetrics = {
  fleetOwes: number;
  driversOwe: number;
  cashHeld: number;
  /** Total exposure = fleet owes + drivers owe + cash held, gate-blind (H-2). */
  totalExposure: number;
  /** Portion of exposure sitting in blocked / unfinalized weeks. */
  blockedExposure: number;
};
