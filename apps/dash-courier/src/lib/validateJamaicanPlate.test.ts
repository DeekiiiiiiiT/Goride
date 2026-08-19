import { describe, expect, it } from 'vitest';
import { validateJamaicanPlate } from './validateJamaicanPlate';

describe('validateJamaicanPlate', () => {
  it('accepts standard plates', () => {
    expect(validateJamaicanPlate('ABC1234')).toBe(true);
    expect(validateJamaicanPlate('a1')).toBe(true);
  });

  it('accepts N/A for bicycle', () => {
    expect(validateJamaicanPlate('N/A')).toBe(true);
  });

  it('rejects invalid plates', () => {
    expect(validateJamaicanPlate('123ABC')).toBe(false);
    expect(validateJamaicanPlate('')).toBe(false);
  });
});
