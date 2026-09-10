import { describe, expect, it } from 'vitest';
import {
  forceResealHintsFromPreview,
  previewNeedsWeekSync,
  shouldAutoSyncCloseWeek,
  shouldRunCloseWeekSync,
} from './closeWeekAutoSync';

describe('shouldAutoSyncCloseWeek', () => {
  it('false for already-closed weeks', () => {
    expect(shouldAutoSyncCloseWeek('2026-02-16', { weekAlreadyClosed: true })).toBe(false);
  });

  it('false for empty weekKey', () => {
    expect(shouldAutoSyncCloseWeek('')).toBe(false);
  });

  it('true for a fully ended historical Monday week', () => {
    expect(shouldAutoSyncCloseWeek('2026-01-26')).toBe(true);
  });
});

describe('previewNeedsWeekSync', () => {
  it('false when week already closed', () => {
    expect(
      previewNeedsWeekSync({
        weekClosed: true,
        blockers: [{ code: 'TOLL_SPEND_MISMATCH' }],
      }),
    ).toBe(false);
  });

  it('false when Clear (no sync-fixable blockers)', () => {
    expect(
      previewNeedsWeekSync({
        blockers: [{ code: 'CASH_COLLECTED_MISMATCH' }],
        weekBlockers: [],
      }),
    ).toBe(false);
  });

  it('true for seal/rebuild-fixable codes', () => {
    expect(
      previewNeedsWeekSync({
        blockers: [{ code: 'EARNINGS_STATEMENT_UNVERIFIED' }],
      }),
    ).toBe(true);
    expect(
      previewNeedsWeekSync({
        blockers: [{ code: 'TOLL_SPEND_MISMATCH' }],
      }),
    ).toBe(true);
  });
});

describe('shouldRunCloseWeekSync', () => {
  it('skips sync when preview is Clear on an ended week', () => {
    expect(
      shouldRunCloseWeekSync('2026-01-26', {
        weekClosed: false,
        blockers: [],
      }),
    ).toBe(false);
  });

  it('runs sync when ended week has fixable blocker', () => {
    expect(
      shouldRunCloseWeekSync('2026-01-26', {
        weekClosed: false,
        blockers: [{ code: 'FUEL_STATEMENT_MISSING' }],
      }),
    ).toBe(true);
  });
});

describe('forceResealHintsFromPreview', () => {
  it('maps earnings engine drift to forceEarningsReseal', () => {
    expect(
      forceResealHintsFromPreview({
        blockers: [{ code: 'EARNINGS_ENGINE_DRIFT' }],
      }),
    ).toEqual({ forceEarningsReseal: true });
  });

  it('maps fuel + toll codes independently', () => {
    expect(
      forceResealHintsFromPreview({
        blockers: [{ code: 'FUEL_ENGINE_DRIFT' }, { code: 'TOLL_STALE_ZERO_SEAL' }],
      }),
    ).toEqual({ forceFuelReseal: true, forceTollReseal: true });
  });

  it('PERIOD_REBUILD_FAILED forces all lanes', () => {
    expect(
      forceResealHintsFromPreview({
        weekBlockers: [{ code: 'PERIOD_REBUILD_FAILED' }],
      }),
    ).toEqual({
      forceFuelReseal: true,
      forceTollReseal: true,
      forceEarningsReseal: true,
    });
  });

  it('ignores cash-only blockers', () => {
    expect(
      forceResealHintsFromPreview({
        blockers: [{ code: 'CASH_COLLECTED_MISMATCH' }],
      }),
    ).toEqual({});
  });
});
