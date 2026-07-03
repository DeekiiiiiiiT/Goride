import { describe, it, expect } from 'vitest';
import { classifyOrphanToll, OrphanCandidateTrip } from './orphanTollClassifier';

/**
 * Vitest suite for the pure orphan (personal-use) toll classifier.
 *
 * Unlike the legacy tollReconciliation.test.ts (a hand-run console runner that
 * vite.config.ts excludes), this is a real Vitest suite picked up by `npm test`.
 *
 * Same-day comparison is UTC-calendar based, so all fixtures use Z-suffixed ISO
 * strings for determinism.
 */

const PROXIMITY = 180;

/** Build a candidate trip whose dropoff anchor is the given ISO instant. */
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
      candidateTrips: [tripAt('2026-03-09T12:00:00Z')], // 24h earlier, prior day
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
      candidateTrips: [tripAt('2026-03-10T08:00:00Z')], // 240 min away, same day
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.reasonCode).toBe('ORPHAN_OUT_OF_WINDOW');
    expect(r.nearestTripDiffMinutes).toBe(240);
  });

  it('is NOT an orphan when a same-day trip is within proximity', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-10T11:00:00Z')], // 60 min away
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(false);
    expect(r.confidence).toBe('low');
    expect(r.nearestTripDiffMinutes).toBe(60);
  });

  it('treats the exact proximity boundary as NOT an orphan (strictly greater)', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-10T09:00:00Z')], // exactly 180 min away
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(false);
    expect(r.nearestTripDiffMinutes).toBe(180);
  });

  it('picks the NEAREST trip when several exist on the same day', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [
        tripAt('2026-03-10T06:00:00Z'), // 360 min
        tripAt('2026-03-10T11:30:00Z'), // 30 min — nearest, within proximity
      ],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(false); // nearest is within window → ambiguous, not orphan
    expect(r.nearestTripDiffMinutes).toBe(30);
  });

  it('stays conservative (not orphan) when the toll timestamp is unparseable', () => {
    const r = classifyOrphanToll({
      txDate: new Date('not-a-date'),
      candidateTrips: [tripAt('2026-03-10T08:00:00Z')],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(false);
    expect(r.nearestTripDiffMinutes).toBeNull();
  });

  it('ignores unparseable trip anchors but still uses valid ones', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [
        { dropoffTime: 'garbage' },
        { requestTime: '2026-03-10T07:00:00Z' }, // 300 min, same day
      ],
      orphanProximityMinutes: PROXIMITY,
    });
    expect(r.isOrphan).toBe(true);
    expect(r.confidence).toBe('medium');
    expect(r.reasonCode).toBe('ORPHAN_OUT_OF_WINDOW');
    expect(r.nearestTripDiffMinutes).toBe(300);
  });
});
