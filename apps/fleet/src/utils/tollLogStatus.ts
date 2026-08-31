import { isVoidedTx } from './tollTagLedger';
import {
  resolveTollStatusDisplay as coreResolve,
  excludeVoidedTolls,
  type TollStatusInput,
} from '@roam/toll-core';

export type { TollStatusInput };

/** Soft-void wins the label; otherwise map ledger status to display text. */
export function resolveTollStatusDisplay(tx: TollStatusInput): string {
  // Prefer fleet isVoidedTx so tag-ledger void rules stay in sync with this app.
  if (isVoidedTx(tx as any)) return 'Voided';
  return coreResolve(tx);
}

export function excludeVoided<T extends { isVoided: boolean }>(rows: T[]): T[] {
  return excludeVoidedTolls(rows);
}
