import { describe, expect, it } from 'vitest';
import { shapeRequests, shapeUrl } from './jamaicaMapFormat';

const box: [number, number, number, number] = [-78.5, 17.6, -76.1, 18.6];

describe('jamaica map shape requests', () => {
  it('T1 country view asks for parishes only', () => {
    const requests = shapeRequests(8, null, { parishes: true, towns: true, communities: true });
    expect(requests.map((row) => row.levels)).toEqual(['1']);
    expect(shapeUrl(requests[0])).toContain('levels=1');
    expect(shapeUrl(requests[0])).not.toContain('levels=3');
  });

  it('T2 communities wait until zoom 12', () => {
    const mid = shapeRequests(11, box, { parishes: true, towns: true, communities: true });
    expect(mid.map((row) => row.levels)).toEqual(['1', '2']);
    expect(mid.some((row) => row.levels === '3')).toBe(false);
    const close = shapeRequests(12, box, { parishes: true, towns: true, communities: true });
    expect(close.map((row) => row.levels)).toContain('3');
    expect(close.find((row) => row.levels === '3')?.bbox).toBe(box.join(','));
  });
});
