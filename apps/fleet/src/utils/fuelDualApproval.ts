import { FUEL_SPEND_EPS } from './fuelMoneyEpsilon';

/** JMD threshold — weeks above this need a second approver before lock. */
export const FUEL_SECOND_APPROVER_THRESHOLD = 50_000;

export function needsSecondApprover(totalSpend: number): boolean {
  return (Number(totalSpend) || 0) > FUEL_SECOND_APPROVER_THRESHOLD;
}
