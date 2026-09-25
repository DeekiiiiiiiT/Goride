/**
 * Week Reconciliation calendar seal — thin wrappers over finance-core gate
 * so Fuel + Toll landings share one predicate and copy.
 */
import {
  isSettlementPeriodEnded,
  isSettlementPeriodOpen,
  reconciliationPeriodOpenMessage,
  reconciliationUnlockDay,
} from './settlementPeriodGate';

export type ReconWeekSealInput = {
  /** Monday YYYY-MM-DD week key / period start. */
  weekStart?: string | null;
  periodEnd?: string | null;
  now?: Date | string;
};

function gateInput(input: ReconWeekSealInput) {
  return {
    periodAnchor: input.weekStart,
    periodEnd: input.periodEnd,
    now: input.now,
  };
}

/** True when the Mon–Sun week is over and recon may start (day after Sunday). */
export function isReconWeekUnlocked(input: ReconWeekSealInput): boolean {
  return isSettlementPeriodEnded(gateInput(input));
}

/**
 * True while the Mon–Sun week is still in progress (recon must not start yet).
 * TR-M10: renamed from isReconWeekSealed — that name collided with sealTollWeek /
 * week_statements "sealed".
 */
export function isReconWeekNotYetOpen(input: ReconWeekSealInput): boolean {
  return isSettlementPeriodOpen(gateInput(input));
}

export function reconWeekSealMessage(input: ReconWeekSealInput): string {
  return reconciliationPeriodOpenMessage(gateInput(input));
}

export function reconWeekUnlockDay(input: ReconWeekSealInput): string | null {
  return reconciliationUnlockDay(gateInput(input));
}
