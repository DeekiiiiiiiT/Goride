import { describe, expect, it } from 'vitest';
import { evaluateCoverage, pointInPolygon, type CoverageZone } from './index';

const ST_MARKET = 'market-spanish-town';

const ST_INCLUDE: CoverageZone = {
  id: 'z-st',
  name: 'Spanish Town',
  market_id: ST_MARKET,
  kind: 'include',
  polygon: [
    { lat: 17.99, lng: -77.0 },
    { lat: 17.99, lng: -76.9 },
    { lat: 18.05, lng: -76.9 },
    { lat: 18.05, lng: -77.0 },
  ],
};

const CUTOUT: CoverageZone = {
  id: 'z-cut',
  name: 'Barracks',
  market_id: ST_MARKET,
  kind: 'exclude',
  polygon: [
    { lat: 18.01, lng: -76.97 },
    { lat: 18.01, lng: -76.96 },
    { lat: 18.02, lng: -76.96 },
    { lat: 18.02, lng: -76.97 },
  ],
};

describe('pointInPolygon', () => {
  it('detects interior and exterior', () => {
    expect(pointInPolygon(18.015, -76.955, ST_INCLUDE.polygon)).toBe(true);
    expect(pointInPolygon(18.0, -76.8, ST_INCLUDE.polygon)).toBe(false);
  });
});

describe('evaluateCoverage', () => {
  it('matches include market', () => {
    const r = evaluateCoverage(18.015, -76.955, [ST_INCLUDE]);
    expect(r.inZone).toBe(true);
    expect(r.matchedInclude?.market_id).toBe(ST_MARKET);
  });

  it('exclude wins over include', () => {
    const r = evaluateCoverage(18.015, -76.965, [ST_INCLUDE, CUTOUT]);
    expect(r.inZone).toBe(false);
    expect(r.matchedExclude?.name).toBe('Barracks');
  });

  it('outside all zones', () => {
    const r = evaluateCoverage(18.0, -76.8, [ST_INCLUDE]);
    expect(r.inZone).toBe(false);
    expect(r.matchedInclude).toBeNull();
  });
});
