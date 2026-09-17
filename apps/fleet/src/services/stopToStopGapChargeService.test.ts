import { describe, expect, it } from 'vitest';
import { gapChargeErrorMessage } from './stopToStopGapChargeService';

describe('gapChargeErrorMessage', () => {
  it('maps known codes', () => {
    expect(gapChargeErrorMessage('period_locked', 'x')).toContain('locked');
    expect(gapChargeErrorMessage({ error: 'actor_required' }, 'x')).toContain('Signed-in');
    expect(gapChargeErrorMessage({ error: 'already_recommended' }, 'x')).toContain('already recommended');
    expect(gapChargeErrorMessage({ error: 'recommendation_missing_actor' }, 'x')).toContain('recommender');
  });

  it('prefers body message then fallback', () => {
    expect(gapChargeErrorMessage({ error: 'other', message: 'Custom' }, 'fb')).toBe('Custom');
    expect(gapChargeErrorMessage(null, 'fb')).toBe('fb');
  });
});
