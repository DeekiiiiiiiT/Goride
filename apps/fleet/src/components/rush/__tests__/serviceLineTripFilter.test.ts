import { describe, expect, it } from 'vitest';
import {
  filterTripsByServiceLineScope,
  inferTripServiceLine,
  tripMatchesServiceLineScope,
} from '../../../utils/serviceLineTripFilter';

describe('serviceLineTripFilter', () => {
  const trips = [
    { id: '1', platform: 'Uber', service_line: 'rideshare' },
    { id: '2', platform: 'Roam Rush', service_line: 'rush_delivery' },
    { id: '3', platform: 'InDrive' },
  ];

  it('infers rush from platform', () => {
    expect(inferTripServiceLine({ platform: 'Roam Rush' })).toBe('rush_delivery');
    expect(inferTripServiceLine({ platform: 'Uber' })).toBe('rideshare');
  });

  it('filters by scope', () => {
    expect(filterTripsByServiceLineScope(trips, 'all')).toHaveLength(3);
    expect(filterTripsByServiceLineScope(trips, 'rush_delivery')).toHaveLength(1);
    expect(filterTripsByServiceLineScope(trips, 'rideshare')).toHaveLength(2);
  });

  it('matches scope predicate', () => {
    expect(tripMatchesServiceLineScope(trips[1], 'rush_delivery')).toBe(true);
    expect(tripMatchesServiceLineScope(trips[0], 'rush_delivery')).toBe(false);
  });
});
