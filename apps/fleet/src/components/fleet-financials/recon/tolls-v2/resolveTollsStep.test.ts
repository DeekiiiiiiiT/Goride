import { describe, expect, it } from 'vitest';
import { resolveTollsStepVariant, tollsStepQuestion } from './resolveTollsStep';

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

describe('tolls step question', () => {
  it('uses v2 question only when tolls v2 is on', () => {
    expect(tollsStepQuestion(true)).toBe('Who pays each toll this week?');
    expect(tollsStepQuestion(false)).toMatch(/match a trip/);
    expect(tollsStepQuestion(undefined)).toMatch(/match a trip/);
  });
});
