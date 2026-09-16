/**
 * @vitest-environment node
 * N-18 — usageCategory resolve + settledEntries mirror contract.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeFuelUsageCategory,
  resolveFuelUsageCategory,
} from './fuelUsageCategory';

describe('fuelUsageCategory (N-18)', () => {
  it('normalizes known tags', () => {
    expect(normalizeFuelUsageCategory('Personal')).toBe('personal');
    expect(normalizeFuelUsageCategory('company_ops')).toBe('company');
    expect(normalizeFuelUsageCategory('deadhead')).toBe('deadhead');
    expect(normalizeFuelUsageCategory('ride')).toBe('ride');
  });

  it('infers from paymentSource when unset', () => {
    expect(resolveFuelUsageCategory({ paymentSource: 'Gas_Card' })).toBe('ride');
    expect(resolveFuelUsageCategory({ paymentSource: 'Personal' })).toBe('personal');
    expect(resolveFuelUsageCategory({ paymentSource: 'Petty_Cash' })).toBe('company');
  });

  it('explicit tag wins over payment heuristic', () => {
    expect(
      resolveFuelUsageCategory({ usageCategory: 'deadhead', paymentSource: 'Gas_Card' }),
    ).toBe('deadhead');
  });

  it('fails closed when neither tag nor payment is usable', () => {
    expect(resolveFuelUsageCategory({})).toBeUndefined();
  });
});
