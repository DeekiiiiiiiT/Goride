export type TollsStepVariant = 'delivery' | 'v2';

/** Week Reconciliation step 3's question (the new toll system is the only one). */
export const TOLLS_STEP_QUESTION = 'Who pays each toll this week?';

/** Which Tolls step body Week Reconciliation shows: the delivery line points to the rideshare desk. */
export function resolveTollsStepVariant(line: 'rideshare' | 'rush_delivery'): TollsStepVariant {
  return line === 'rush_delivery' ? 'delivery' : 'v2';
}
