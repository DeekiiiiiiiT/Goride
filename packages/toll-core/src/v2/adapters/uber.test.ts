import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { uber } from './uber.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

const ctx = {
  driverByUberUuid: { '52ff47da-ef48-41b8-93d5-80a09b85ce5b': 'driver-kenny' },
  vehicleByPlate: { '5179KZ': 'vehicle-5179' },
};

function loadGolden() {
  return {
    payments: readFileSync(join(FIXTURES, 'payments_transaction_golden.csv'), 'utf8'),
    tripActivity: readFileSync(join(FIXTURES, 'trip_activity_golden.csv'), 'utf8'),
  };
}

const goldenCashTrips = [
  {
    row_type: 'trip' as const,
    platform_trip_id: '789d19f5-4ef6-4f08-88de-b330f424c989',
    driver_id: 'driver-kenny',
    vehicle_id: 'vehicle-5179',
    request_at: '2026-01-12T05:58:00-05:00',
    time_precision: 'minute' as const,
    payment_method: 'cash' as const,
    dropoff_at: '2026-01-12T07:14:00-05:00',
    toll_payback_minor: 37000,
  },
  {
    row_type: 'trip' as const,
    platform_trip_id: 'e5719781-187c-4a7e-9b87-861c80f3fd88',
    driver_id: 'driver-kenny',
    vehicle_id: 'vehicle-5179',
    request_at: '2026-01-12T16:57:00-05:00',
    time_precision: 'minute' as const,
    payment_method: 'cash' as const,
    dropoff_at: '2026-01-12T18:00:00-05:00',
    toll_payback_minor: 64500,
  },
  {
    row_type: 'trip' as const,
    platform_trip_id: '5c9e972d-3eb2-482e-ab58-95168de18bb8',
    driver_id: 'driver-kenny',
    vehicle_id: 'vehicle-5179',
    request_at: '2026-01-15T06:12:00-05:00',
    time_precision: 'minute' as const,
    payment_method: 'cash' as const,
    dropoff_at: '2026-01-15T07:09:00-05:00',
    toll_payback_minor: 37000,
  },
];

const goldenAdjustments = [
  {
    row_type: 'adjustment' as const,
    reference: '86927f2b-762d-45b0-8723-2fe2706bfc25',
    driver_id: 'driver-kenny',
    paid_on: '2026-01-12',
    amount_minor: 1000,
  },
  {
    row_type: 'adjustment' as const,
    reference: '7017737d-6e2a-446b-ad74-db4ac8fcb7e7',
    driver_id: 'driver-kenny',
    paid_on: '2026-01-16',
    amount_minor: 1000,
  },
  {
    row_type: 'adjustment' as const,
    reference: 'aaaa0000-0000-4000-8000-000000000099',
    driver_id: 'driver-kenny',
    paid_on: '2026-01-16',
    amount_minor: -1050,
  },
];

