import { describe, expect, it } from 'vitest';
import { resolveLeakageStepHero } from './resolveLeakageStepHero';

describe('resolveLeakageStepHero', () => {
  it('S2S only: Fix CTA, no disposition, honest title', () => {
    const h = resolveLeakageStepHero({
      leakage: 0,
      leakageReviewed: false,
      stopToStopBlocking: true,
      stopToStopSummary: '3 fill windows on 5179KZ have trip/adjustment km larger than the odometer moved.',
    });
    expect(h.title).toMatch(/Mileage still blocks Finalize/i);
    expect(h.action).toBe('fix_stop_to_stop');
    expect(h.showDispositionForm).toBe(false);
    expect(h.body).toMatch(/5179KZ/);
  });

  it('money only: Mark reviewed + disposition', () => {
    const h = resolveLeakageStepHero({
      leakage: 120,
      leakageReviewed: false,
      stopToStopBlocking: false,
      leakageMoneyLabel: '$120.00',
    });
    expect(h.title).toMatch(/Review unexplained fuel/i);
    expect(h.action).toBe('mark_reviewed');
    expect(h.showDispositionForm).toBe(true);
    expect(h.moneyNeedsAccept).toBe(true);
  });

  it('both: Mark reviewed primary, disposition on, S2S mentioned', () => {
    const h = resolveLeakageStepHero({
      leakage: 50,
      leakageReviewed: false,
      stopToStopBlocking: true,
      stopToStopSummary: '2 fill windows need Fix.',
      leakageMoneyLabel: '$50.00',
    });
    expect(h.title).toMatch(/Money leftover and mileage/i);
    expect(h.action).toBe('mark_reviewed');
    expect(h.showDispositionForm).toBe(true);
    expect(h.body).toMatch(/2 fill windows/);
  });

  it('clear: no disposition, no Fix action', () => {
    const h = resolveLeakageStepHero({
      leakage: 0,
      leakageReviewed: false,
      stopToStopBlocking: false,
    });
    expect(h.title).toMatch(/Money clear/i);
    expect(h.action).toBeNull();
    expect(h.showDispositionForm).toBe(false);
  });

  it('over-explained: no accept form', () => {
    const h = resolveLeakageStepHero({
      leakage: -80,
      leakageReviewed: false,
      stopToStopBlocking: false,
      leakageMoneyLabel: '-$80.00',
    });
    expect(h.title).toMatch(/over-explained/i);
    expect(h.showDispositionForm).toBe(false);
    expect(h.action).toBeNull();
  });
});
