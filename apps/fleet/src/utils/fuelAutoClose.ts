import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

export type AutoClosePeriodLike = {
  locked?: boolean;
  actionableTotal?: number;
  netLeakage?: number;
};

/** Weeks with no open actionables and unexplained under epsilon are auto-close eligible. */
export function shouldAutoClosePeriod(period: AutoClosePeriodLike): boolean {
  if (period.locked) return false;
  if ((period.actionableTotal || 0) > 0) return false;
  return Math.abs(Number(period.netLeakage) || 0) <= FUEL_SPEND_EPS;
}
