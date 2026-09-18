import { describe, expect, it } from 'vitest';
import { calculateOdometerBuckets } from './odometerBucketEngine.ts';
import { FuelCalculationService } from './fuelCalculationService.ts';
import {
  evaluateStopToStopConservation,
  evaluateStopToStopFromSnapshots,
  sumBucketLiters,
  sumBucketDistanceKm,
  chainSpanKm,
} from './stopToStopConservation.ts';
import type { FuelEntry, MileageAdjustment, Vehicle } from './fuelTypes.ts';

const vehicle = {
  id: 'v5179',
  licensePlate: '5179KZ',
  fuelSettings: { tankCapacity: 45, efficiencyCity: 10 },
} as Vehicle;

function fill(
  id: string,
  date: string,
  odometer: number,
  liters: number,
  amount: number,
  hard = true,
): FuelEntry {
  return {
    id,
    vehicleId: 'v5179',
    date,
    odometer,
    liters,
    amount,
    type: 'Card_Transaction',
    paymentSource: 'Gas_Card',
    metadata: hard
      ? { isHardAnchor: true, isFullTank: true }
      : { isSoftAnchor: true },
  } as FuelEntry;
}

describe('stop-to-stop ledger-anchor join (C-1)', () => {
  it('attaches litres when external anchors use fuel_<uuid> + YMD vs entry timestamps', () => {
    const entries = [
      fill('abc-open', '2026-09-07T07:43:00', 183372, 0, 0),
      fill('abc-close', '2026-09-08T14:23:00', 183502, 22.1, 4970),
    ];
    const externalAnchors = [
      {
        id: 'fuel_abc-open',
        referenceId: 'abc-open',
        source: 'fuel' as const,
        date: '2026-09-07',
        odometer: 183372,
      },
      {
        id: 'fuel_abc-close',
        referenceId: 'abc-close',
        source: 'fuel' as const,
        date: '2026-09-08',
        odometer: 183502,
      },
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], [], externalAnchors);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].actualFuelLiters).toBeCloseTo(22.1, 5);
    expect(buckets[0].closingEntryId).toBe('abc-close');
    expect(buckets[0].closingBoundarySource).toBe('fuel');
  });
});

describe('stop-to-stop check-in between fills (H-1)', () => {
  it('does not split a fill-to-fill interval when a check-in waypoint is present', () => {
    const entries = [
      fill('f1', '2026-09-07T08:00:00', 1000, 0, 0),
      fill('f2', '2026-09-09T18:00:00', 1300, 30, 6000),
    ];
    const externalAnchors = [
      {
        id: 'fuel_f1',
        referenceId: 'f1',
        source: 'fuel' as const,
        date: '2026-09-07',
        odometer: 1000,
      },
      {
        id: 'checkin_c1',
        referenceId: 'c1',
        source: 'checkin' as const,
        date: '2026-09-08',
        odometer: 1150,
      },
      {
        id: 'fuel_f2',
        referenceId: 'f2',
        source: 'fuel' as const,
        date: '2026-09-09',
        odometer: 1300,
      },
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], [], externalAnchors);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].endOdometer - buckets[0].startOdometer).toBe(300);
    expect(buckets[0].actualFuelLiters).toBeCloseTo(30, 5);
  });
});

describe('stop-to-stop floating + odometer disjointness (N-3)', () => {
  it('counts Floating entry with in-range odometer only once', () => {
    const entries: FuelEntry[] = [
      fill('f1', '2026-09-07T08:00:00', 1000, 0, 0),
      {
        ...fill('float-mid', '2026-09-08T12:00:00', 1150, 12, 2400),
        entryMode: 'Floating',
      },
      fill('f2', '2026-09-09T18:00:00', 1300, 20, 4000),
    ];
    // Ledger anchors = fill boundaries only; float-mid is mid-window with an odo.
    const externalAnchors = [
      {
        id: 'fuel_f1',
        referenceId: 'f1',
        source: 'fuel' as const,
        date: '2026-09-07',
        odometer: 1000,
      },
      {
        id: 'fuel_f2',
        referenceId: 'f2',
        source: 'fuel' as const,
        date: '2026-09-09',
        odometer: 1300,
      },
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], [], externalAnchors);
    expect(buckets).toHaveLength(1);
    // closing 20 + mid 12 = 32 (not 44 if double-counted via floating+mid)
    expect(buckets[0].actualFuelLiters).toBeCloseTo(32, 5);
    expect(buckets[0].actualFuelCost).toBeCloseTo(6400, 5);
    const ids = buckets[0].associatedReceipts.filter((id) => id === 'float-mid');
    expect(ids).toHaveLength(1);
  });
});

