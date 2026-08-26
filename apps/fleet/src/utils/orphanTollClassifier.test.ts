import { describe, it, expect } from 'vitest';
import { classifyOrphanToll, type OrphanCandidateTrip } from './orphanTollClassifier';

/** Smoke: fleet shim re-exports @roam/toll-core (full suite in packages/toll-core). */
const tripAt = (iso: string): OrphanCandidateTrip => ({ dropoffTime: iso });

describe('orphanTollClassifier re-export', () => {
  it('classifies no-trip orphans as high confidence', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [],
      orphanProximityMinutes: 180,
    });
    expect(r.reasonCode).toBe('ORPHAN_NO_TRIP');
    expect(r.confidence).toBe('high');
  });

  it('classifies nearby unexplained as low confidence (not auto personal)', () => {
    const r = classifyOrphanToll({
      txDate: new Date('2026-03-10T12:00:00Z'),
      candidateTrips: [tripAt('2026-03-10T11:00:00Z')],
      orphanProximityMinutes: 180,
    });
    expect(r.reasonCode).toBe('ORPHAN_NEARBY_UNEXPLAINED');
    expect(r.confidence).toBe('low');
  });
});
