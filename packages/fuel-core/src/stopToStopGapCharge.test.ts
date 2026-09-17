import { describe, expect, it } from 'vitest';
import {
  driversInBucketWindow,
  resolveGapChargeDriver,
  gapChargeIdempotencyKey,
  assertPeriodNotLockedForGapCharge,
  assertGapChargeDualControl,
  assertGapChargeRecommendOverwrite,
} from './stopToStopGapCharge.ts';

describe('stopToStopGapCharge', () => {
  it('blocks multi-driver windows', () => {
    const vehicle = {
      currentDriverId: 'd2',
      driverAssignmentHistory: [
        {
          driverId: 'd1',
          driverName: 'A',
          assignedAt: '2026-09-01T00:00:00Z',
          unassignedAt: '2026-09-08T00:00:00Z',
        },
        {
          driverId: 'd2',
          driverName: 'B',
          assignedAt: '2026-09-08T00:00:00Z',
        },
      ],
    };
    const r = resolveGapChargeDriver({
      vehicle,
      startYmd: '2026-09-07',
      endYmd: '2026-09-09',
      confidenceTier: 'exact',
    });
    expect(r.ok).toBe(false);
  });

  it('resolves single driver in window', () => {
    const vehicle = {
      currentDriverId: 'd1',
      driverAssignmentHistory: [
        {
          driverId: 'd1',
          driverName: 'A',
          assignedAt: '2026-08-01T00:00:00Z',
        },
      ],
    };
    const r = resolveGapChargeDriver({
      vehicle,
      startYmd: '2026-09-07',
      endYmd: '2026-09-09',
      confidenceTier: 'exact',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.driverId).toBe('d1');
  });

  it('blocks non-exact confidence', () => {
    const r = resolveGapChargeDriver({
      vehicle: { currentDriverId: 'd1' },
      startYmd: '2026-09-07',
      endYmd: '2026-09-09',
      confidenceTier: 'indeterminate',
    });
    expect(r.ok).toBe(false);
  });

  it('idempotency key is stable per org+bucket', () => {
    expect(gapChargeIdempotencyKey('o1', 'b1')).toBe('gap_deduction:o1:b1');
  });

  it('driversInBucketWindow lists unique ids', () => {
    const ids = driversInBucketWindow(
      {
        currentDriverId: 'd1',
        driverAssignmentHistory: [
          { driverId: 'd1', driverName: 'A', assignedAt: '2026-09-01T00:00:00Z' },
        ],
      },
      '2026-09-07',
      '2026-09-08',
    );
    expect(ids).toEqual(['d1']);
  });

  it('assertPeriodNotLockedForGapCharge refuses locked / locked_at', () => {
    expect(assertPeriodNotLockedForGapCharge(null).ok).toBe(false);
    expect(assertPeriodNotLockedForGapCharge({ status: 'open' }).ok).toBe(true);
    expect(assertPeriodNotLockedForGapCharge({ status: 'locked' })).toEqual({
      ok: false,
      error: 'period_locked',
    });
    expect(assertPeriodNotLockedForGapCharge({ status: 'open', locked_at: '2026-09-01' })).toEqual({
      ok: false,
      error: 'period_locked',
    });
  });

  it('assertGapChargeDualControl requires actor and recommender; same-actor optional', () => {
    expect(assertGapChargeDualControl({ actor: null, recommendedBy: 'a' })).toMatchObject({
      ok: false,
      error: 'actor_required',
      status: 401,
    });
    expect(assertGapChargeDualControl({ actor: 'a', recommendedBy: null })).toMatchObject({
      ok: false,
      error: 'recommendation_missing_actor',
      status: 409,
    });
    // Solo-owner default: same actor allowed
    expect(assertGapChargeDualControl({ actor: 'a', recommendedBy: 'a' })).toEqual({
      ok: true,
      actor: 'a',
      recommendedBy: 'a',
    });
    expect(
      assertGapChargeDualControl({
        actor: 'a',
        recommendedBy: 'a',
        requireDistinctActor: true,
      }),
    ).toMatchObject({
      ok: false,
      error: 'same_actor_forbidden',
      status: 403,
    });
    expect(assertGapChargeDualControl({ actor: 'b', recommendedBy: 'a' })).toEqual({
      ok: true,
      actor: 'b',
      recommendedBy: 'a',
    });
  });

  it('assertGapChargeRecommendOverwrite blocks other actor', () => {
    expect(
      assertGapChargeRecommendOverwrite({
        actor: 'b',
        existing: { status: 'recommended', recommendedBy: 'a' },
      }),
    ).toEqual({ ok: false, error: 'already_recommended' });
    expect(
      assertGapChargeRecommendOverwrite({
        actor: 'a',
        existing: { status: 'recommended', recommendedBy: 'a' },
      }).ok,
    ).toBe(true);
    expect(assertGapChargeRecommendOverwrite({ actor: 'a', existing: null }).ok).toBe(true);
  });
});
