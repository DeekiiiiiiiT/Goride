import { describe, expect, it } from 'vitest';
import { DRIVER_SHADOW_MONEY_FIELDS, diffShadowMoney } from './shadowMoney.ts';

describe('diffShadowMoney', () => {
  it('is empty when there is no previous result', () => {
    expect(diffShadowMoney(null, { driver_share: 10 }, DRIVER_SHADOW_MONEY_FIELDS)).toEqual([]);
  });

  it('ignores a one-cent difference and a timestamp', () => {
    const previous = { driver_share: 10, computed_at: 'yesterday' };
    const next = { driver_share: 10.005, computed_at: 'today' };
    expect(diffShadowMoney(previous, next, DRIVER_SHADOW_MONEY_FIELDS)).toEqual([]);
  });

  it('reports a money field that moved', () => {
    const deltas = diffShadowMoney(
      { settlement_amount: 17183.53 },
      { settlement_amount: 17000 },
      DRIVER_SHADOW_MONEY_FIELDS,
    );
    expect(deltas).toEqual([{
      field: 'settlement_amount',
      previous: 17183.53,
      next: 17000,
      delta: 183.53,
    }]);
  });
});