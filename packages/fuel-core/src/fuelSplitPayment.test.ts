import { describe, expect, it } from 'vitest';
import {
  buildCardSplitMetadata,
  buildCashSplitMetadata,
  deriveSplitCashAmount,
  evaluateSplitStatementRecon,
  isAwaitingCashStatement,
  splitReconMetadataPatch,
  splitReconTolerance,
  SPLIT_RECON_TOLERANCE_FLOOR_JMD,
  SPLIT_RECON_TOLERANCE_PCT,
  validateSplitPumpAmounts,
} from './fuelSplitPayment.ts';

describe('deriveSplitCashAmount', () => {
  it('subtracts statement card from pump total', () => {
    expect(deriveSplitCashAmount(5000, 3500)).toBe(1500);
  });

  it('rounds to cents', () => {
    expect(deriveSplitCashAmount(100.1, 33.33)).toBe(66.77);
  });
});

describe('validateSplitPumpAmounts', () => {
  it('accepts pump total and liters', () => {
    const r = validateSplitPumpAmounts(5000, 40);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pumpTotal).toBe(5000);
      expect(r.liters).toBe(40);
    }
  });

  it('rejects zero pump', () => {
    expect(validateSplitPumpAmounts(0, 40).ok).toBe(false);
  });

  it('rejects zero liters', () => {
    expect(validateSplitPumpAmounts(5000, 0).ok).toBe(false);
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

describe('evaluateSplitStatementRecon', () => {
  it('reconciles when statement under pump', () => {
    const r = evaluateSplitStatementRecon(3500, 5000);
    expect(r.status).toBe('reconciled');
    expect(r.derivedCash).toBe(1500);
  });

  it('flags variance when statement exceeds pump beyond tolerance', () => {
    const r = evaluateSplitStatementRecon(6000, 5000);
    expect(r.status).toBe('variance');
    expect(r.derivedCash).toBe(-1000);
  });

  it('flags variance when statement is zero', () => {
    const r = evaluateSplitStatementRecon(0, 5000);
    expect(r.status).toBe('variance');
  });
});

describe('split metadata builders', () => {
  it('cash awaits statement and owns volume', () => {
    const cash = buildCashSplitMetadata({ fillGroupId: 'g1', splitPumpTotal: 5000 });
    const card = buildCardSplitMetadata({ fillGroupId: 'g1', splitPumpTotal: 5000 });
    expect(cash.splitVolumeOwner).toBe(true);
    expect(cash.awaitingCashStatement).toBe(true);
    expect(card.splitVolumeOwner).toBe(false);
    expect(isAwaitingCashStatement(cash)).toBe(true);
  });
});

describe('splitReconMetadataPatch', () => {
  it('stamps derived cash and clears awaiting on reconcile', () => {
    const patch = splitReconMetadataPatch(
      { splitPumpTotal: 5000, splitVolumeOwner: false },
      3500,
      12,
    );
    expect(patch.splitReconciled).toBe(true);
    expect(patch.splitVariance).toBe(false);
    expect(patch.splitDerivedCashAmount).toBe(1500);
    expect(patch.awaitingCashStatement).toBe(false);
    expect(patch.splitStatementLiters).toBe(12);
  });

  it('keeps awaiting on negative-cash variance', () => {
    const patch = splitReconMetadataPatch(
      { splitPumpTotal: 5000, splitVolumeOwner: false },
      6000,
      12,
    );
    expect(patch.splitVariance).toBe(true);
    expect(patch.awaitingCashStatement).toBe(true);
  });
});

describe('splitReconTolerance drift guard', () => {
  it('matches the inlined matcher formula for representative totals', () => {
    for (const total of [0, 100, 5000, 10000, 1]) {
      const expected = Math.max(SPLIT_RECON_TOLERANCE_FLOOR_JMD, Math.abs(total) * SPLIT_RECON_TOLERANCE_PCT);
      expect(splitReconTolerance(total)).toBe(expected);
      expect(splitReconTolerance(total)).toBe(Math.max(50, Math.abs(total) * 0.01));
    }
  });

  it('keeps both mirror source files on the same Math.max(50, … * 0.01) formula', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const root = resolve(__dirname, '../../..');
    const shared = await readFile(
      resolve(root, 'packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts'),
      'utf8',
    );
    const edge = await readFile(
      resolve(root, 'supabase/functions/_fleet-server/fuel_jaa_match.ts'),
      'utf8',
    );
    const pattern = /Math\.max\(\s*50\s*,\s*pumpTotal\s*\*\s*0\.01\s*\)/;
    expect(shared).toMatch(pattern);
    expect(edge).toMatch(pattern);
  });

  it('keeps both mirrors on M4 splitPumpLiters price-band (no stmt-liter fallback)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const root = resolve(__dirname, '../../..');
    const shared = await readFile(
      resolve(root, 'packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts'),
      'utf8',
    );
    const edge = await readFile(
      resolve(root, 'supabase/functions/_fleet-server/fuel_jaa_match.ts'),
      'utf8',
    );
    for (const src of [shared, edge]) {
      expect(src).toMatch(/splitPumpLiters/);
      expect(src).toMatch(/splitPumpPriceOutlier/);
      expect(src).toMatch(/Number\(drvMeta\.splitPumpLiters\)\s*\|\|\s*0/);
      // Must not reintroduce statement-liter inflation for the band
      expect(src).not.toMatch(/litersForBand/);
    }
  });
});
