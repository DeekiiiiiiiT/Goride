import { describe, expect, it } from 'vitest';
import {
  createZoneCache,
  DELIVERY_ZONES_CACHE_KEY,
  DELIVERY_ZONES_CACHE_TTL_MS,
  evaluateCoverage,
  isInsideParishFoundation,
  parseAllZonesPayload,
  pointInPolygon,
  sanitizeVertices,
  type ActiveCoverageZone,
  type CoverageZone,
} from './index';

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

describe('parseAllZonesPayload', () => {
  it('parses zones array with market_id and source', () => {
    const zones = parseAllZonesPayload({
      zones: [
        {
          id: 'z1',
          name: 'Parish',
          kind: 'include',
          market_id: 'm1',
          source: 'parish_boundary',
          polygon: ST_INCLUDE.polygon,
        },
      ],
    });
    expect(zones).toHaveLength(1);
    expect(zones[0].market_id).toBe('m1');
    expect(zones[0].source).toBe('parish_boundary');
  });

  it('skips inactive zones', () => {
    const zones = parseAllZonesPayload({
      zones: [{ is_active: false, kind: 'include', polygon: ST_INCLUDE.polygon }],
    });
    expect(zones).toHaveLength(0);
  });
});

describe('sanitizeVertices', () => {
  it('keeps valid lat/lng only', () => {
    expect(sanitizeVertices([{ lat: 18, lng: -77 }, { lat: NaN, lng: 1 }, null])).toEqual([
      { lat: 18, lng: -77 },
    ]);
  });
});

describe('createZoneCache', () => {
  it('reads and writes cache entries', () => {
    const storage = new Map<string, string>();
    const cache = createZoneCache({
      storage: {
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => {
          storage.set(k, v);
        },
      },
      key: DELIVERY_ZONES_CACHE_KEY,
      ttlMs: DELIVERY_ZONES_CACHE_TTL_MS,
    });
    const sample: ActiveCoverageZone[] = [{ kind: 'include', polygon: ST_INCLUDE.polygon }];
    cache.write(sample);
    expect(cache.read()?.length).toBe(1);
  });
});

describe('isInsideParishFoundation', () => {
  it('allows any point when foundation missing', () => {
    expect(isInsideParishFoundation(18.0, -76.8, null)).toBe(true);
  });
});
