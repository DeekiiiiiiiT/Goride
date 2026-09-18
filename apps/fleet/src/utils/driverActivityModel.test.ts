import { describe, expect, it } from 'vitest';
import { isUnsupportedActivityPlatform } from './driverActivityModel';

describe('driverActivityModel', () => {
  it('flags Uber/InDrive as unsupported', () => {
    expect(isUnsupportedActivityPlatform('Uber')).toBe(true);
    expect(isUnsupportedActivityPlatform('InDrive')).toBe(true);
    expect(isUnsupportedActivityPlatform('roam')).toBe(false);
  });
});
