import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  canCommitUberActivityTimeline,
  extractUberTimelineDriverIdentity,
  looksLikeOfficialUberDriverActivityCsv,
  looksLikeUberActivityTimeline,
  parseUberActivityDuration,
  parseUberActivityTimelineFromTable,
  parseUberActivityTimelineMatrix,
  parseUberActivityTimelineRows,
  parseUberActivityTimelineText,
  pickUberActivityTimelineSheetName,
  zonedWallClockToIso,
} from './uberActivityTimelineParse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KENNY_PASTE = readFileSync(
  join(__dirname, '../fixtures/uber-activity-timeline/kenny-oct12-19-paste.txt'),
  'utf8',
);

const KENNY_ID = '73e5b1dc-01b4-45ee-a34a-25a3256b9841';
const TZ = 'America/Jamaica';

describe('parseUberActivityDuration', () => {
  it('parses human durations from the Uber app', () => {
    expect(parseUberActivityDuration('42m')).toBe(42 * 60);
    expect(parseUberActivityDuration('1h 3m')).toBe(3600 + 180);
    expect(parseUberActivityDuration('11h 28m')).toBe(11 * 3600 + 28 * 60);
    expect(parseUberActivityDuration('1d 15h 32m')).toBe(1 * 86400 + 15 * 3600 + 32 * 60);
    expect(parseUberActivityDuration('19s')).toBe(19);
    expect(parseUberActivityDuration('< 1s')).toBe(0);
    expect(parseUberActivityDuration('2h')).toBe(7200);
    expect(parseUberActivityDuration('')).toBeNull();
  });
});

describe('zonedWallClockToIso', () => {
  it('pins America/Jamaica wall times to a stable UTC instant', () => {
    // Jamaica is UTC−5 year-round (no DST)
    expect(zonedWallClockToIso('2026-10-18', '10:57:00', TZ)).toBe('2026-10-18T15:57:00.000Z');
    expect(zonedWallClockToIso('2026-10-17', '20:09:00', TZ)).toBe('2026-10-18T01:09:00.000Z');
  });
});

describe('parseUberActivityTimelineText — small sample', () => {
  const sample = `
October 18 2026
Offline
10:57 AM
42m
Online
10:15 AM
37m
Accepted 1 trip
09:37 AM
Trip completed
10:13 AM
19m
On trip
09:53 AM
7m
Arrived at pick-up
09:46 AM
8m
Offer accepted
09:38 AM
2m
`.trim();

  it('maps labels to canonical verbs and synthesizes offer_received', () => {
    const result = parseUberActivityTimelineText(sample, { timeZone: TZ, driverId: KENNY_ID });
    expect(canCommitUberActivityTimeline(result)).toBe(true);
    expect(result.stats.days).toBe(1);
    expect(result.stats.onlineEvents).toBe(1);
    expect(result.stats.offlineEvents).toBe(1);
    expect(result.stats.offersAccepted).toBe(1);
    expect(result.stats.tripsCompleted).toBe(1);

    const types = result.events.map((e) => e.event_type);
    expect(types).toContain('went_online');
    expect(types).toContain('went_offline');
    expect(types).toContain('offer_received');
    expect(types).toContain('offer_accepted');
    expect(types).toContain('arrived_pickup');
    expect(types).toContain('job_started');
    expect(types).toContain('job_completed');

    const offer = result.events.find((e) => e.event_type === 'offer_accepted');
    expect(offer?.job_ref).toMatch(/^uber:/);
    expect(offer?.occurred_at).toBe('2026-10-18T14:38:00.000Z');
  });

  it('is idempotent for source_event_id on re-parse', () => {
    const a = parseUberActivityTimelineText(sample, { timeZone: TZ, driverId: KENNY_ID });
    const b = parseUberActivityTimelineText(sample, { timeZone: TZ, driverId: KENNY_ID });
    expect(a.events.map((e) => e.source_event_id)).toEqual(b.events.map((e) => e.source_event_id));
  });
});

describe('Kenny Oct 12–19 golden paste', () => {
  it('parses multi-day timeline with offers, completes, and cancels', () => {
    expect(looksLikeUberActivityTimeline(KENNY_PASTE)).toBe(true);

    const result = parseUberActivityTimelineText(KENNY_PASTE, {
      timeZone: TZ,
      driverId: KENNY_ID,
    });

    expect(result.stats.days).toBeGreaterThanOrEqual(4);
    expect(result.events.length).toBeGreaterThan(100);
    expect(result.stats.offersAccepted).toBeGreaterThan(20);
    expect(result.stats.tripsCompleted).toBeGreaterThan(20);
    expect(result.stats.driverCancels).toBeGreaterThan(0);
    expect(result.stats.riderCancels).toBeGreaterThan(0);
    expect(result.stats.onlineDurationSecondsFromLabels).toBeGreaterThan(3600);

    expect(result.dateRange?.from.slice(0, 10)).toBe('2026-10-13');
    // Last event is evening Oct 18 → UTC may roll to Oct 19
    expect(result.dateRange?.to.slice(0, 10) >= '2026-10-18').toBe(true);

    const first = result.events[0];
    const last = result.events[result.events.length - 1];
    expect(first.occurred_at <= last.occurred_at).toBe(true);

    // Re-parse stable
    const again = parseUberActivityTimelineText(KENNY_PASTE, {
      timeZone: TZ,
      driverId: KENNY_ID,
    });
    expect(again.events.length).toBe(result.events.length);
    expect(again.stats).toEqual(result.stats);
  });
});

