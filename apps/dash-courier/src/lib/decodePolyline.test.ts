import { describe, expect, it } from 'vitest';
import { decodeEncodedPolyline } from './decodePolyline';

describe('decodeEncodedPolyline', () => {
  it('decodes a short known polyline segment', () => {
    const points = decodeEncodedPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points.length).toBeGreaterThan(1);
    expect(points[0].lat).toBeCloseTo(38.5, 0);
    expect(points[0].lng).toBeCloseTo(-120.2, 0);
  });
});
