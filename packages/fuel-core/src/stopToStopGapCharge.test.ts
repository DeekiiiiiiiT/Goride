import { describe, expect, it } from 'vitest';
import {
  driversInBucketWindow,
  resolveGapChargeDriver,
  gapChargeIdempotencyKey,
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
});
