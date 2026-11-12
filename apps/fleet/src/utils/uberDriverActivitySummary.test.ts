import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseUberDaysHoursMinutes, uberDriverActivityFromFiles } from './uberDriverActivitySummary';
import type { FileData } from './csvHelpers';

function fixtureFile(): FileData {
  const text = readFileSync(
    join(__dirname, '../fixtures/golden-import-bundle-march16-23/driver_activity.csv'),
    'utf8',
  ).replace(/^﻿/, '');
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const headers = head.split(',');
  const rows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [headers[i], v])));
  return { id: 'f', name: 'driver_activity.csv', headers, rows, type: 'uber_driver_activity' } as FileData;
}

describe('WRA-21 Uber driver activity per week', () => {
  it('reads days : hours : minutes', () => {
    expect(parseUberDaysHoursMinutes('02:08:42')).toBe(56.7);
    expect(parseUberDaysHoursMinutes('1:10:52')).toBe(34.87);
    expect(parseUberDaysHoursMinutes('0:00:30')).toBe(0.5);
    expect(parseUberDaysHoursMinutes('56.7')).toBeNull();
    expect(parseUberDaysHoursMinutes('')).toBeNull();
  });

  it('reads the real Uber file: one row per driver with hours and trips', () => {
    expect(uberDriverActivityFromFiles([fixtureFile()])).toEqual([
      {
        driverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
        name: 'KENNY GREGORY RATTRAYCAS',
        tripsCompleted: 70,
        onlineHours: 56.7,
        onTripHours: 32.98,
      },
    ]);
  });

  it('ignores other Uber files', () => {
    expect(uberDriverActivityFromFiles([{ ...fixtureFile(), type: 'uber_trip' }])).toEqual([]);
  });
});