describe('stop-to-stop conservation', () => {
  it('volume conservation fails when litres are missing from buckets', () => {
    const entries = [
      fill('f1', '2026-09-07T08:00:00', 1000, 40, 8000),
      fill('f2', '2026-09-08T08:00:00', 1200, 35, 7000),
    ];
    // Broken join shape (no referenceId) — litres stay 0 with fuel_ prefix ids alone
    const brokenAnchors = [
      { id: 'fuel_f1', date: '2026-09-07', odometer: 1000, source: 'fuel' as const },
      { id: 'fuel_f2', date: '2026-09-08', odometer: 1200, source: 'fuel' as const },
    ];
    // With our engine, source=fuel + strip fuel_ prefix still works — assert green path:
    const ok = calculateOdometerBuckets(vehicle, entries, [], [], [
      { ...brokenAnchors[0], referenceId: 'f1' },
      { ...brokenAnchors[1], referenceId: 'f2' },
    ]);
    expect(sumBucketLiters(ok)).toBeCloseTo(35, 5);
    const weekOps = 75; // both fills
    const result = evaluateStopToStopConservation({
      buckets: ok,
      weekOpsLiters: weekOps,
    });
    // Only closing fill litres in one bucket = 35 vs week 75 → fails volume
    expect(result.volumeOk).toBe(false);
  });

  it('distance conservation matches chain span', () => {
    const entries = [
      fill('f1', '2026-09-07', 1000, 0, 0),
      fill('f2', '2026-09-08', 1200, 20, 4000),
      fill('f3', '2026-09-09', 1450, 25, 5000),
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], []);
    expect(sumBucketDistanceKm(buckets)).toBe(450);
    const result = evaluateStopToStopConservation({
      buckets,
      weekOpsLiters: 45,
      chainDistanceKm: chainSpanKm(buckets),
    });
    expect(result.distanceOk).toBe(true);
  });

  it('distance conservation FAILS when a middle window is dropped (R-2)', () => {
    // Two non-adjacent buckets: sum = 200, chain span = 300 → must fail
    const buckets = [
      {
        id: 'b1',
        vehicleId: 'v5179',
        startOdometer: 1000,
        endOdometer: 1100,
        startDate: '2026-09-07',
        endDate: '2026-09-08',
        actualFuelLiters: 10,
        actualFuelCost: 2000,
        associatedReceipts: [],
        totalTripDistance: 0,
        tripsCount: 0,
        expectedFuelLiters: 10,
        varianceLiters: 0,
        variancePercent: 0,
        rideShareDistance: 0,
        personalDistance: 0,
        companyMiscDistance: 0,
        unaccountedDistance: 0,
        unexplainedDistance: 100,
        status: 'Complete' as const,
      },
      {
        id: 'b2',
        vehicleId: 'v5179',
        startOdometer: 1200,
        endOdometer: 1300,
        startDate: '2026-09-09',
        endDate: '2026-09-10',
        actualFuelLiters: 10,
        actualFuelCost: 2000,
        associatedReceipts: [],
        totalTripDistance: 0,
        tripsCount: 0,
        expectedFuelLiters: 10,
        varianceLiters: 0,
        variancePercent: 0,
        rideShareDistance: 0,
        personalDistance: 0,
        companyMiscDistance: 0,
        unaccountedDistance: 0,
        unexplainedDistance: 100,
        status: 'Complete' as const,
      },
    ];
    expect(sumBucketDistanceKm(buckets)).toBe(200);
    expect(chainSpanKm(buckets)).toBe(300);
    const result = evaluateStopToStopConservation({
      buckets,
      weekOpsLiters: 20,
      chainDistanceKm: chainSpanKm(buckets),
    });
    expect(result.distanceOk).toBe(false);
  });

  it('attributionOk uses GPS band — 2 km over-log on 100 km does not fail (R-5)', () => {
    const buckets = [
      {
        id: 'b1',
        vehicleId: 'v5179',
        startOdometer: 1000,
        endOdometer: 1100,
        startDate: '2026-09-07',
        endDate: '2026-09-08',
        actualFuelLiters: 10,
        actualFuelCost: 2000,
        associatedReceipts: [],
        totalTripDistance: 102,
        tripsCount: 1,
        expectedFuelLiters: 10,
        varianceLiters: 0,
        variancePercent: 0,
        rideShareDistance: 102,
        personalDistance: 0,
        companyMiscDistance: 0,
        unaccountedDistance: 2,
        unexplainedDistance: 0,
        status: 'Complete' as const,
      },
    ];
    const result = evaluateStopToStopConservation({
      buckets,
      weekOpsLiters: 10,
      chainDistanceKm: 100,
    });
    expect(result.attributionOk).toBe(true);
  });

  it('evaluateStopToStopFromSnapshots maps volume fail to closable flags (R-3)', () => {
    const flags = evaluateStopToStopFromSnapshots({
      snapshots: [
        {
          odometerBuckets: [
            {
              id: 'b1',
              vehicleId: 'v1',
              startOdometer: 1000,
              endOdometer: 1100,
              startDate: '2026-09-07',
              endDate: '2026-09-08',
              actualFuelLiters: 10,
              actualFuelCost: 2000,
              associatedReceipts: [],
              totalTripDistance: 0,
              tripsCount: 0,
              expectedFuelLiters: 10,
              varianceLiters: 0,
              variancePercent: 0,
              rideShareDistance: 0,
              personalDistance: 0,
              companyMiscDistance: 0,
              unaccountedDistance: 0,
              unexplainedDistance: 100,
              status: 'Complete',
            },
          ],
        },
      ],
      weekOpsLiters: 100,
    });
    expect(flags.stopToStopVolumeFailed).toBe(true);
    expect(flags.conservation.volumeOk).toBe(false);
  });

  it('evaluateStopToStopFromSnapshots: two vehicles with contiguous chains → distanceOk (N-1)', () => {
    const mk = (
      id: string,
      vehicleId: string,
      start: number,
      end: number,
      liters: number,
    ) => ({
      id,
      vehicleId,
      startOdometer: start,
      endOdometer: end,
      startDate: '2026-09-07',
      endDate: '2026-09-08',
      actualFuelLiters: liters,
      actualFuelCost: liters * 200,
      associatedReceipts: [] as string[],
      totalTripDistance: 0,
      tripsCount: 0,
      expectedFuelLiters: liters,
      varianceLiters: 0,
      variancePercent: 0,
      rideShareDistance: 0,
      personalDistance: 0,
      companyMiscDistance: 0,
      unaccountedDistance: 0,
      unexplainedDistance: end - start,
      status: 'Complete' as const,
    });
    // Audit reproduction: pooled chainSpan would be ~124100 km; per-vehicle is 100+100.
    const flags = evaluateStopToStopFromSnapshots({
      snapshots: [
        { odometerBuckets: [mk('a', 'vehA', 184000, 184100, 10)] },
        { odometerBuckets: [mk('b', 'vehB', 60000, 60100, 10)] },
      ],
      weekOpsLiters: 20,
    });
    expect(flags.conservation.distanceOk).toBe(true);
    expect(flags.stopToStopDistanceFailed).toBe(false);
    expect(flags.conservation.bucketDistanceKm).toBe(200);
    expect(flags.conservation.weekDistanceKm).toBe(200);
    expect(flags.conservation.volumeOk).toBe(true);
  });

  it('evaluateStopToStopFromSnapshots: two vehicles, one dropped boundary → distanceOk false (N-1)', () => {
    const mk = (
      id: string,
      vehicleId: string,
      start: number,
      end: number,
      liters: number,
      unexplained: number,
    ) => ({
      id,
      vehicleId,
      startOdometer: start,
      endOdometer: end,
      startDate: '2026-09-07',
      endDate: '2026-09-08',
      actualFuelLiters: liters,
      actualFuelCost: liters * 200,
      associatedReceipts: [] as string[],
      totalTripDistance: 0,
      tripsCount: 0,
      expectedFuelLiters: liters,
      varianceLiters: 0,
      variancePercent: 0,
      rideShareDistance: 0,
      personalDistance: 0,
      companyMiscDistance: 0,
      unaccountedDistance: 0,
      unexplainedDistance: unexplained,
      status: 'Complete' as const,
    });
    // vehA: two buckets spanning 300 km but only covering 200 km of segments (gap).
    const flags = evaluateStopToStopFromSnapshots({
      snapshots: [
        {
          odometerBuckets: [
            mk('a1', 'vehA', 1000, 1100, 10, 100),
            mk('a2', 'vehA', 1200, 1300, 10, 100),
          ],
        },
        { odometerBuckets: [mk('b', 'vehB', 60000, 60100, 10, 100)] },
      ],
      weekOpsLiters: 30,
    });
    expect(flags.conservation.distanceOk).toBe(false);
    expect(flags.stopToStopDistanceFailed).toBe(true);
    expect(flags.conservation.messages.some((m) => m.includes('vehA'))).toBe(true);
  });
});

