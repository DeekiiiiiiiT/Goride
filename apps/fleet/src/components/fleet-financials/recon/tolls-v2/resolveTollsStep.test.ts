import { describe, expect, it } from 'vitest';
import { resolveTollsStepVariant } from './resolveTollsStep';

describe('tolls v2 switch', () => {
  it('off → legacy', () => {
    expect(resolveTollsStepVariant(false, 'rideshare')).toBe('legacy');
    expect(resolveTollsStepVariant(undefined, 'rideshare')).toBe('legacy');
  });
  it('on + delivery → delivery card', () => {
    expect(resolveTollsStepVariant(true, 'rush_delivery')).toBe('delivery');
  });
  it('on + rideshare → v2 step', () => {
    expect(resolveTollsStepVariant(true, 'rideshare')).toBe('v2');
  });
});
