import { describe, expect, it } from 'vitest';
import { reconDriverSettlementBreakdown } from './reconDriverSettlementBreakdown';

describe('reconDriverSettlementBreakdown', () => {
  it('splits this week from posted corrections on the landing week', () => {
    const b = reconDriverSettlementBreakdown({
      settlementAmount: 37_397.13,
      metadata: {
        financeCore: {
          postedAdjustments: 44_710.13,
          correctionLines: [
            { sourceWeek: '2026-02-02', amount: 7_316.23, sentence: 'Fuel', kind: 'fuel_share' },
            { sourceWeek: '2026-01-19', amount: 5_923.8, sentence: 'Fuel', kind: 'fuel_share' },
          ],
        },
      },
    });
    expect(b).not.toBeNull();
    expect(b!.thisWeek).toBeCloseTo(-7_313, 1);
    expect(b!.correctionCount).toBe(2);
    expect(b!.correctionTotal).toBeCloseTo(44_710.13, 2);
  });

  it('returns null when there are no correction lines', () => {
    expect(reconDriverSettlementBreakdown({ settlementAmount: 100, metadata: {} })).toBeNull();
  });

  it('splits driver-owes landing week (WRA-62 Kenny after carry)', () => {
    const b = reconDriverSettlementBreakdown({
      settlementAmount: -1_623.9,
      metadata: {
        financeCore: {
          postedAdjustments: -10_611.52,
          correctionLines: [
            {
              sourceWeek: '2026-02-02',
              amount: -10_640.43,
              sentence: 'Week of 2026-02-02: the rest of his balance, he owes $10640.43.',
              kind: 'carried_balance',
            },
          ],
        },
      },
    });
    expect(b).not.toBeNull();
    expect(b!.thisWeek).toBeCloseTo(8_987.62, 2);
    expect(b!.correctionTotal).toBeCloseTo(-10_611.52, 2);
  });
});