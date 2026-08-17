import { describe, expect, it } from 'vitest';
import {
  evaluateCycleClose,
  resolveCycleCloseMode,
  SINGLE_FILL_FULL_THRESHOLD,
} from './fuelCycleClosePolicy';

describe('fuelCycleClosePolicy', () => {
  it('defaults to rideshare mode', () => {
    expect(resolveCycleCloseMode({}, null)).toBe('rideshare');
    expect(resolveCycleCloseMode({ fuelSettings: { cycleCloseMode: 'cumulative_98' } }, null)).toBe(
      'cumulative_98',
    );
  });

  it('rideshare: partial top-ups do not close cycle', () => {
    const close = evaluateCycleClose({
      closeMode: 'rideshare',
      prevCumulative: 20,
      volume: 10,
      tankCapacity: 36,
    });
    expect(close.shouldClose).toBe(false);
    expect(close.excessVolume).toBe(0);
    expect(close.volumeContributed).toBe(10);
  });

  it('rideshare: single fill >= 90% closes without cumulative spillover', () => {
    const close = evaluateCycleClose({
      closeMode: 'rideshare',
      prevCumulative: 5,
      volume: 36 * SINGLE_FILL_FULL_THRESHOLD,
      tankCapacity: 36,
    });
    expect(close.shouldClose).toBe(true);
    expect(close.reason).toBe('single_fill_full');
    expect(close.excessVolume).toBe(0);
  });

  it('cumulative_98: stacks partials to capacity close', () => {
    const close = evaluateCycleClose({
      closeMode: 'cumulative_98',
      prevCumulative: 30,
      volume: 6,
      tankCapacity: 36,
    });
    expect(close.shouldClose).toBe(true);
    expect(close.reason).toBe('cumulative_98');
  });

  it('linked gas-card admin rows: lane split — zero volume in cash cycle (via server stamper)', () => {
    // Client policy mirror — volume eligibility tested on server; rideshare never SPLIT-stacks partials
    const partials = evaluateCycleClose({
      closeMode: 'rideshare',
      prevCumulative: 28,
      volume: 8,
      tankCapacity: 36,
    });
    expect(partials.shouldClose).toBe(false);
    expect(partials.excessVolume).toBe(0);
  });
});
