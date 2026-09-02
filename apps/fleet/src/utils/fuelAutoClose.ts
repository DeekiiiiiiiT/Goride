import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';
import {
  needsSecondApprover,
  resolveFuelAutoCloseDualApprovalMode,
  type FuelAutoCloseDualApprovalMode,
} from './fuelDualApproval';

export type AutoClosePeriodLike = {
  locked?: boolean;
  actionableTotal?: number;
  netLeakage?: number;
  leakageReviewed?: boolean;
  totalSpend?: number;
  hasSettlementSnapshots?: boolean;
  secondApproverThreshold?: number;
  /** Org auto-close dual-approval mode (default skip). */
  autoCloseDualApprovalMode?: FuelAutoCloseDualApprovalMode | string | null;
};

export type AutoCloseSkipReason =
  | 'locked'
  | 'actionables'
  | 'leakage'
  | 'needs_approval'
  | 'missing_snapshots';

export type AutoCloseEvaluation = {
  eligible: boolean;
  reason?: AutoCloseSkipReason;
};

/** Shared eligibility matrix with server auto-close (NEW-9 + service_approve mode). */
export function evaluateAutoCloseEligibility(period: AutoClosePeriodLike): AutoCloseEvaluation {
  if (period.locked) return { eligible: false, reason: 'locked' };
  if ((period.actionableTotal || 0) > 0) return { eligible: false, reason: 'actionables' };
  if (!period.leakageReviewed && Math.abs(Number(period.netLeakage) || 0) > FUEL_SPEND_EPS) {
    return { eligible: false, reason: 'leakage' };
  }

  const threshold = Number(period.secondApproverThreshold);
  const mode = resolveFuelAutoCloseDualApprovalMode(
    period.autoCloseDualApprovalMode as string | null | undefined,
  );
  if (
    Number.isFinite(threshold) &&
    needsSecondApprover(Number(period.totalSpend) || 0, threshold) &&
    mode === 'skip'
  ) {
    return { eligible: false, reason: 'needs_approval' };
  }

  return { eligible: true };
}

export function shouldAutoClosePeriod(period: AutoClosePeriodLike): boolean {
  return evaluateAutoCloseEligibility(period).eligible;
}

export function autoCloseStatusBadge(period: AutoClosePeriodLike): {
  label: string;
  tone: 'eligible' | 'blocked';
} | null {
  const mode = resolveFuelAutoCloseDualApprovalMode(
    period.autoCloseDualApprovalMode as string | null | undefined,
  );
  const thr = Number(period.secondApproverThreshold);
  const highSpend =
    Number.isFinite(thr) && needsSecondApprover(Number(period.totalSpend) || 0, thr);

  const ev = evaluateAutoCloseEligibility(period);
  if (ev.eligible) {
    if (highSpend && mode === 'service_approve') {
      return { label: 'Eligible for auto-close (system approval)', tone: 'eligible' };
    }
    return { label: 'Eligible for auto-close', tone: 'eligible' };
  }
  if (ev.reason === 'needs_approval') {
    return { label: 'Needs second approval', tone: 'blocked' };
  }
  return null;
}
