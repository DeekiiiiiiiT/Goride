import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { mergeAndProcessData, type FileData } from './csvHelpers';
import { reconcilePaymentLinesToOrgStatement } from './reconcilePaymentLinesToOrgStatement';
import type { ParsedRow } from '../types/data';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/golden-import-bundle-march16-23');

function loadFile(rel: string, logicalName: string): FileData {
  const raw = readFileSync(join(FIXTURE_DIR, rel), 'utf8');
  const parsed = Papa.parse<ParsedRow>(raw, { header: true, skipEmptyLines: true });
  const rows = parsed.data.filter((r) =>
    Object.values(r).some((v) => String(v ?? '').trim() !== ''),
  );
  const headers = parsed.meta.fields ?? [];
  const name = logicalName.toLowerCase();
  let type: FileData['type'] = 'generic';
  if (name.includes('trip_activity')) type = 'uber_trip';
  else if (name.includes('payments_transaction')) type = 'uber_payment';
  else if (name.includes('payments_driver')) type = 'uber_payment_driver';
  else if (name.includes('payments_organization')) type = 'uber_payment_org';
  else if (name.includes('driver_quality')) type = 'uber_driver_quality';
  else if (name.includes('driver_activity')) type = 'uber_driver_activity';
  else if (name.includes('driver_time')) type = 'uber_driver_time_distance';
  else if (name.includes('vehicle_time')) type = 'uber_vehicle_time_distance';
  else if (name.includes('vehicle_performance')) type = 'uber_vehicle_performance';

  return {
    id: rel,
    name: logicalName,
    rows,
    headers: headers as string[],
    type,
    reportDate: '2026-03-16T12:00:00.000Z',
  };
}

function loadMarchBundle(): FileData[] {
  return [
    loadFile('trip_activity.csv', 'trip_activity.csv'),
    loadFile('payments_organization.csv', 'payments_organization.csv'),
    loadFile('payments_driver.csv', 'payments_driver.csv'),
    loadFile('payments_transaction.csv', 'payments_transaction.csv'),
    loadFile('driver_quality.csv', 'driver_quality.csv'),
    loadFile('driver_activity.csv', 'driver_activity.csv'),
    loadFile('driver_time_and_distance.csv', 'driver_time_and_distance.csv'),
    loadFile('vehicle_performance.csv', 'vehicle_performance.csv'),
    loadFile('vehicle_time_and_distance.csv', 'vehicle_time_and_distance.csv'),
  ];
}

describe('March 16–23 golden import bundle', () => {
  it('extracts payment lines and org statement totals', () => {
    const batch = mergeAndProcessData(loadMarchBundle(), []);
    expect(batch.paymentLedgerLines?.length).toBeGreaterThan(80);
    expect(batch.organizationMetrics?.length).toBe(1);

    const org = batch.organizationMetrics![0];
    expect(org.netFare).toBeCloseTo(71098.15, 1);
    expect(org.totalTips).toBeCloseTo(320, 1);
    expect(org.totalCashExposure).toBeGreaterThan(0);

    const rec = reconcilePaymentLinesToOrgStatement({
      organizationMetrics: org,
      paymentLines: batch.paymentLedgerLines ?? [],
      tolerance: 500,
    });
    expect(rec.paymentLineCount).toBe(batch.paymentLedgerLines!.length);
    expect(rec.netFareFromLines).toBeGreaterThan(0);
  });

  it('preserves uber trip status and cancelled rows', () => {
    const batch = mergeAndProcessData(loadMarchBundle(), []);
    const cancelled = batch.trips.filter((t) => t.status === 'Cancelled');
    const completed = batch.trips.filter((t) => t.status === 'Completed');
    expect(cancelled.length).toBeGreaterThan(10);
    expect(completed.length).toBeGreaterThan(10);
    expect(cancelled.some((t) => t.uberTripStatus?.includes('cancelled'))).toBe(true);
    expect(completed.some((t) => t.uberPaymentTypeRaw === 'cash')).toBe(true);
  });

  it('captures driver quality snapshots', () => {
    const batch = mergeAndProcessData(loadMarchBundle(), []);
    expect(batch.driverQualitySnapshots?.length).toBe(1);
    expect(batch.driverQualitySnapshots![0].tripsRejected).toBeGreaterThan(0);
    expect(batch.driverQualitySnapshots![0].tripsCompleted).toBe(70);
  });
});
