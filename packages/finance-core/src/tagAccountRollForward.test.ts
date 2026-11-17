import { describe, expect, it } from 'vitest';
import {
  computeTagAccountRollForward,
  tagLedgerAmountToRollForwardParts,
  tagAccountOpeningFromWeeks,
} from './tagAccountRollForward.ts';

describe('computeTagAccountRollForward', () => {
  it('computes expected closing without statement', () => {
    const r = computeTagAccountRollForward({
      openingMinor: 100_00,
      topUpsMinor: 50_00,
      tagUsageMinor: 30_00,
    });
    expect(r.expectedClosingMinor).toBe(120_00);
    expect(r.varianceMinor).toBeNull();
    expect(r.ties).toBe(false);
  });

  it('ties when statement matches expected', () => {
    const r = computeTagAccountRollForward({
      openingMinor: 0,
      topUpsMinor: 10_000,
      tagUsageMinor: 4_000,
      statementClosingMinor: 6_000,
    });
    expect(r.varianceMinor).toBe(0);
    expect(r.ties).toBe(true);
  });

  it('reports variance when statement differs', () => {
    const r = computeTagAccountRollForward({
      openingMinor: 1_000,
      topUpsMinor: 500,
      tagUsageMinor: 200,
      statementClosingMinor: 1_400,
    });
    expect(r.expectedClosingMinor).toBe(1_300);
    expect(r.varianceMinor).toBe(100);
    expect(r.ties).toBe(false);
  });
});

describe('tagLedgerAmountToRollForwardParts', () => {
  it('maps signed usage and top_up to magnitudes', () => {
    expect(
      tagLedgerAmountToRollForwardParts({ type: 'usage', amount: -275, paymentMethod: 'tag_balance' }),
    ).toEqual({ topUpMinor: 0, usageMinor: 27_500 });
    expect(
      tagLedgerAmountToRollForwardParts({ type: 'top_up', amount: 3000, paymentMethod: 'tag_balance' }),
    ).toEqual({ topUpMinor: 300_000, usageMinor: 0 });
  });

  it('ignores voided and off-tag cash rows', () => {
    expect(
      tagLedgerAmountToRollForwardParts({
        type: 'usage',
        amount: -100,
        paymentMethod: 'cash',
        status: 'completed',
      }),
    ).toEqual({ topUpMinor: 0, usageMinor: 0 });
    expect(
      tagLedgerAmountToRollForwardParts({
        type: 'top_up',
        amount: 500,
        metadata: { voided: true },
      }),
    ).toEqual({ topUpMinor: 0, usageMinor: 0 });
  });
});

describe('tagAccountOpeningFromWeeks (step 4 from the new toll system)', () => {
  // Real TransJam numbers: 5 Oct closing J$5,154 confirmed; 12 Oct week: top-up 5,000, 6 tolls 2,535
  // (closed before step 4 saved closings); 19 Oct week: 8 tolls 2,990, no top-up → closing 4,629.
  const weeks = [
    { weekKey: '2026-10-12', topUpsMinor: 500000, usageMinor: 253500 },
    { weekKey: '2026-10-19', topUpsMinor: 0, usageMinor: 299000 },
  ];

  it('carries a closed week with no saved closing into the opening (19 Oct = 4,629)', () => {
    const r = tagAccountOpeningFromWeeks({
      weekKey: '2026-10-19',
      prior: { openingMinor: 515400, priorWeekKey: '2026-10-05' },
      weeks,
      statementClosingMinor: null,
    });
    expect(r).toEqual({
      openingMinor: 761900,
      openingFromStatement: false,
      topUpsMinor: 0,
      tagUsageMinor: 299000,
      carriedWeekKeys: ['2026-10-12'],
    });
    const roll = computeTagAccountRollForward({ ...r, statementClosingMinor: 515400 });
    expect(roll.expectedClosingMinor).toBe(462900);
    expect(roll.ties).toBe(false); // the J$5,154 confirmed by mistake no longer ties
  });

  it('the week right after a saved closing carries nothing', () => {
    const r = tagAccountOpeningFromWeeks({
      weekKey: '2026-10-12',
      prior: { openingMinor: 515400, priorWeekKey: '2026-10-05' },
      weeks: [weeks[0]],
      statementClosingMinor: null,
    });
    expect(r.openingMinor).toBe(515400);
    expect(r.carriedWeekKeys).toEqual([]);
    expect(r.topUpsMinor).toBe(500000);
  });

  it('first week with no saved closing anywhere: the statement closing anchors the opening', () => {
    const r = tagAccountOpeningFromWeeks({
      weekKey: '2026-10-19',
      prior: { openingMinor: 0, priorWeekKey: null },
      weeks: [weeks[1]],
      statementClosingMinor: 462900,
    });
    expect(r.openingMinor).toBe(761900);
    expect(r.openingFromStatement).toBe(true);
    expect(r.carriedWeekKeys).toEqual([]);
  });
});
