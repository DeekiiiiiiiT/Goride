import { describe, expect, it } from 'vitest';
import { groupRingsForOutline, shapeIntersectsView } from './overviewViewport';

const view = { south: 18.0, north: 18.2, west: -76.9, east: -76.7 };

describe('shapeIntersectsView', () => {
  it('keeps a town whose center is on screen', () => {
    expect(shapeIntersectsView([], { lat: 18.1, lng: -76.8 }, view)).toBe(true);
  });

  it('drops a town sitting off the island view', () => {
    expect(
      shapeIntersectsView(
        [{ polygon: [{ lat: 18.4, lng: -77.9 }, { lat: 18.5, lng: -77.8 }, { lat: 18.45, lng: -77.7 }] }],
        { lat: 18.45, lng: -77.85 },
        view,
      ),
    ).toBe(false);
  });

  it('keeps a town whose border crosses the view even if the pin is outside', () => {
    expect(
      shapeIntersectsView(
        [{ polygon: [{ lat: 17.9, lng: -76.85 }, { lat: 18.3, lng: -76.85 }, { lat: 18.1, lng: -76.6 }] }],
        { lat: 17.5, lng: -77.5 },
        view,
      ),
    ).toBe(true);
  });
});

const tri = (lat: number, lng: number) => [
  { lat, lng },
  { lat: lat + 0.1, lng },
  { lat, lng: lng + 0.1 },
];

describe('groupRingsForOutline', () => {
  it('keeps a hole on its outer ring', () => {
    const grouped = groupRingsForOutline([
      { kind: 'include', polygon: tri(18, -77) },
      { kind: 'exclude', polygon: tri(18.02, -76.98) },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toHaveLength(2);
  });

  it('starts a new outline for each outer ring', () => {
    const grouped = groupRingsForOutline([
      { kind: 'include', polygon: tri(18, -77) },
      { kind: 'include', polygon: tri(18.2, -76.5) },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toHaveLength(1);
    expect(grouped[1]).toHaveLength(1);
  });

  it('drops a hole that has no outer ring', () => {
    expect(groupRingsForOutline([{ kind: 'exclude', polygon: tri(18, -77) }])).toEqual([]);
  });
});
