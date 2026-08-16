import { describe, expect, it } from 'vitest';
import {
  KINGSTON_DELIVERY_POLYGON,
  __setActiveZonesForTests,
  checkDeliveryZone,
  evaluateActiveCoverage,
  pointInPolygon,
} from './deliveryZones';

describe('pointInPolygon / Kingston delivery zone', () => {
  it('treats New Kingston roughly in-polygon', () => {
    expect(pointInPolygon(18.01, -76.78, KINGSTON_DELIVERY_POLYGON)).toBe(true);
  });

  it('treats Half Way Tree area in-polygon', () => {
    expect(pointInPolygon(18.012, -76.799, KINGSTON_DELIVERY_POLYGON)).toBe(true);
  });

  it('rejects Montego Bay coords', () => {
    expect(pointInPolygon(18.476, -77.893, KINGSTON_DELIVERY_POLYGON)).toBe(false);
  });

  it('rejects a point inside the old bbox corner but outside the polygon', () => {
    // Near NE corner of bbox (~18.12, -76.68) sits outside the tapered polygon.
    expect(pointInPolygon(18.115, -76.685, KINGSTON_DELIVERY_POLYGON)).toBe(false);
  });

  it('checkDeliveryZone uses polygon when lat/lng provided', () => {
    __setActiveZonesForTests([{ kind: 'include', polygon: KINGSTON_DELIVERY_POLYGON }]);
    expect(checkDeliveryZone({ line1: 'Anywhere', lat: 18.01, lng: -76.78 }).inZone).toBe(true);
    expect(checkDeliveryZone({ line1: 'Anywhere', lat: 18.476, lng: -77.893 }).inZone).toBe(
      false,
    );
  });

  it('exclude wins over include', () => {
    __setActiveZonesForTests([
      { kind: 'include', name: 'Kingston', polygon: KINGSTON_DELIVERY_POLYGON },
      {
        kind: 'exclude',
        name: 'Hole',
        polygon: [
          { lat: 18.02, lng: -76.79 },
          { lat: 18.02, lng: -76.77 },
          { lat: 18.0, lng: -76.77 },
          { lat: 18.0, lng: -76.79 },
        ],
      },
    ]);
    expect(evaluateActiveCoverage(18.01, -76.78).inZone).toBe(false);
    expect(evaluateActiveCoverage(18.05, -76.85).inZone).toBe(true);
  });

  it('falls back to keywords when coords missing', () => {
    expect(checkDeliveryZone({ line1: '12 Hope Rd, Kingston' }).inZone).toBe(true);
    expect(checkDeliveryZone({ line1: 'Montego Bay, Jamaica' }).inZone).toBe(false);
  });
});
