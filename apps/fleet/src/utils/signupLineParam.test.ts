import { describe, expect, it } from 'vitest';
import {
  initialServiceLinesFromSignupLine,
  parseSignupLineParam,
} from './signupLineParam';

describe('signupLineParam', () => {
  it('parses rush_delivery', () => {
    expect(parseSignupLineParam('rush_delivery')).toBe('rush_delivery');
    expect(initialServiceLinesFromSignupLine('rush_delivery')).toEqual(['rush_delivery']);
  });

  it('parses rideshare', () => {
    expect(parseSignupLineParam('rideshare')).toBe('rideshare');
    expect(initialServiceLinesFromSignupLine('rideshare')).toEqual(['rideshare']);
  });

  it('ignores invalid params', () => {
    expect(parseSignupLineParam('foo')).toBeUndefined();
    expect(initialServiceLinesFromSignupLine(undefined)).toEqual(['rideshare']);
  });
});
