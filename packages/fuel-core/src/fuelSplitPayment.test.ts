import { describe, expect, it } from 'vitest';
import {
  buildCardSplitMetadata,
  buildCashSplitMetadata,
  deriveSplitCardAmount,
  evaluateSplitCardRecon,
  isSplitNonVolumeOwner,
  splitReconMetadataPatch,
  splitReconTolerance,
  SPLIT_RECON_TOLERANCE_FLOOR_JMD,
  SPLIT_RECON_TOLERANCE_PCT,
  validateSplitCashAmounts,
} from './fuelSplitPayment.ts';

describe('deriveSplitCardAmount', () => {
  it('subtracts cash from pump total', () => {
    expect(deriveSplitCardAmount(5000, 1500)).toBe(3500);
  });

  it('rounds to cents', () => {
    expect(deriveSplitCardAmount(100.1, 33.33)).toBe(66.77);
  });
});

describe('validateSplitCashAmounts', () => {
  it('accepts cash between 0 and total', () => {
    const r = validateSplitCashAmounts(5000, 1200);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cash).toBe(1200);
      expect(r.card).toBe(3800);
    }
  });

  it('rejects cash equal to total', () => {
    const r = validateSplitCashAmounts(5000, 5000);
    expect(r.ok).toBe(false);
  });

  it('rejects zero cash', () => {
    const r = validateSplitCashAmounts(5000, 0);
    expect(r.ok).toBe(false);
  });

  it('rejects cash above total', () => {
    const r = validateSplitCashAmounts(5000, 6000);
    expect(r.ok).toBe(false);
  });
});

describe('splitReconTolerance', () => {
  it('uses floor for small totals', () => {
    expect(splitReconTolerance(1000)).toBe(50);
  });

  it('uses 1% when larger than floor', () => {
    expect(splitReconTolerance(10000)).toBe(100);
  });
});

describe('evaluateSplitCardRecon', () => {
  it('reconciles within tolerance', () => {
    const r = evaluateSplitCardRecon(3500, 3480, 5000);
    expect(r.status).toBe('reconciled');
  });

  it('flags variance outside tolerance', () => {
    const r = evaluateSplitCardRecon(4000, 3500, 5000);
    expect(r.status).toBe('variance');
    expect(Math.abs(r.delta)).toBe(500);
  });
});

describe('split metadata builders', () => {
  it('cash owns volume; card does not', () => {
    const cash = buildCashSplitMetadata({ fillGroupId: 'g1', splitPumpTotal: 5000 });
    const card = buildCardSplitMetadata({
      fillGroupId: 'g1',
      splitPumpTotal: 5000,
      splitExpectedCardAmount: 3500,
    });
    expect(cash.splitVolumeOwner).toBe(true);
    expect(card.splitVolumeOwner).toBe(false);
    expect(isSplitNonVolumeOwner(card as unknown as Record<string, unknown>)).toBe(true);
    expect(isSplitNonVolumeOwner(cash as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('splitReconMetadataPatch', () => {
  it('stamps reconciled when close', () => {
    const patch = splitReconMetadataPatch(
      { splitExpectedCardAmount: 3500, splitPumpTotal: 5000, splitVolumeOwner: false },
      3510,
      12,
    );
    expect(patch.splitReconciled).toBe(true);
    expect(patch.splitVariance).toBe(false);
    expect(patch.splitStatementLiters).toBe(12);
  });

  it('stamps variance when far', () => {
    const patch = splitReconMetadataPatch(
      { splitExpectedCardAmount: 3500, splitPumpTotal: 5000, splitVolumeOwner: false },
      4200,
      12,
    );
    expect(patch.splitVariance).toBe(true);
    expect(patch.splitReconciled).toBe(false);
  });
});

describe('splitReconTolerance drift guard', () => {
  // Matcher copies inline Math.max(50, pumpTotal * 0.01) — keep locked to these constants.
  it('matches the inlined matcher formula for representative totals', () => {
    for (const total of [0, 100, 5000, 10000, 1]) {
      const expected = Math.max(SPLIT_RECON_TOLERANCE_FLOOR_JMD, Math.abs(total) * SPLIT_RECON_TOLERANCE_PCT);
      expect(splitReconTolerance(total)).toBe(expected);
      expect(splitReconTolerance(total)).toBe(Math.max(50, Math.abs(total) * 0.01));
    }
  });
});
