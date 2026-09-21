import { describe, expect, it } from 'vitest';
import type { OdometerBucket } from './fuelTypes.ts';
import {
  applyStopToStopGapAccepts,
  findStopToStopGapAccept,
  isStopToStopGapAcceptable,
  revokeStopToStopGapAccept,
  upsertStopToStopGapAccepts,
  validateStopToStopGapAcceptRequest,
} from './applyStopToStopGapAccepts.ts';

function bucket(partial: Partial<OdometerBucket> & Pick<OdometerBucket, 'id'>): OdometerBucket {
  return {
    vehicleId: 'v1',
    startOdometer: 1000,
    endOdometer: 1100,
    startDate: '2026-09-08',
    endDate: '2026-09-09',
    actualFuelLiters: 10,
    actualFuelCost: 100,
    associatedReceipts: [],
    totalTripDistance: 0,
    tripsCount: 0,
    expectedFuelLiters: 10,
    varianceLiters: 0,
    variancePercent: 0,
    rideShareDistance: 180,
    personalDistance: 0,
    companyMiscDistance: 0,
    unaccountedDistance: 80,
    unexplainedDistance: 0,
    status: 'Anomaly',
    ...partial,
  };
}

describe('applyStopToStopGapAccepts', () => {
  it('clears attribution when all OVER-LOG windows are accepted', () => {
    const buckets = [bucket({ id: 'b1' }), bucket({ id: 'b2', startOdometer: 1100, endOdometer: 1200 })];
    const flags = applyStopToStopGapAccepts(
      { stopToStopAttributionFailed: true, stopToStopChainFailed: false },
      buckets,
      [
        {
          bucketId: 'b1',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 1100,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'platform overlog ok',
        },
        {
          bucketId: 'b2',
          vehicleId: 'v1',
          startOdometer: 1100,
          endOdometer: 1200,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'platform overlog ok',
        },
      ],
    );
    expect(flags.stopToStopAttributionFailed).toBe(false);
    expect(flags.stopToStopChainFailed).toBe(false);
  });

  it('partial accept still blocks attribution', () => {
    const buckets = [bucket({ id: 'b1' }), bucket({ id: 'b2', startOdometer: 1100, endOdometer: 1200 })];
    const flags = applyStopToStopGapAccepts(
      { stopToStopAttributionFailed: true },
      buckets,
      [
        {
          bucketId: 'b1',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 1100,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'accepted one only',
        },
      ],
    );
    expect(flags.stopToStopAttributionFailed).toBe(true);
  });

  it('never clears chain failure via accepts', () => {
    const buckets = [
      bucket({
        id: 'c1',
        chainAnomaly: true,
        confidenceTier: 'indeterminate',
        endOdometer: 900,
        rideShareDistance: 0,
        unaccountedDistance: 0,
      }),
    ];
    expect(isStopToStopGapAcceptable(buckets[0])).toBe(false);
    const flags = applyStopToStopGapAccepts(
      { stopToStopAttributionFailed: true, stopToStopChainFailed: true },
      buckets,
      [
        {
          bucketId: 'c1',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 900,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'should not help',
        },
      ],
    );
    expect(flags.stopToStopChainFailed).toBe(true);
  });

  it('chain-only leftover clears OVER-LOG attribution (chain flag still blocks)', () => {
    const buckets = [
      bucket({
        id: 'c2',
        chainAnomaly: true,
        confidenceTier: 'indeterminate',
        rideShareDistance: 200,
        unaccountedDistance: 100,
      }),
    ];
    const flags = applyStopToStopGapAccepts(
      { stopToStopAttributionFailed: true, stopToStopChainFailed: true },
      buckets,
      [],
    );
    expect(flags.stopToStopChainFailed).toBe(true);
    expect(flags.stopToStopAttributionFailed).toBe(false);
  });

  it('accepted OVER-LOG + remaining chain: attribution clears, chain stays', () => {
    const buckets = [
      bucket({ id: 'b1' }),
      bucket({
        id: 'c1',
        chainAnomaly: true,
        confidenceTier: 'indeterminate',
        startOdometer: 1100,
        endOdometer: 1000,
        rideShareDistance: 50,
        unaccountedDistance: 0,
      }),
    ];
    const flags = applyStopToStopGapAccepts(
      { stopToStopAttributionFailed: true, stopToStopChainFailed: true },
      buckets,
      [
        {
          bucketId: 'b1',
          vehicleId: 'v1',
          startOdometer: 1000,
          endOdometer: 1100,
          startDate: '2026-09-08',
          endDate: '2026-09-09',
          note: 'platform overlog accepted',
        },
      ],
    );
    expect(flags.stopToStopAttributionFailed).toBe(false);
    expect(flags.stopToStopChainFailed).toBe(true);
  });

  it('upsert and revoke by match key', () => {
    const a = {
      bucketId: 'b1',
      vehicleId: 'v1',
      startOdometer: 1,
      endOdometer: 2,
      startDate: '2026-09-08',
      endDate: '2026-09-09',
      note: 'first accept note',
    };
    const merged = upsertStopToStopGapAccepts([], [a, { ...a, note: 'updated note here' }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].note).toBe('updated note here');
    expect(findStopToStopGapAccept(merged, bucket({ id: 'b1' }))?.note).toBe('updated note here');
    expect(revokeStopToStopGapAccept(merged, a)).toHaveLength(0);
  });
});

describe('validateStopToStopGapAcceptRequest', () => {
  it('rejects short notes', () => {
    const r = validateStopToStopGapAcceptRequest({
      note: 'short',
      accepts: [{ kind: 'trips' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('note_too_short');
  });

  it('refuses chain kind', () => {
    const r = validateStopToStopGapAcceptRequest({
      note: 'long enough note here',
      accepts: [{ kind: 'chain' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('chain_cannot_accept');
  });

  it('accepts valid OVER-LOG payload', () => {
    const r = validateStopToStopGapAcceptRequest({
      note: 'platform trip inflation',
      accepts: [
        {
          kind: 'trips',
          startOdometer: 1000,
          endOdometer: 1100,
          rideShareDistance: 180,
          unaccountedDistance: 80,
        },
      ],
    });
    expect(r.ok).toBe(true);
  });
});
