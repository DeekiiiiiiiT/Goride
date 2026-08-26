import { describe, it, expect } from 'vitest';
import { classifyOrphanToll, type OrphanCandidateTrip } from './orphanTollClassifier.ts';

const PROXIMITY = 180;

const tripAt = (iso: string): OrphanCandidateTrip => ({ dropoffTime: iso });

describe('classifyOrphanToll', () => {
  it('flags high/ORPHAN_NO_TRIP when there are no candidate trips at all', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('high');
    expect(r.reasonCode).toBe('ORPHAN_NO_TRIP');
    expect(r.nearestTripDiffMinutes).toBeNull();
  });

  it('flags high/ORPHAN_NO_TRIP when the only trip is on a different day', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-09T12:00:00Z')],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('high');
    expect(r.reasonCode).toBe('ORPHAN_NO_TRIP');
    expect(r.nearestTripDiffMinutes).toBe(1440);
  });

  it('flags medium/ORPHAN_OUT_OF_WINDOW when a same-day trip is outside proximity', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-10T08:00:00Z')],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.reasonCode).toBe('ORPHAN_OUT_OF_WINDOW');
    expect(r.nearestTripDiffMinutes).toBe(240);
  });

  it('flags low/ORPHAN_NEARBY_UNEXPLAINED when a same-day trip is within proximity', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-10T11:00:00Z')],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.reasonCode).toBe('ORPHAN_NEARBY_UNEXPLAINED');
    expect(r.nearestTripDiffMinutes).toBe(60);
  });

  it('flags low/ORPHAN_NEARBY_UNEXPLAINED at the exact proximity boundary', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-10T09:00:00Z')],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.reasonCode).toBe('ORPHAN_NEARBY_UNEXPLAINED');
    expect(r.nearestTripDiffMinutes).toBe(180);
  });

  it('picks the NEAREST trip when several exist on the same day', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [
        tripAt('2026-03-10T06:00:00Z'),
        tripAt('2026-03-10T11:30:00Z'),
      ],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.reasonCode).toBe('ORPHAN_NEARBY_UNEXPLAINED');
    expect(r.nearestTripDiffMinutes).toBe(30);
  });

  it('flags low/ORPHAN_NEARBY_UNEXPLAINED when the toll timestamp is unparseable', () => {
    const r = classifyOrphanToll({
      txDate: new Date('not-a-date'),
      candidateTrips: [tripAt('2026-03-10T08:00:00Z')],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.reasonCode).toBe('ORPHAN_NEARBY_UNEXPLAINED');
    expect(r.nearestTripDiffMinutes).toBeNull();
  });

  it('ignores unparseable trip anchors but still uses valid ones', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [
        { dropoffTime: 'garbage' },
        { requestTime: '2026-03-10T07:00:00Z' },
      ],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.reasonCode).toBe('ORPHAN_OUT_OF_WINDOW');
    expect(r.nearestTripDiffMinutes).toBe(300);
  });
});