describe('structured rows + table helpers', () => {
  it('parses Date|Event|Time|Duration rows', () => {
    const result = parseUberActivityTimelineRows(
      [
        { date: '2026-10-18', event: 'Online', time: '10:15 AM', duration: '37m' },
        { date: '2026-10-18', event: 'Offline', time: '10:57 AM', duration: '42m' },
      ],
      { timeZone: TZ, driverId: KENNY_ID },
    );
    expect(result.stats.onlineEvents).toBe(1);
    expect(result.stats.offlineEvents).toBe(1);
  });

  it('extracts Driver UUID from first data row only', () => {
    const identity = extractUberTimelineDriverIdentity(
      [
        'Driver UUID',
        'Driver first name',
        'Driver last name',
        'Date',
        'Time',
        'Activity / Event',
        'Duration / Status',
      ],
      [
        {
          'Driver UUID': '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
          'Driver first name': 'KENNY GREGORY',
          'Driver last name': 'RATTRAYCAS',
          Date: '13/10/2026',
          Time: '7:14 am',
          'Activity / Event': 'Online',
          'Duration / Status': '',
        },
        {
          'Driver UUID': '',
          'Driver first name': '',
          'Driver last name': '',
          Date: '13/10/2026',
          Time: '8:31 am',
          'Activity / Event': 'Offline',
          'Duration / Status': '1h 17m',
        },
      ],
    );
    expect(identity.uberUuid).toBe('52ff47da-ef48-41b8-93d5-80a09b85ce5b');
    expect(identity.displayName).toBe('KENNY GREGORY RATTRAYCAS');
  });

  it('accepts DD/MM/YYYY dates and lowercase am/pm (fleet CSV export)', () => {
    const result = parseUberActivityTimelineFromTable(
      [
        'Driver UUID',
        'Driver first name',
        'Driver last name',
        'Date',
        'Time',
        'Activity / Event',
        'Duration / Status',
      ],
      [
        {
          'Driver UUID': '52ff47da-ef48-41b8-93d5-80a09b85ce5b',
          'Driver first name': 'KENNY',
          'Driver last name': 'RATTRAY',
          Date: '13/10/2026',
          Time: '7:14 am',
          'Activity / Event': 'Online',
          'Duration / Status': '',
        },
        {
          'Driver UUID': '',
          'Driver first name': '',
          'Driver last name': '',
          Date: '13/10/2026',
          Time: '8:31 am',
          'Activity / Event': 'Offline',
          'Duration / Status': '1h 17m',
        },
      ],
      { timeZone: TZ, driverId: KENNY_ID, assumeChronological: true },
    );
    expect(result.stats.onlineEvents).toBe(1);
    expect(result.stats.offlineEvents).toBe(1);
    expect(result.events[0].local_date).toBe('2026-10-13');
    expect(result.events[0].occurred_at).toBe('2026-10-13T12:14:00.000Z');
  });

  it('picks Activity Log (Chronological) sheet and parses matrix', () => {
    expect(
      pickUberActivityTimelineSheetName([
        'Activity Log (Chronological)',
        'Activity Log (Original Order)',
        'Daily Summary',
      ]),
    ).toBe('Activity Log (Chronological)');

    const matrix = [
      ['Uber Fleet Driver Activity Log (Chronological)', '', '', ''],
      ['', '', '', ''],
      ['Date', 'Time', 'Activity / Event', 'Duration / Status'],
      ['2026-10-13', '07:14 AM', 'Online', ''],
      ['2026-10-13', '08:31 AM', 'Offline', '1h 17m'],
      ['2026-10-13', '09:10 AM', 'Offer accepted', '2m'],
      ['2026-10-13', '09:38 AM', 'Trip completed', '3m'],
    ];
    const result = parseUberActivityTimelineMatrix(matrix, {
      timeZone: TZ,
      driverId: KENNY_ID,
      assumeChronological: true,
    });
    expect(result.stats.onlineEvents).toBe(1);
    expect(result.stats.offlineEvents).toBe(1);
    expect(result.stats.offersAccepted).toBe(1);
    expect(result.stats.tripsCompleted).toBe(1);
    expect(result.events[0].event_type).toBe('went_online');
  });

  it('parses single-column table as paste', () => {
    const result = parseUberActivityTimelineFromTable(
      ['col'],
      [{ col: 'October 18 2026' }, { col: 'Online' }, { col: '10:15 AM' }, { col: '37m' }],
      { timeZone: TZ, driverId: KENNY_ID },
    );
    expect(result.stats.onlineEvents).toBe(1);
  });

  it('distinguishes official weekly DRIVER_ACTIVITY headers', () => {
    expect(
      looksLikeOfficialUberDriverActivityCsv([
        'Driver UUID',
        'Driver first name',
        'Time online (days : hours: minutes)',
        'Time on trip (days: hours : minutes)',
      ]),
    ).toBe(true);
    expect(looksLikeOfficialUberDriverActivityCsv(['Date', 'Event', 'Time', 'Duration'])).toBe(
      false,
    );
  });
});