describe('stop-to-stop proportional trip split (H-4)', () => {
  it('splits a straddling trip across the fill boundary', () => {
    const entries = [
      fill('f1', '2026-09-07', 1000, 0, 0),
      fill('f2', '2026-09-08', 1100, 15, 3000),
      fill('f3', '2026-09-09', 1200, 15, 3000),
    ];
    const trips = [
      {
        id: 't1',
        vehicleId: 'v5179',
        date: '2026-09-08',
        status: 'Completed',
        startOdometer: 1050,
        endOdometer: 1150,
        distance: 100,
        onTripDistance: 100,
      },
    ] as any[];
    const buckets = calculateOdometerBuckets(vehicle, entries, trips, []);
    expect(buckets).toHaveLength(2);
    // 50% of 100 km in each half
    expect(buckets[0].rideShareDistance).toBeCloseTo(50, 5);
    expect(buckets[1].rideShareDistance).toBeCloseTo(50, 5);
  });
});

describe('stop-to-stop half-open floating receipts (H-6)', () => {
  it('counts a boundary-date floating receipt in only one bucket', () => {
    const entries: FuelEntry[] = [
      fill('f1', '2026-09-07', 1000, 0, 0),
      fill('f2', '2026-09-08', 1100, 10, 2000),
      fill('f3', '2026-09-09', 1200, 10, 2000),
      {
        id: 'float1',
        vehicleId: 'v5179',
        date: '2026-09-08T12:00:00',
        liters: 5,
        amount: 1000,
        type: 'Manual_Entry',
        paymentSource: 'Personal',
      } as FuelEntry,
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], []);
    const litersFromFloat = buckets.reduce((s, b) => {
      const has = b.associatedReceipts.includes('float1');
      return s + (has ? 1 : 0);
    }, 0);
    expect(litersFromFloat).toBe(1);
  });
});

