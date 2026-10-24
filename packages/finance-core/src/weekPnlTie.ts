/**
 * Week-level P&L tie-out: settlement composition (sealed statements) vs the
 * engine week P&L. One owner for the rule so the Close preview and the
 * background worker cannot disagree (R19-01).
 */
import { CLOSE_INVARIANT_EPS, type CloseBlocker } from './closeInvariants.ts';

export function weekPnlTieBlockers(input: {
  week: string;
  /** Sum of settlement composition from the week's statements. */
  settlementSum: number;
  /** Engine week P&L, or null when it was not computed. */
  businessPnl: number | null;
  /** True when the engines were run (null then means "unavailable", not "skipped"). */
  probed: boolean;
}): CloseBlocker[] {
  const { week, settlementSum, businessPnl, probed } = input;
  if (businessPnl != null && Math.abs(settlementSum - businessPnl) > CLOSE_INVARIANT_EPS) {
    return [{
      code: 'SETTLEMENT_PNL_MISMATCH',
      severity: 'block',
      week,
      persisted: settlementSum,
      expected: businessPnl,
      delta: settlementSum - businessPnl,
      message: 'Driver-lane contribution does not match settlements',
    }];
  }
  if (probed && businessPnl == null && settlementSum !== 0) {
    return [{
      code: 'BUSINESS_WEEK_PNL_UNAVAILABLE',
      severity: 'warn',
      week,
      persisted: settlementSum,
      expected: 0,
      delta: settlementSum,
      message: 'Engine week P&L unavailable for settlement tie-out',
    }];
  }
  return [];
}
