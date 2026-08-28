import { describe, expect, it } from 'vitest';
import {
  createZoneCache,
  DELIVERY_ZONES_CACHE_KEY,
  DELIVERY_ZONES_CACHE_TTL_MS,
  draftZonesDifferFromPublished,
  evaluateCoverage,
  isInsideParishFoundation,
  MAX_EDITABLE_VERTICES,
  normalizeDraftZonesFromAdmin,
  parseAllZonesPayload,
  parseFoundationGeometry,
  pointInMultiPolygon,
  pointInPolygon,
  sanitizeMultiPolygon,
  sanitizeRing,
  sanitizeVertices,
  zonesToMapPolygons,
  type ActiveCoverageZone,
  type CoverageMultiPolygon,
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
  priority: 10,
  polygon: [
    { lat: 18.01, lng: -76.97 },
    { lat: 18.01, lng: -76.96 },
    { lat: 18.02, lng: -76.96 },
    { lat: 18.02, lng: -76.97 },
  ],
};

/** Two islands: west square + east square (simulates Kingston-style MultiPolygon). */
const MULTI_ISLAND: CoverageMultiPolygon = [
  {
    outer: [
      { lat: 18.0, lng: -77.1 },
      { lat: 18.0, lng: -77.0 },
      { lat: 18.1, lng: -77.0 },
      { lat: 18.1, lng: -77.1 },
    ],
    holes: [],
  },
  {
    outer: [
      { lat: 18.0, lng: -76.9 },
      { lat: 18.0, lng: -76.8 },
      { lat: 18.1, lng: -76.8 },
      { lat: 18.1, lng: -76.9 },
    ],
    holes: [],
  },
];

/** Outer with a rectangular hole in the middle. */
const WITH_HOLE: CoverageMultiPolygon = [
  {
    outer: [
      { lat: 18.0, lng: -77.0 },
      { lat: 18.0, lng: -76.9 },
      { lat: 18.1, lng: -76.9 },
      { lat: 18.1, lng: -77.0 },
    ],
    holes: [
      [
        { lat: 18.04, lng: -76.97 },
        { lat: 18.04, lng: -76.93 },
        { lat: 18.06, lng: -76.93 },
        { lat: 18.06, lng: -76.97 },
      ],
    ],
  },
];

describe('pointInPolygon', () => {
  it('detects interior and exterior', () => {
    expect(pointInPolygon(18.015, -76.955, ST_INCLUDE.polygon)).toBe(true);
    expect(pointInPolygon(18.0, -76.8, ST_INCLUDE.polygon)).toBe(false);
  });
});

