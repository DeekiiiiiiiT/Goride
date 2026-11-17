import { describe, expect, it } from 'vitest';
import { isReconWeekReadLikePath } from './reconWeekReadLikePaths.ts';

describe('reconWeekReadLikePaths', () => {
  it('fuel prep paths are read-like', () => {
    expect(isReconWeekReadLikePath('/fleet-fuel/fuel/periods/ensure')).toBe(true);
    expect(isReconWeekReadLikePath('/fleet-fuel/fuel/periods/org%3A2026-10-05/compute')).toBe(true);
    expect(isReconWeekReadLikePath('/fuel/periods/org:2026-10-05/materialize')).toBe(true);
    expect(
      isReconWeekReadLikePath('https://x/fleet-fuel/fuel/periods/org%3A2026-10-05/materialize?x=1'),
    ).toBe(true);
  });

  it('toll read-only POSTs are read-like', () => {
    expect(isReconWeekReadLikePath('/fleet-toll/toll-info/impact-preview')).toBe(true);
    expect(isReconWeekReadLikePath('/toll-info/impact-preview?lane=1')).toBe(true);
    expect(isReconWeekReadLikePath('/toll-reconciliation/auto-match')).toBe(true);
  });

  it('real changes are not read-like', () => {
    expect(isReconWeekReadLikePath('/fleet-fuel/fuel/periods/org%3A2026-10-05/finalize')).toBe(false);
    expect(isReconWeekReadLikePath('/fuel/periods/p/stop-to-stop-gap-accept')).toBe(false);
    expect(isReconWeekReadLikePath('/fuel/periods/p/data-quality-vehicle-review')).toBe(false);
    expect(isReconWeekReadLikePath('/toll/v2/import')).toBe(false);
  });
});