describe('stop-to-stop dual-pay same odometer', () => {
  it('collapses same-odo boundaries and sums both closing fills (5179KZ pattern)', () => {
    const entries: FuelEntry[] = [
      fill('open', '2026-09-10', 184000, 0, 0),
      {
        id: 'cash-dual',
        vehicleId: 'v5179',
        date: '2026-09-11T11:03:00',
        odometer: 184476,
        liters: 15.432,
        amount: 3500,
        type: 'Reimbursement',
        paymentSource: 'RideShare_Cash',
      } as FuelEntry,
      {
        id: 'card-dual',
        vehicleId: 'v5179',
        date: '2026-09-11T11:01:00',
        odometer: 184476,
        liters: 6.63,
        amount: 1500,
        type: 'Manual_Entry',
        paymentSource: 'Gas_Card',
        metadata: { countsInFuelSpend: true },
      } as FuelEntry,
      fill('next', '2026-09-13', 184801, 13.268, 3000),
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], []);
    expect(buckets.some((b) => b.chainAnomaly)).toBe(false);
    expect(buckets).toHaveLength(2);
    const dualClose = buckets.find((b) => b.endOdometer === 184476);
    expect(dualClose).toBeTruthy();
    expect(dualClose!.actualFuelLiters).toBeCloseTo(15.432 + 6.63, 5);
    expect(dualClose!.associatedReceipts.sort()).toEqual(['card-dual', 'cash-dual'].sort());
    const weekOps = 15.432 + 6.63 + 13.268;
    const cons = evaluateStopToStopConservation({
      buckets,
      weekOpsLiters: weekOps,
      chainDistanceKm: chainSpanKm(buckets),
    });
    expect(cons.volumeOk).toBe(true);
    expect(cons.chainOk).toBe(true);
  });

  it('collapses duplicate external fuel anchors at the same odometer', () => {
    const entries: FuelEntry[] = [
      fill('open', '2026-09-10', 184000, 0, 0),
      {
        id: 'cash-dual',
        vehicleId: 'v5179',
        date: '2026-09-11T11:03:00',
        odometer: 184476,
        liters: 15.432,
        amount: 3500,
        type: 'Reimbursement',
        paymentSource: 'RideShare_Cash',
      } as FuelEntry,
      {
        id: 'card-dual',
        vehicleId: 'v5179',
        date: '2026-09-11T11:01:00',
        odometer: 184476,
        liters: 6.63,
        amount: 1500,
        type: 'Manual_Entry',
        paymentSource: 'Gas_Card',
      } as FuelEntry,
    ];
    const buckets = calculateOdometerBuckets(vehicle, entries, [], [], [
      { id: 'fuel_open', referenceId: 'open', source: 'fuel', date: '2026-09-10', odometer: 184000 },
      {
        id: 'fuel_cash-dual',
        referenceId: 'cash-dual',
        source: 'fuel',
        date: '2026-09-11',
        odometer: 184476,
      },
      {
        id: 'fuel_card-dual',
        referenceId: 'card-dual',
        source: 'fuel',
        date: '2026-09-11',
        odometer: 184476,
      },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].chainAnomaly).toBeFalsy();
    expect(buckets[0].actualFuelLiters).toBeCloseTo(22.062, 5);
  });
});

