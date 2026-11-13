export type TollsStepVariant = 'legacy' | 'delivery' | 'v2';

/** B11: which Tolls step body Week Reconciliation shows. */
export function resolveTollsStepVariant(
  tollsV2On: boolean | undefined,
  line: 'rideshare' | 'rush_delivery',
): TollsStepVariant {
  if (!tollsV2On) return 'legacy';
  if (line === 'rush_delivery') return 'delivery';
  return 'v2';
}
