import { describe, expect, it } from 'vitest';
import { nextClientSeq } from './locationSeq';
import { buildNavigationUrl } from './navigationUrls';

describe('nextClientSeq', () => {
  it('starts at 1 from invalid current', () => {
    expect(nextClientSeq(0)).toBe(1);
    expect(nextClientSeq(NaN)).toBe(1);
  });

  it('increments', () => {
    expect(nextClientSeq(1)).toBe(2);
    expect(nextClientSeq(41)).toBe(42);
  });
});

describe('buildNavigationUrl', () => {
  it('builds google maps dir with coords', () => {
    const url = buildNavigationUrl('google', { lat: 18.01, lng: -76.8 });
    expect(url).toContain('google.com/maps');
    expect(url).toContain('18.01');
  });

  it('builds waze navigate link', () => {
    const url = buildNavigationUrl('waze', { lat: 18.01, lng: -76.8 });
    expect(url).toContain('waze.com');
    expect(url).toContain('navigate=yes');
  });
});
