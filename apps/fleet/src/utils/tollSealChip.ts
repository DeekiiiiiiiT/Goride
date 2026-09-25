/**
 * Landing seal chip for toll weeks (TR-M9).
 * Priority: Closed (week signed) > Sealed (statements / period sealed) > Reviewed (Finish).
 */
export type TollSealChip = 'reviewed' | 'sealed' | 'closed';

export function deriveTollSealChip(input: {
  periodState?: string | null;
  hasClosedTollStatement?: boolean;
  weekClosed?: boolean;
}): TollSealChip | null {
  if (input.weekClosed) return 'closed';
  const state = String(input.periodState || '').toLowerCase();
  if (state === 'sealed' || input.hasClosedTollStatement) return 'sealed';
  if (state === 'ready') return 'reviewed';
  return null;
}

export const TOLL_SEAL_CHIP_LABEL: Record<TollSealChip, string> = {
  reviewed: 'Reviewed',
  sealed: 'Sealed',
  closed: 'Closed',
};
