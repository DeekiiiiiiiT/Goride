/** Operator-facing names for Consumption Reconciliation (M17). */
export const UNEXPLAINED_LABEL = 'Unexplained';
export const OVER_EXPLAINED_LABEL = 'Over-explained';

export function unexplainedLabel(amount: number): string {
  return amount < 0 ? OVER_EXPLAINED_LABEL : UNEXPLAINED_LABEL;
}
