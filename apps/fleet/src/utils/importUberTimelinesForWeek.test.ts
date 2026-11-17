import { describe, expect, it, vi } from 'vitest';
import { importUberTimelinesForWeek, type TimelineFileInput } from './importUberTimelinesForWeek';

const OWNER_CSV = [
  'Driver UUID,Driver first name,Driver last name,Activity',
  '52FF47DA-ef48-41b8-93d5-80a09b85ce5b,KENNY GREGORY,RATTRAYCAS,October 31 2026',
  ',,,Trip completed',
  ',,,8:12 pm',
].join('\n');

describe('importUberTimelinesForWeek', () => {
  it('imports when driver matches Uber UUID', async () => {
    const importFn = vi.fn().mockResolvedValue({ inserted: 10, summary: { days: 1 } });
    const file: TimelineFileInput = {
      id: '1',
      name: 'timeline.csv',
      headers: [],
      rows: [],
      type: 'uber_activity_timeline',
      rawText: OWNER_CSV,
    };
    const lines = await importUberTimelinesForWeek(
      [file],
      [{ id: 'drv-1', name: 'Kenny', uberDriverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b' }],
      'America/Jamaica',
      importFn,
    );
    expect(lines[0].ok).toBe(true);
    expect(lines[0].message).toContain('Imported for Kenny');
    expect(importFn).toHaveBeenCalledWith(
      'drv-1',
      expect.objectContaining({ uberDriverUuid: '52ff47da-ef48-41b8-93d5-80a09b85ce5b' }),
    );
  });

  it('second upload same file keeps same event count (mock)', async () => {
    const importFn = vi.fn().mockResolvedValue({ inserted: 42, summary: { days: 3 } });
    const file: TimelineFileInput = {
      id: '1',
      name: 'timeline.csv',
      headers: [],
      rows: [],
      type: 'uber_activity_timeline',
      rawText: OWNER_CSV,
    };
    const roster = [{ id: 'drv-1', name: 'Kenny', uberDriverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b' }];
    await importUberTimelinesForWeek([file], roster, 'America/Jamaica', importFn);
    await importUberTimelinesForWeek([file], roster, 'America/Jamaica', importFn);
    expect(importFn.mock.calls[0][1].text).toBe(importFn.mock.calls[1][1].text);
    expect(importFn).toHaveBeenCalledTimes(2);
    const first = await importFn.mock.results[0].value;
    const second = await importFn.mock.results[1].value;
    expect(first.inserted).toBe(second.inserted);
  });
});
describe('importUberTimelinesForWeek — layouts, two drivers, failures', () => {
  const ROSTER = [
    { id: 'drv-kenny', name: 'Kenny', uberDriverId: '52ff47da-ef48-41b8-93d5-80a09b85ce5b' },
    { id: 'drv-two', name: 'Second Driver', uberDriverId: '11111111-2222-3333-4444-555555555555' },
  ];
  const file = (name: string, rawText: string): TimelineFileInput => ({
    id: name, name, headers: [], rows: [], type: 'uber_activity_timeline', rawText,
  });
  // First lines of the real 19 Oct file (Date / Time layout, ID on the first row only).
  const DATE_TIME_CSV = [
    '﻿Driver UUID,Driver first name,Driver last name,Date,Time,Activity / Event,Duration / Status',
    '52ff47da-ef48-41b8-93d5-80a09b85ce5b,KENNY GREGORY,RATTRAYCAS,19/10/2026,6:04 am,Online,',
    ',,,19/10/2026,6:18 am,Offline,13m',
  ].join('\r\n');

  it('Date / Time layout is matched by its Uber ID and sent oldest-first', async () => {
    const importFn = vi.fn().mockResolvedValue({ inserted: 2, summary: { days: 1 } });
    const lines = await importUberTimelinesForWeek([file('oct19.csv', DATE_TIME_CSV)], ROSTER, 'America/Jamaica', importFn);
    expect(lines).toEqual([{ fileName: 'oct19.csv', ok: true, message: 'Imported for Kenny (1 days)' }]);
    expect(importFn.mock.calls[0][0]).toBe('drv-kenny');
    expect(importFn.mock.calls[0][1].assumeChronological).toBe(true);
    expect(importFn.mock.calls[0][1].text).toMatch(/October 19 2026/);
  });

  it('two drivers in one upload each go to their own driver', async () => {
    const importFn = vi.fn().mockResolvedValue({ inserted: 1, summary: { days: 1 } });
    const second = OWNER_CSV.replace('52FF47DA-ef48-41b8-93d5-80a09b85ce5b', '11111111-2222-3333-4444-555555555555');
    await importUberTimelinesForWeek([file('a.csv', OWNER_CSV), file('b.csv', second)], ROSTER, 'America/Jamaica', importFn);
    expect(importFn.mock.calls.map((c) => c[0])).toEqual(['drv-kenny', 'drv-two']);
    expect(importFn.mock.calls[0][1].assumeChronological).toBe(false);
  });

  it('no ID columns, an unknown ID, and a failed import each give a message and never throw', async () => {
    const importFn = vi.fn()
      .mockRejectedValueOnce(new Error('This timeline belongs to another driver'));
    const unknown = OWNER_CSV.replace('52FF47DA-ef48-41b8-93d5-80a09b85ce5b', '99999999-0000-0000-0000-000000000000');
    const lines = await importUberTimelinesForWeek([
      file('plain.csv', 'October 31 2026\r\nOffline\r\n8:16 pm'),
      file('unknown.csv', unknown),
      file('kenny.csv', OWNER_CSV),
    ], ROSTER, 'America/Jamaica', importFn);
    expect(lines.map((l) => l.ok)).toEqual([false, false, false]);
    expect(lines[0].message).toMatch(/no driver Uber ID/);
    expect(lines[1].message).toMatch(/No driver has Uber ID 99999999/);
    expect(lines[2].message).toMatch(/belongs to another driver/);
    expect(importFn).toHaveBeenCalledTimes(1);
  });
});
