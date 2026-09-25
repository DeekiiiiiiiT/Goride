import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureFuelReconciliationPeriod = vi.fn();
const listFuelReconciliationPeriods = vi.fn();
const getFuelReconciliationPeriod = vi.fn();
const listFuelGapCharges = vi.fn();
const recommendFuelGapCharge = vi.fn();
const approveFuelGapCharge = vi.fn();

vi.mock('./api', () => ({
  api: {
    ensureFuelReconciliationPeriod: (...args: unknown[]) =>
      ensureFuelReconciliationPeriod(...args),
    listFuelReconciliationPeriods: (...args: unknown[]) =>
      listFuelReconciliationPeriods(...args),
    getFuelReconciliationPeriod: (...args: unknown[]) => getFuelReconciliationPeriod(...args),
    listFuelGapCharges: (...args: unknown[]) => listFuelGapCharges(...args),
    recommendFuelGapCharge: (...args: unknown[]) => recommendFuelGapCharge(...args),
    approveFuelGapCharge: (...args: unknown[]) => approveFuelGapCharge(...args),
  },
}));

import {
  gapChargeErrorMessage,
  listGapCharges,
  recommendGapCharge,
} from './stopToStopGapChargeService';

describe('gapChargeErrorMessage', () => {
  it('maps known codes', () => {
    expect(gapChargeErrorMessage('period_locked', 'x')).toContain('locked');
    expect(gapChargeErrorMessage({ error: 'actor_required' }, 'x')).toContain('Signed-in');
    expect(gapChargeErrorMessage({ error: 'already_recommended' }, 'x')).toContain(
      'already recommended',
    );
    expect(gapChargeErrorMessage({ error: 'recommendation_missing_actor' }, 'x')).toContain(
      'recommender',
    );
  });

  it('prefers body message then fallback', () => {
    expect(gapChargeErrorMessage({ error: 'other', message: 'Custom' }, 'fb')).toBe('Custom');
    expect(gapChargeErrorMessage(null, 'fb')).toBe('fb');
  });
});

describe('listGapCharges read path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not ensure when no period exists — returns empty', async () => {
    listFuelReconciliationPeriods.mockResolvedValue([]);
    const rows = await listGapCharges({
      periodId: 'week_2026-09-14_2026-09-20',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      status: 'recommended',
    });
    expect(rows).toEqual([]);
    expect(ensureFuelReconciliationPeriod).not.toHaveBeenCalled();
    expect(listFuelGapCharges).not.toHaveBeenCalled();
  });

  it('lists against existing period without ensure', async () => {
    listFuelReconciliationPeriods.mockResolvedValue([
      { id: 'org:2026-09-14', weekStart: '2026-09-14' },
    ]);
    listFuelGapCharges.mockResolvedValue({
      recommendations: [{ id: 'rec1', status: 'recommended' }],
    });
    const rows = await listGapCharges({
      periodId: 'week_2026-09-14_2026-09-20',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      status: 'recommended',
    });
    expect(ensureFuelReconciliationPeriod).not.toHaveBeenCalled();
    expect(listFuelGapCharges).toHaveBeenCalledWith({
      periodId: 'org:2026-09-14',
      status: 'recommended',
    });
    expect(rows).toHaveLength(1);
  });
});

describe('recommendGapCharge write path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensures period before recommend', async () => {
    ensureFuelReconciliationPeriod.mockResolvedValue({ id: 'org:2026-09-14' });
    recommendFuelGapCharge.mockResolvedValue({
      recommendation: {
        id: 'rec1',
        orgId: 'org',
        periodId: 'org:2026-09-14',
        bucketId: 'b1',
        vehicleId: 'v1',
        amount: 10,
        overLoggedKm: 1,
        reason: 'x',
        confidenceTier: 'exact',
        status: 'recommended',
        createdAt: '2026-09-18T00:00:00Z',
        engineVersion: 's2s-v1',
      },
    });
    await recommendGapCharge({
      orgId: 'org',
      periodId: 'week_2026-09-14_2026-09-20',
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
      bucket: {
        id: 'b1',
        vehicleId: 'v1',
        startDate: '2026-09-14',
        endDate: '2026-09-15',
        unaccountedDistance: 1,
        deductionRecommendation: 10,
        deductionReason: 'Over-logged distance',
        confidenceTier: 'exact',
      } as any,
      autoApprove: false,
    });
    expect(ensureFuelReconciliationPeriod).toHaveBeenCalledWith({
      weekStart: '2026-09-14',
      weekEnd: '2026-09-20',
    });
    expect(recommendFuelGapCharge).toHaveBeenCalled();
  });
});
