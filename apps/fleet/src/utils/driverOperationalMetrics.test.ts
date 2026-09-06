import { describe, it, expect } from 'vitest';
import {
  computeServiceQualityRates,
  normalizeAcceptancePercent,
} from './driverOperationalMetrics';

describe('normalizeAcceptancePercent', () => {
  it('scales fractions 0–1 to percent', () => {
    expect(normalizeAcceptancePercent(0.85)).toBe(85);
  });

  it('passes through already-percent values', () => {
    expect(normalizeAcceptancePercent(92)).toBe(92);
  });
});

describe('computeServiceQualityRates', () => {
  it('golden: 80 completed + 20 cancelled → 80% completion / 20% cancel', () => {
    const r = computeServiceQualityRates({ completed: 80, cancelled: 20 });
    expect(r.totalTrips).toBe(100);
    expect(r.completionRate).toBe(80);
    expect(r.cancellationRate).toBe(20);
    // No CSV → acceptance mirrors completion
    expect(r.acceptanceRate).toBe(80);
  });

  it('prefers CSV acceptance over trip-derived completion', () => {
    const r = computeServiceQualityRates({ completed: 50, cancelled: 50 }, 0.91);
    expect(r.completionRate).toBe(50);
    expect(r.acceptanceRate).toBe(91);
  });

  it('returns null acceptance when no trips and no CSV', () => {
    const r = computeServiceQualityRates({ completed: 0, cancelled: 0 });
    expect(r.totalTrips).toBe(0);
    expect(r.acceptanceRate).toBeNull();
  });
});
