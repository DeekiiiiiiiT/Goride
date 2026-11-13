export type TollsStepVariant = 'legacy' | 'delivery' | 'v2';

const LEGACY_TOLLS_QUESTION = 'Does every toll match a trip, a refund or a dispute?';
const V2_TOLLS_QUESTION = 'Who pays each toll this week?';

export function tollsStepQuestion(tollsV2On: boolean | undefined): string {
  return tollsV2On ? V2_TOLLS_QUESTION : LEGACY_TOLLS_QUESTION;
}

/** B11: which Tolls step body Week Reconciliation shows. */
export function resolveTollsStepVariant(
  tollsV2On: boolean | undefined,
  line: 'rideshare' | 'rush_delivery',
): TollsStepVariant {
  if (!tollsV2On) return 'legacy';
  if (line === 'rush_delivery') return 'delivery';
  return 'v2';
}
