import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { indrive } from './indrive.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

describe('indrive', () => {
  const text = readFileSync(join(FIXTURES, 'indrive_trips.csv'), 'utf8');

  it('maps tollCharges and payment method', () => {
    const out = indrive(text);
    expect(out.rows).toEqual([
      {
        row_type: 'trip',
        platform_trip_id: 'trip-ind-1',
        driver_id: 'driver-a',
        vehicle_id: 'vehicle-a',
        request_at: '2024-06-20T14:30:00-05:00',
        payment_method: 'card',
        dropoff_at: '2024-06-20T15:10:00-05:00',
        toll_payback_minor: 450,
      },
      {
        row_type: 'trip',
        platform_trip_id: 'trip-ind-2',
        driver_id: 'driver-a',
        vehicle_id: 'vehicle-a',
        request_at: '2024-06-21T08:00:00-05:00',
        payment_method: 'unknown',
        dropoff_at: '2024-06-21T08:45:00-05:00',
      },
    ]);
  });

  it('maps Cash payment method to cash', () => {
    const csv = `id,driverId,vehicleId,requestTime,paymentMethod
trip-cash,driver-a,vehicle-a,20/06/2024 14:30,Cash`;
    const out = indrive(csv);
    expect(out.rows[0].payment_method).toBe('cash');
  });

  it('reports missing trip id', () => {
    const csv = `id,driverId,vehicleId,requestTime
,driver-a,vehicle-a,20/06/2024 14:30`;
    const out = indrive(csv);
    expect(out.rows).toHaveLength(0);
    expect(out.problems).toEqual([{ row: 2, reason: 'Missing trip id' }]);
  });

  it('reports unknown driver', () => {
    const csv = `id,driverName,vehicleId,requestTime
trip-x,Unknown Person,vehicle-a,20/06/2024 14:30`;
    const out = indrive(csv, {});
    expect(out.rows).toHaveLength(0);
    expect(out.problems).toEqual([{ row: 2, reason: 'Missing driver' }]);
  });

  it('is deterministic', () => {
    expect(indrive(text)).toEqual(indrive(text));
  });

  it('normalizes plate for vehicle lookup', () => {
    const csv = `id,driverId,vehiclePlate,requestTime
trip-plate,driver-a,1234 ab,20/06/2024 14:30`;
    const out = indrive(csv, { vehicleByPlate: { '1234AB': 'vehicle-z' } });
    expect(out.rows[0]?.vehicle_id).toBe('vehicle-z');
  });

  it('resolves driver by InDrive id and normalized name, not Uber uuid', () => {
    const uberUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const ctx = {
      driverByExternalId: {
        'ind-99': 'driver-ind',
        'JOHN DOE': 'driver-name',
      },
      vehicleByPlate: { X: 'v1' },
    };
    const byId = indrive(
      `id,driverId,vehicleId,requestTime\nt1,ind-99,v1,20/06/2024 14:30`,
      ctx,
    );
    expect(byId.rows[0].driver_id).toBe('driver-ind');

    const byName = indrive(
      `id,driverName,vehicleId,requestTime\nt2,  john   doe  ,v1,20/06/2024 14:30`,
      ctx,
    );
    expect(byName.rows[0].driver_id).toBe('driver-name');

    const byUber = indrive(
      `id,driverId,vehicleId,requestTime\nt3,${uberUuid},v1,20/06/2024 14:30`,
      ctx,
    );
    expect(byUber.rows).toHaveLength(0);
    expect(byUber.problems[0].reason).toBe('Missing driver');
  });

  it('reads toll_payback_minor as cents and tollCharges as dollars', () => {
    const minor = indrive(
      `id,driverId,vehicleId,requestTime,toll_payback_minor
t-min,driver-a,vehicle-a,20/06/2024 14:30,37000`,
    );
    expect(minor.rows[0].toll_payback_minor).toBe(37000);

    const dollars = indrive(
      `id,driverId,vehicleId,requestTime,tollCharges
t-dol,driver-a,vehicle-a,20/06/2024 14:30,370`,
    );
    expect(dollars.rows[0].toll_payback_minor).toBe(37000);
  });
});
