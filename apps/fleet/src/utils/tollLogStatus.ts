import {
  resolveTollStatusDisplay as coreResolve,
  excludeVoidedTolls,
  isVoidedToll,
  type TollStatusInput,
} from '@roam/toll-core';

export type { TollStatusInput };

/** Soft-void wins the label; otherwise map ledger status to display text. */
export function resolveTollStatusDisplay(tx: TollStatusInput): string {
  if (isVoidedToll(tx)) return 'Voided';
  return coreResolve(tx);
}

export function excludeVoided<T extends { isVoided: boolean }>(rows: T[]): T[] {
  return excludeVoidedTolls(rows);
}
