import { describe, expect, it } from 'vitest';
import { driverWithUberId } from './dialogs/TollV2FixDriverDialog';
import { vehicleWithPlateAliases } from './dialogs/TollV2WhichCarDialog';
import { importRowStatusLabel, readProblemRows, tollFilesSummary } from './tollV2ImportReportFormat';

describe('Step 1 fixes keep the whole record (saving replaces it)', () => {
  it('Fix driver changes only the Uber id', () => {
    const raw = { id: 'd1', name: 'Kenny', email: 'k@x.test', phone: '876', assignedVehicleId: 'v1', licenseFrontUrl: 'u' };
    expect(driverWithUberId(raw, 'd1', 'uber-9')).toEqual({ ...raw, uberDriverId: 'uber-9' });
  });

  it('Which car changes only the extra plates', () => {
    const raw = { id: 'v1', licensePlate: '5179KZ', make: 'Toyota', model: 'Roomy', currentDriverId: 'd1', vehicleCatalogId: 'cat' };
    expect(vehicleWithPlateAliases(raw, 'v1', ['9042PX'])).toEqual({ ...raw, plateAliases: ['9042PX'] });
  });
});

describe('reader problems on the Step 1 card', () => {
  const problems = [
    { row: 2, reason: 'Driver not found: dd', code: 'unknown_driver', value: 'dd', name: 'JAMAL CAMPBELL' },
    { row: 3, reason: 'Vehicle not found: 9042PX', code: 'unknown_plate', value: '9042PX' },
    { row: 4, reason: 'Invalid request time: x' },
  ];

  it('only fixable rows become card rows, in plain words without ids', () => {
    const rows = readProblemRows(problems);
    expect(rows).toHaveLength(2);
    expect(importRowStatusLabel(rows[0]!)).toBe("Problem: Driver JAMAL CAMPBELL isn't set up in Roam Fleet");
    expect(importRowStatusLabel(rows[1]!)).toBe("Problem: Car 9042PX isn't in your fleet");
    expect(rows[0]).toMatchObject({ row: 2, driver_id: 'dd', driver_name: 'JAMAL CAMPBELL' });
    expect(rows[1]).toMatchObject({ row: 3, plate: '9042PX' });
  });

  it('"This week\'s files" counts them', () => {
    const s = tollFilesSummary(
      [{ id: 'uber_bundle', status: 'received', requirement: 'required' }],
      [],
      { uber_bundle: readProblemRows(problems) },
    );
    expect(s.problems).toBe(2);
  });
});
