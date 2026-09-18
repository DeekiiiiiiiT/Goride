import { describe, expect, it } from 'vitest';
import {
  isFuelDataQualityFlagged,
  parseDataQualityVehicleReviews,
  reviewedVehicleIdSet,
  upsertDataQualityVehicleReview,
} from './fuelDataQualityReview';
import { buildFuelStepCounts } from './fuelPeriodStatus';
import type { FuelPeriodVehicleSnapshot } from './fuelPeriodDerive';

function snap(partial: Partial<FuelPeriodVehicleSnapshot>): FuelPeriodVehicleSnapshot {
  return {
    vehicleId: 'v1',
    totalSpend: 100,
    companyShare: 80,
    driverShare: 20,
    misc: 0,
    pendingCount: 0,
    hasOpenDispute: false,
    hasScenarioAssigned: true,
    isFinalized: false,
    ...partial,
  };
}

describe('fuelDataQualityReview + cash-desk counts', () => {
  it('flags Amber/Red and odometerIncomplete', () => {
    expect(isFuelDataQualityFlagged({ healthStatus: 'Amber' })).toBe(true);
    expect(isFuelDataQualityFlagged({ healthStatus: 'Red' })).toBe(true);
    expect(isFuelDataQualityFlagged({ odometerIncomplete: true })).toBe(true);
    expect(isFuelDataQualityFlagged({ healthStatus: 'Emerald' })).toBe(false);
    expect(isFuelDataQualityFlagged({ pendingCount: 2 } as any)).toBe(false);
  });

  it('makes Amber actionable until reviewed', () => {
    const vehicles = [snap({ healthStatus: 'Amber' })];
    const blocked = buildFuelStepCounts({ vehicles });
    expect(blocked['data-quality'].actionable).toBe(1);

    const cleared = buildFuelStepCounts({
      vehicles,
      dataQualityReviewedVehicleIds: new Set(['v1']),
    });
    expect(cleared['data-quality'].actionable).toBe(0);
    expect(cleared['data-quality'].informational).toBe(1);
  });

  it('keeps pending-only informational', () => {
    const vehicles = [snap({ healthStatus: 'Emerald', pendingCount: 3 })];
    const counts = buildFuelStepCounts({ vehicles });
    expect(counts['data-quality'].actionable).toBe(0);
    expect(counts['data-quality'].informational).toBe(3);
  });

  it('parses and upserts reviews', () => {
    const parsed = parseDataQualityVehicleReviews([
      { vehicleId: 'a', at: '2026-01-01T00:00:00Z' },
      { vehicle_id: 'b', at: '2026-01-02T00:00:00Z', note: 'ok' },
    ]);
    expect(reviewedVehicleIdSet(parsed).has('a')).toBe(true);
    expect(reviewedVehicleIdSet(parsed).has('b')).toBe(true);
    const next = upsertDataQualityVehicleReview(parsed, {
      vehicleId: 'a',
      at: '2026-01-03T00:00:00Z',
      note: 'again',
    });
    expect(next.filter((r) => r.vehicleId === 'a')).toHaveLength(1);
    expect(next.find((r) => r.vehicleId === 'a')?.note).toBe('again');
  });
});