describe('uber adapter (golden sample from uber-csv-analysis)', () => {
  const files = loadGolden();

  it('marks cash trips with toll payback 370 / 645 / 370', () => {
    const out = uber(files, ctx);
    const trips = out.rows.filter((r) => r.row_type === 'trip');
    for (const expected of goldenCashTrips) {
      expect(trips.find((t) => t.platform_trip_id === expected.platform_trip_id)).toEqual(expected);
    }
  });

  it('keeps support adjustment sign', () => {
    const out = uber(files, ctx);
    const adjs = out.rows.filter((r) => r.row_type === 'adjustment');
    expect(adjs).toHaveLength(3);
    for (const expected of goldenAdjustments) {
      expect(adjs.find((a) => a.reference === expected.reference)).toEqual(expected);
    }
  });

  it('does not add adjustment toll to a trip when Trip UUID is present', () => {
    const tripId = '11111111-1111-1111-1111-111111111111';
    const payments = readFileSync(join(FIXTURES, 'payments_transaction_golden.csv'), 'utf8');
    const extra =
      `sync-uuid\t52ff47da-ef48-41b8-93d5-80a09b85ce5b\tX\tY\t${tripId}\tSupport Adjustment:  adj-with-trip-uuid\tOrg\talias\t2026-01-20 12:00:00.000 -0500 EST\t0\t0\t0\t0\t0\t0\t0\t0\t5\t0\t0\t0\t0\t0\n`;
    const tripActivity = readFileSync(join(FIXTURES, 'trip_activity_golden.csv'), 'utf8');
    const actExtra = `${tripId}\t52ff47da-ef48-41b8-93d5-80a09b85ce5b\tK\tR\tv\t5179KZ\tsvc\t1/20/2026 8:00\t1/20/2026 9:00\tp\td\t1\tcompleted\tUberX\n`;
    const out = uber({ payments: payments + extra, tripActivity: tripActivity + actExtra }, ctx);
    const trip = out.rows.find(
      (r) => r.row_type === 'trip' && r.platform_trip_id === tripId,
    );
    expect(trip?.toll_payback_minor).toBeUndefined();
    expect(out.rows.some((r) => r.row_type === 'adjustment' && r.reference === 'adj-with-trip-uuid')).toBe(
      true,
    );
  });

  it('reports unreadable adjustment date', () => {
    const payments = `transaction UUID\tDriver UUID\tDriver first name\tDriver last name\tTrip UUID\tDescription\tOrganization name\tOrg alias\tvs reporting\tPaid to you:Trip balance:Refunds:Toll
x\t52ff47da-ef48-41b8-93d5-80a09b85ce5b\tK\tR\t\tSupport Adjustment:  bad-date-case\tO\tA\tnot-a-date\t10`;
    const out = uber({ payments, tripActivity: 'Trip UUID\tTrip request time\n' }, ctx);
    expect(out.rows.filter((r) => r.row_type === 'adjustment')).toHaveLength(0);
    expect(out.problems).toEqual([{ row: 2, reason: 'Adjustment date unreadable' }]);
  });

  it('emits activity-only trips as card with no toll', () => {
    const activityOnlyId = '22222222-2222-2222-2222-222222222222';
    const tripActivity = readFileSync(join(FIXTURES, 'trip_activity_golden.csv'), 'utf8');
    const actExtra = `${activityOnlyId}\t52ff47da-ef48-41b8-93d5-80a09b85ce5b\tK\tR\tv\t5179KZ\tsvc\t21/1/2026 8:00\t21/1/2026 9:00\tp\td\t1\tcompleted\tUberX\n`;
    const out = uber(
      {
        payments: readFileSync(join(FIXTURES, 'payments_transaction_golden.csv'), 'utf8'),
        tripActivity: tripActivity + actExtra,
      },
      ctx,
    );
    expect(
      out.rows.find(
        (r) => r.row_type === 'trip' && r.platform_trip_id === activityOnlyId,
      ),
    ).toEqual({
      row_type: 'trip',
      platform_trip_id: activityOnlyId,
      driver_id: 'driver-kenny',
      vehicle_id: 'vehicle-5179',
      request_at: '2026-01-21T08:00:00-05:00',
      time_precision: 'minute',
      payment_method: 'card',
      dropoff_at: '2026-01-21T09:00:00-05:00',
    });
  });

  it('is deterministic', () => {
    expect(uber(files, ctx)).toEqual(uber(files, ctx));
  });

  it('reports unknown driver and vehicle instead of importing raw ids', () => {
    const tripId = '33333333-3333-3333-3333-333333333333';
    const badDriver = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const tripActivity = `Trip UUID\tDriver UUID\tLicense plate\tTrip request time\tTrip drop off time
${tripId}\t${badDriver}\tXXXX\t1/22/2026 8:00\t1/22/2026 9:00`;
    const payments = `transaction UUID\tDriver UUID\tTrip UUID\tPaid to you:Trip balance:Refunds:Toll
x\t${badDriver}\t${tripId}\t370`;
    const out = uber({ payments, tripActivity }, ctx);
    expect(out.rows.filter((r) => r.row_type === 'trip')).toHaveLength(0);
    expect(out.problems.some((p) => p.reason === `Driver not found: ${badDriver}`)).toBe(true);

    const trip2 = '44444444-4444-4444-4444-444444444444';
    const act2 = `Trip UUID\tDriver UUID\tLicense plate\tTrip request time\tTrip drop off time
${trip2}\t52ff47da-ef48-41b8-93d5-80a09b85ce5b\tNOPE\t1/22/2026 8:00\t1/22/2026 9:00`;
    const pay2 = `transaction UUID\tDriver UUID\tTrip UUID\tPaid to you:Trip balance:Refunds:Toll
x\t52ff47da-ef48-41b8-93d5-80a09b85ce5b\t${trip2}\t370`;
    const out2 = uber({ payments: pay2, tripActivity: act2 }, ctx);
    expect(out2.rows.filter((r) => r.row_type === 'trip')).toHaveLength(0);
    expect(out2.problems.some((p) => p.reason === 'Vehicle not found: NOPE')).toBe(true);

    const adjPayments = `transaction UUID\tDriver UUID\tDescription\tvs reporting\tPaid to you:Trip balance:Refunds:Toll
x\t${badDriver}\tSupport Adjustment:  adj-missing-driver\t2026-01-20\t10`;
    const out3 = uber(
      { payments: adjPayments, tripActivity: 'Trip UUID\tTrip request time\n' },
      ctx,
    );
    expect(out3.rows.filter((r) => r.row_type === 'adjustment')).toHaveLength(0);
    expect(out3.problems.some((p) => p.reason === `Driver not found: ${badDriver}`)).toBe(true);
  });
});
