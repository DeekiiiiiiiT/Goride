import { describe, expect, it } from 'vitest';
import { storeShareUrl } from './shareStore';

describe('storeShareUrl', () => {
  it('points at the merchant query the app already opens', () => {
    expect(storeShareUrl('island-grill', 'http://localhost:5174')).toBe(
      'http://localhost:5174/?merchant=island-grill',
    );
  });

  it('strips a trailing slash on the origin', () => {
    expect(storeShareUrl('abc', 'https://roamrush.app/')).toBe(
      'https://roamrush.app/?merchant=abc',
    );
  });
});
