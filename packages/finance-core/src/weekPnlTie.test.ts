import { describe, expect, it } from 'vitest';
import { weekPnlTieBlockers } from './weekPnlTie.ts';
import { serverStepForBlockerCode } from './closeBlockerSteps.ts';

describe('weekPnlTieBlockers', () => {
  it('blocks when statements do not tie to the engine week P&L', () => {
    const out = weekPnlTieBlockers({ week: '2026-10-12', settlementSum: 100, businessPnl: 90, probed: true });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'SETTLEMENT_PNL_MISMATCH', severity: 'block', persisted: 100, expected: 90, delta: 10 });
  });

  it('is clear within a cent', () => {
    expect(weekPnlTieBlockers({ week: '2026-10-12', settlementSum: 100, businessPnl: 100.005, probed: true })).toEqual([]);
  });

  it('only warns when the engine P&L could not be computed', () => {
    const out = weekPnlTieBlockers({ week: '2026-10-12', settlementSum: 50, businessPnl: null, probed: true });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ code: 'BUSINESS_WEEK_PNL_UNAVAILABLE', severity: 'warn' });
  });

  it('says nothing when the engines were not run (page reads)', () => {
    expect(weekPnlTieBlockers({ week: '2026-10-12', settlementSum: 50, businessPnl: null, probed: false })).toEqual([]);
  });

  it('both codes land on the Close step, so the step list shows them', () => {
    expect(serverStepForBlockerCode('SETTLEMENT_PNL_MISMATCH')).toBe('close');
    expect(serverStepForBlockerCode('BUSINESS_WEEK_PNL_UNAVAILABLE')).toBe('close');
  });
});
