import { describe, expect, it } from 'vitest';
import { shapeIntersectsView } from './overviewViewport';

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
