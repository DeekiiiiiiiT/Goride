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
});