describe('stop-to-stop non-monotonic chain', () => {
  it('surfaces an indeterminate anomaly rather than a silent empty window', () => {
    // Force bad chain via external anchors with descending dates on ascending odo
    const forced = calculateOdometerBuckets(
      vehicle,
      [fill('a', '2026-09-10', 1000, 0, 0), fill('b', '2026-09-08', 1100, 20, 4000)],
      [],
      [],
      [
        { id: 'fuel_a', referenceId: 'a', source: 'fuel', date: '2026-09-10', odometer: 1000 },
        { id: 'fuel_b', referenceId: 'b', source: 'fuel', date: '2026-09-08', odometer: 1100 },
      ],
    );
    expect(forced.some((b) => b.chainAnomaly || b.confidenceTier === 'indeterminate')).toBe(true);
  });
});

describe('stop-to-stop H-8 freeze anchors match panel', () => {
  it('calculateReconciliation with ledger anchors keeps check-in as waypoint', () => {
    const entries = [
      fill('f1', '2026-09-07T08:00:00', 1000, 0, 0),
      fill('f2', '2026-09-09T18:00:00', 1300, 30, 6000),
    ];
    const externalAnchors = [
      {
        id: 'fuel_f1',
        referenceId: 'f1',
        source: 'fuel' as const,
        date: '2026-09-07',
        odometer: 1000,
      },
      {
        id: 'checkin_c1',
        referenceId: 'c1',
        source: 'checkin' as const,
        date: '2026-09-08',
        odometer: 1150,
      },
      {
        id: 'fuel_f2',
        referenceId: 'f2',
        source: 'fuel' as const,
        date: '2026-09-09',
        odometer: 1300,
      },
    ];
    const panel = calculateOdometerBuckets(vehicle, entries, [], [], externalAnchors);
    const report = FuelCalculationService.calculateReconciliation(
      vehicle,
      new Date('2026-09-07T12:00:00'),
      new Date('2026-09-13T12:00:00'),
      [],
      entries,
      [],
      [],
      undefined,
      { externalAnchors },
    );
    expect(panel).toHaveLength(1);
    expect(report.odometerBuckets || []).toHaveLength(1);
    expect(report.odometerBuckets![0].actualFuelLiters).toBeCloseTo(panel[0].actualFuelLiters, 5);
    expect(report.odometerBuckets![0].endOdometer - report.odometerBuckets![0].startOdometer).toBe(
      300,
    );
  });
});
