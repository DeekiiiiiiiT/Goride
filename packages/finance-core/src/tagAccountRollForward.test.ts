import { describe, expect, it } from 'vitest';
import {
  computeTagAccountRollForward,
  tagLedgerAmountToRollForwardParts,
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