describe('pointInMultiPolygon', () => {
  it('hits any outer part', () => {
    expect(pointInMultiPolygon(18.05, -77.05, MULTI_ISLAND)).toBe(true);
    expect(pointInMultiPolygon(18.05, -76.85, MULTI_ISLAND)).toBe(true);
    expect(pointInMultiPolygon(18.05, -76.95, MULTI_ISLAND)).toBe(false);
  });

  it('excludes points inside holes', () => {
    expect(pointInMultiPolygon(18.05, -76.95, WITH_HOLE)).toBe(false);
    expect(pointInMultiPolygon(18.02, -76.95, WITH_HOLE)).toBe(true);
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

  it('uses multiPolygon when present (second part)', () => {
    const zone: CoverageZone = {
      id: 'z-multi',
      name: 'Islands',
      market_id: ST_MARKET,
      kind: 'include',
      polygon: MULTI_ISLAND[0].outer,
      multiPolygon: MULTI_ISLAND,
    };
    expect(evaluateCoverage(18.05, -76.85, [zone]).inZone).toBe(true);
    expect(evaluateCoverage(18.05, -76.95, [zone]).inZone).toBe(false);
  });

  it('treats hole as outside include multiPolygon', () => {
    const zone: CoverageZone = {
      id: 'z-hole',
      name: 'Donut',
      kind: 'include',
      polygon: WITH_HOLE[0].outer,
      multiPolygon: WITH_HOLE,
    };
    expect(evaluateCoverage(18.05, -76.95, [zone]).inZone).toBe(false);
    expect(evaluateCoverage(18.02, -76.95, [zone]).inZone).toBe(true);
  });

  it('safe island: higher-priority include wins over exclude', () => {
    const island: CoverageZone = {
      ...ST_INCLUDE,
      id: 'z-island',
      name: 'Hospital',
      priority: 30,
      polygon: CUTOUT.polygon,
    };
    const r = evaluateCoverage(18.015, -76.965, [ST_INCLUDE, CUTOUT, island]);
    expect(r.inZone).toBe(true);
    expect(r.matchedInclude?.name).toBe('Hospital');
  });

  it('ignores expired exclusions', () => {
    const expired: CoverageZone = {
      ...CUTOUT,
      effective_to: '2020-01-01T00:00:00.000Z',
    };
    const r = evaluateCoverage(18.015, -76.965, [ST_INCLUDE, expired], new Date('2026-01-01'));
    expect(r.inZone).toBe(true);
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

describe('sanitizeRing', () => {
  it('drops closing duplicate and caps at MAX_EDITABLE_VERTICES by default', () => {
    const closed = [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 1, lng: 1 },
    ];
    expect(sanitizeRing(closed)).toEqual([
      { lat: 1, lng: 1 },
      { lat: 1, lng: 2 },
      { lat: 2, lng: 2 },
    ]);
    expect(MAX_EDITABLE_VERTICES).toBe(500);
    const many = Array.from({ length: 600 }, (_, i) => ({ lat: i * 0.001, lng: 0 }));
    expect(sanitizeRing(many)).toHaveLength(500);
  });
});

describe('sanitizeMultiPolygon', () => {
  it('accepts legacy flat ring', () => {
    const multi = sanitizeMultiPolygon(ST_INCLUDE.polygon);
    expect(multi).toHaveLength(1);
    expect(multi[0].holes).toEqual([]);
    expect(multi[0].outer).toHaveLength(4);
  });

  it('accepts GeoJSON MultiPolygon with holes', () => {
    const multi = sanitizeMultiPolygon({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [-77.0, 18.0],
            [-76.9, 18.0],
            [-76.9, 18.1],
            [-77.0, 18.1],
            [-77.0, 18.0],
          ],
          [
            [-76.97, 18.04],
            [-76.93, 18.04],
            [-76.93, 18.06],
            [-76.97, 18.06],
            [-76.97, 18.04],
          ],
        ],
        [
          [
            [-76.8, 18.0],
            [-76.7, 18.0],
            [-76.7, 18.1],
            [-76.8, 18.1],
            [-76.8, 18.0],
          ],
        ],
      ],
    });
    expect(multi).toHaveLength(2);
    expect(multi[0].holes).toHaveLength(1);
    expect(multi[1].holes).toEqual([]);
  });

  it('rejects empty parts', () => {
    expect(sanitizeMultiPolygon({ parts: [{ outer: [{ lat: 1, lng: 1 }], holes: [] }] })).toEqual([]);
  });

  it('accepts parts wrapper', () => {
    const multi = sanitizeMultiPolygon({ parts: MULTI_ISLAND });
    expect(multi).toHaveLength(2);
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

  it('accepts multi-part foundation with holes', () => {
    expect(isInsideParishFoundation(18.05, -76.85, MULTI_ISLAND)).toBe(true);
    expect(isInsideParishFoundation(18.05, -76.95, WITH_HOLE)).toBe(false);
  });
});

describe('parseFoundationGeometry', () => {
  it('parses multi-part shape', () => {
    const g = parseFoundationGeometry({ parts: MULTI_ISLAND });
    expect(g).toHaveLength(2);
  });
});

describe('normalizeDraftZonesFromAdmin', () => {
  it('maps draft rows to ActiveCoverageZone', () => {
    const zones = normalizeDraftZonesFromAdmin(
      [{ id: 'z1', name: 'ST', kind: 'include', polygon: ST_INCLUDE.polygon, market_id: ST_MARKET }],
      ST_MARKET,
    );
    expect(zones).toHaveLength(1);
    expect(zones[0].kind).toBe('include');
    expect(zones[0].market_id).toBe(ST_MARKET);
  });

  it('skips invalid polygons', () => {
    expect(normalizeDraftZonesFromAdmin([{ id: 'z1', kind: 'include', polygon: [{ lat: 1, lng: 2 }] }])).toHaveLength(0);
  });
});

describe('zonesToMapPolygons', () => {
  it('filters by kind and market', () => {
    const zones: ActiveCoverageZone[] = [
      { id: 'a', kind: 'include', polygon: ST_INCLUDE.polygon, market_id: ST_MARKET },
      { id: 'b', kind: 'exclude', polygon: CUTOUT.polygon, market_id: ST_MARKET },
    ];
    expect(zonesToMapPolygons(zones, { kind: 'include', marketId: ST_MARKET })).toHaveLength(1);
  });
});

describe('draftZonesDifferFromPublished', () => {
  it('detects polygon mismatch', () => {
    const draft: ActiveCoverageZone[] = [
      { kind: 'include', polygon: ST_INCLUDE.polygon, market_id: ST_MARKET },
    ];
    const published: ActiveCoverageZone[] = [
      { kind: 'include', polygon: [{ lat: 18.1, lng: -76.95 }, { lat: 18.1, lng: -76.94 }, { lat: 18.11, lng: -76.94 }], market_id: ST_MARKET },
    ];
    expect(draftZonesDifferFromPublished(draft, published, ST_MARKET)).toBe(true);
  });

  it('returns false when includes match', () => {
    const zones: ActiveCoverageZone[] = [
      { kind: 'include', polygon: ST_INCLUDE.polygon, market_id: ST_MARKET },
    ];
    expect(draftZonesDifferFromPublished(zones, zones, ST_MARKET)).toBe(false);
  });
});
