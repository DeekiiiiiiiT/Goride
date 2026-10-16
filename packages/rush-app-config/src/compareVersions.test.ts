import { describe, expect, it } from 'vitest';
import { compareVersions } from './compareVersions';

describe('compareVersions', () => {
  it('orders semver correctly', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.0.9', '0.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
  });
});
