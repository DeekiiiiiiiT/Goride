import { describe, expect, it } from 'vitest';
import {
  canAdvanceFuelStep,
  computeFuelGatedStepStates,
  emptyFuelStepCounts,
  fuelActionableTotal,
  pickInitialFuelStep,
} from './fuelPeriodGating';
import { buildFuelStepCounts } from './fuelPeriodStatus';

describe('fuelPeriodGating', () => {
  it('blocks advance while actionable remains', () => {
    const counts = emptyFuelStepCounts();
    counts['data-quality'].actionable = 2;
    expect(canAdvanceFuelStep('data-quality', counts)).toBe(false);
    counts['data-quality'].actionable = 0;
    expect(canAdvanceFuelStep('data-quality', counts)).toBe(true);
  });

  it('locks later steps when earlier has actionable', () => {
    const counts = emptyFuelStepCounts();
    counts['data-quality'].actionable = 1;
    const states = computeFuelGatedStepStates(counts);
    expect(states[0].locked).toBe(false);
    expect(states[0].isCurrent).toBe(true);
    expect(states[1].locked).toBe(true);
    expect(states[5].locked).toBe(true);
  });

  it('informational does not lock', () => {
    const counts = emptyFuelStepCounts();
    counts['data-quality'].informational = 3;
    const states = computeFuelGatedStepStates(counts);
    expect(states[0].complete).toBe(true);
    expect(states[1].locked).toBe(false);
  });

  it('pickInitialFuelStep resumes first incomplete', () => {
    const counts = emptyFuelStepCounts();
    counts['adjustments-disputes'].actionable = 1;
    const states = computeFuelGatedStepStates(counts);
    expect(pickInitialFuelStep(states)).toBe('adjustments-disputes');
  });
});

describe('buildFuelStepCounts', () => {
  const base = {
    vehicleId: 'v1',
    totalSpend: 100,
    companyShare: 40,
    driverShare: 60,
    misc: 0,
    pendingCount: 0,
    hasOpenDispute: false,
    hasScenarioAssigned: true,
    isFinalized: false,
  };

  it('pending logs are informational (post on Finalize) — do not hard-block step 1', () => {
    const counts = buildFuelStepCounts({
      vehicles: [
        { ...base, pendingCount: 2, hasOpenDispute: true, healthStatus: 'Emerald' },
      ],
    });
    expect(counts['data-quality'].actionable).toBe(0);
    expect(counts['data-quality'].informational).toBe(2);
    expect(counts['adjustments-disputes'].actionable).toBe(1);
    expect(canAdvanceFuelStep('data-quality', counts)).toBe(true);
    expect(canAdvanceFuelStep('adjustments-disputes', counts)).toBe(false);
  });

  it('Amber/Red is informational only — does not block Continue', () => {
    const counts = buildFuelStepCounts({
      vehicles: [{ ...base, healthStatus: 'Amber' }],
    });
    expect(counts['data-quality'].actionable).toBe(0);
    expect(counts['data-quality'].informational).toBe(1);
    expect(canAdvanceFuelStep('data-quality', counts)).toBe(true);
  });

  it('leakage misc blocks until reviewed', () => {
    const before = buildFuelStepCounts({
      vehicles: [{ ...base, misc: 12.5, healthStatus: 'Emerald' }],
    });
    expect(before['leakage-gap'].actionable).toBe(1);

    const after = buildFuelStepCounts({
      vehicles: [{ ...base, misc: 12.5, healthStatus: 'Emerald' }],
      leakageReviewed: true,
    });
    expect(after['leakage-gap'].actionable).toBe(0);
  });

  it('finalize actionable for unfinalized spend', () => {
    const counts = buildFuelStepCounts({
      vehicles: [{ ...base, isFinalized: false, healthStatus: 'Emerald' }],
    });
    expect(counts.finalize.actionable).toBe(1);
    expect(fuelActionableTotal(counts)).toBeGreaterThan(0);
  });
});
