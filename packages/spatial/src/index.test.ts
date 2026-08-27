import { describe, expect, it } from 'vitest';
import {
  DEFAULT_H3_RESOLUTION,
  getWaveKRings,
  kRingForRadiusKm,
  kRingForRadiusKmWithMargin,
  latLngToH3,
  polygonToH3Cells,
} from './index';

describe('@roam/spatial', () => {
  it('stamps Kingston to a stable res-7 cell', () => {
    const cell = latLngToH3(17.9714, -76.7932, DEFAULT_H3_RESOLUTION);
    expect(cell).toMatch(/^87/);
    expect(cell.length).toBeGreaterThan(10);
  });

  it('derives k from radius using edge × √3 (not edge alone)', () => {
    // res 7: edge 1.22 → spacing ~2.11 → 5km → k=3 (ceil), +1 margin → 4
    expect(kRingForRadiusKm(5, 7)).toBe(3);
    expect(kRingForRadiusKmWithMargin(5, 7)).toBe(4);
    expect(kRingForRadiusKm(15, 7)).toBe(8);
    expect(kRingForRadiusKm(35, 7)).toBe(17);
  });

  it('getWaveKRings prefers derived when override missing', () => {
    const rings = getWaveKRings([5, 15, 35], null, 7);
    expect(rings).toEqual([4, 9, 18]);
  });

  it('polygonToH3Cells returns cells for a small Kingston square', () => {
    const poly = [
      { lat: 17.97, lng: -76.8 },
      { lat: 17.97, lng: -76.79 },
      { lat: 17.98, lng: -76.79 },
      { lat: 17.98, lng: -76.8 },
    ];
    const cells = polygonToH3Cells(poly, 7, 'include');
    expect(cells.length).toBeGreaterThan(0);
  });
});
