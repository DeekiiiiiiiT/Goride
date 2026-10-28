import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CANCEL_REASON_CODES,
  TRIP_ANALYTICS_FILTER_KEYS,
  TRIP_ANALYTICS_RULES_V1,
  analyticsPopulation,
  buildTripAnalyticsFilter,
  cashCollectedAbs,
  normalizeCancel,
  priorPeriod,
  statusBucket,
  tripLocalParts,
} from './tripAnalyticsDefinitions';

const here = dirname(fileURLToPath(import.meta.url));

describe('trip analytics definitions', () => {
  it('lands 2026-03-01T04:30Z on 28 Feb at 23:00 Jamaica', () => {
    const parts = tripLocalParts('2026-03-01T04:30:00.000Z', null);
    expect(parts).toEqual({
      localDate: '2026-02-28',
      localHour: 23,
      localDow: 6,
      timeUnknown: false,
    });
  });

  it('marks a missing request time as time-unknown and keeps the date', () => {
    expect(tripLocalParts(null, '2026-04-02')).toMatchObject({
      localDate: '2026-04-02',
      localHour: null,
      timeUnknown: true,
    });
  });

  it('uses the same days last month for a month-to-date range', () => {
    expect(priorPeriod('2026-10-01', '2026-10-21')).toEqual({
      start: '2026-09-01',
      end: '2026-09-21',
    });
  });

  it('uses a same-length window ending the day before the start', () => {
    expect(priorPeriod('2026-10-10', '2026-10-16')).toEqual({
      start: '2026-10-03',
      end: '2026-10-09',
    });
  });

  it('maps cancel reasons without guessing delivery as the rider', () => {
    expect(normalizeCancel({ status: 'Cancelled', cancellationReason: 'delivery_failed' })).toEqual({
      actor: 'delivery',
      reason: 'delivery_failed',
    });
    expect(normalizeCancel({ status: 'Cancelled', cancellationReason: null })).toEqual({
      actor: 'unknown',
      reason: 'unknown',
    });
    expect(normalizeCancel({ status: 'Cancelled', cancellationReason: 'Other (Driver)' })?.actor).toBe('driver');
    expect(normalizeCancel({ status: 'Completed', cancellationReason: 'rider_cancelled' })).toBeNull();
  });

  it('takes the absolute cash amount and does not invent a sign', () => {
    expect(cashCollectedAbs(-1200)).toBe(1200);
    expect(cashCollectedAbs(40)).toBe(40);
    expect(cashCollectedAbs(null)).toBeNull();
  });

  it('keeps delivery jobs out of the rideshare population', () => {
    expect(analyticsPopulation({ cancelReason: 'delivery_failed', serviceLine: 'rideshare' })).toBe('delivery');
    expect(analyticsPopulation({ serviceCategory: 'courier' })).toBe('delivery');
    expect(analyticsPopulation({ serviceLine: 'rideshare' })).toBe('rideshare');
  });

  it('buckets in-progress statuses together and clears dates for Processing', () => {
    expect(statusBucket('In Progress')).toBe('in_progress');
    const filter = buildTripAnalyticsFilter({
      status: 'Processing',
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      platform: 'GoRide',
      minEarnings: '100',
      hasTip: 'yes',
      hasSurge: 'no',
      tripType: 'manual',
    });
    expect(filter.startDate).toBeNull();
    expect(filter.platform).toBe('Roam');
    expect(filter.minEarnings).toBe(100);
    expect(filter.hasTip).toBe(true);
    expect(filter.hasSurge).toBe(false);
    expect(filter.isManual).toBe(true);
    expect(filter.status).toBe('in_progress');
  });

  it('keeps the edge re-export and the SQL migration on the same rules', () => {
    const root = resolve(here, '../..', '..');
    const edge = readFileSync(
      resolve(root, 'supabase/functions/_fleet-server/trip_analytics_definitions.ts'),
      'utf8',
    );
    const sql = readFileSync(
      resolve(root, 'supabase/migrations_archive/20261021190000_trip_analytics_facts.sql'),
      'utf8',
    );
    expect(edge).toContain('tripAnalyticsDefinitions.ts');
    expect(edge).toContain(TRIP_ANALYTICS_RULES_V1);
    expect(sql).toContain(TRIP_ANALYTICS_RULES_V1);
    expect(sql).toContain('America/Jamaica');
    for (const code of CANCEL_REASON_CODES) expect(sql).toContain(code);
    for (const key of TRIP_ANALYTICS_FILTER_KEYS) {
      if (key === 'compare' || key === 'platforms' || key === 'driverIds' || key === 'vehicleIds') continue;
      expect(sql).toContain(key);
    }
  });
});
