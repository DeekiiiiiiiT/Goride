import { describe, expect, it } from 'vitest';
import { resolveTollsStepVariant, TOLLS_STEP_QUESTION } from './resolveTollsStep';

describe('tolls step (new toll system only)', () => {
  it('delivery line → delivery card; rideshare → the toll desk', () => {
    expect(resolveTollsStepVariant('rush_delivery')).toBe('delivery');
    expect(resolveTollsStepVariant('rideshare')).toBe('v2');
  });
  it('asks who pays each toll', () => {
    expect(TOLLS_STEP_QUESTION).toBe('Who pays each toll this week?');
  });
});
