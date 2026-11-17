import { describe, expect, it } from 'vitest';
import { detectFileType } from './csvHelpers';

describe('detectFileType uber_activity_timeline', () => {
  it('detects owner layout (Driver UUID + Activity, no Date/Time)', () => {
    expect(
      detectFileType(['Driver UUID', 'Driver first name', 'Driver last name', 'Activity'], 'paste.csv'),
    ).toBe('uber_activity_timeline');
  });

  it('detects headerless Uber copy from first content line', () => {
    expect(detectFileType([], 'paste.csv', 'October 31 2026')).toBe('uber_activity_timeline');
  });

  it('keeps structured Date/Time timeline as uber_activity_timeline', () => {
    expect(detectFileType(['Date', 'Time', 'Activity / Event'], 'tl.csv')).toBe('uber_activity_timeline');
  });
});
describe('detectFileType — real headers from the 19 Oct / 26 Oct Uber folders', () => {
  it('19 Oct timeline (ID columns + Date / Time) is a timeline', () => {
    expect(detectFileType(
      ['Driver UUID', 'Driver first name', 'Driver last name', 'Date', 'Time', 'Activity / Event', 'Duration / Status'],
      'uber_activity_timeline.csv',
    )).toBe('uber_activity_timeline');
  });

  it('a plain Uber copy read with header:true (first line becomes the only header) is a timeline', () => {
    expect(detectFileType(['October 31 2026'], 'uber_activity_timeline.csv', 'October 31 2026')).toBe('uber_activity_timeline');
  });

  it('the weekly Uber reports keep their own types', () => {
    expect(detectFileType(
      ['Driver UUID', 'Driver first name', 'Driver last name', 'Trips completed', 'Time online (days : hours: minutes)', 'Time on trip (days: hours : minutes)'],
      '20261026-20261102-driver_activity-X.csv',
    )).toBe('uber_driver_activity');
    expect(detectFileType(
      ['Trip UUID', 'Driver UUID', 'Driver first name', 'Driver last name', 'Vehicle UUID', 'License plate', 'Service type', 'Trip request time', 'Trip drop off time', 'Pickup address'],
      '20261026-20261102-trip_activity-X.csv',
    )).toBe('uber_trip');
    expect(detectFileType(
      ['Driver UUID', 'Driver First Name', 'Driver Last Name', 'Open Time', 'Enroute Time', 'On Trip Time', 'Unavailable Time', 'Open Distance'],
      '20261026-20261102-driver_time_and_distance-X.csv',
    )).toBe('uber_driver_time_distance');
  });
});
