/**
 * Toll Reconciliation landing period status — dependency-free so the Deno
 * edge bundle can import it without pulling Vite-era relative imports.
 */

export type TollReconMatchingStepId = 'needs-review' | 'personal-use' | 'deadhead';

export const TOLL_MATCHING_STEP_IDS: TollReconMatchingStepId[] = [
  'needs-review',
  'personal-use',
  'deadhead',
];

export type TollReconPeriodStatus = 'outstanding' | 'in_progress' | 'reconciled';

/**
 * Aligned with Expenses Toll Status:
 * - outstanding: unmatched / bucket tolls still need work
 * - in_progress: matching clear; claims / disputes / unlinked refunds remain
 * - reconciled: nothing actionable left
 */
export function classifyTollReconPeriodStatus(
  counts: Record<string, { actionable: number }>,
  actionableTotal: number,
): TollReconPeriodStatus {
  if (actionableTotal <= 0) return 'reconciled';
  const matchingOpen = TOLL_MATCHING_STEP_IDS.reduce(
    (sum, id) => sum + (Number(counts[id]?.actionable) || 0),
    0,
  );
  if (matchingOpen > 0) return 'outstanding';
  return 'in_progress';
}
