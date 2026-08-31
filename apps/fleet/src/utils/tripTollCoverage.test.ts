import { describe, expect, it } from 'vitest';
import { resolveTripTollCoverage } from './tripTollCoverage';

describe('resolveTripTollCoverage', () => {
  it('marks imports without route as not applicable', () => {
    const c = resolveTripTollCoverage({ route: [], isLiveRecorded: false });
    expect(c.status).toBe('not_applicable');
    expect(c.label).toMatch(/no GPS route/i);
  });

  it('uses stamped detection result when present', () => {
    const c = resolveTripTollCoverage({
      route: [
        { lat: 18, lng: -77 },
        { lat: 18.01, lng: -77.01 },
      ],
      tollDetection: { status: 'detected', crossingCount: 2 },
    });
    expect(c.status).toBe('detected');
    expect(c.crossingCount).toBe(2);
  });
});
