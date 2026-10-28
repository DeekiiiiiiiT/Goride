import { describe, expect, it } from 'vitest';
import {
  activityServiceLinesForPlatform,
  isUnsupportedActivityPlatform,
} from './driverActivityModel';

describe('driverActivityModel', () => {
  it('flags InDrive as unsupported; Uber is supported via timeline import', () => {
    expect(isUnsupportedActivityPlatform('Uber')).toBe(false);
    expect(isUnsupportedActivityPlatform('InDrive')).toBe(true);
    expect(isUnsupportedActivityPlatform('roam')).toBe(false);
  });

  it('maps Uber platform filter to uber service line', () => {
    expect(activityServiceLinesForPlatform('Uber')).toBe('uber');
    expect(activityServiceLinesForPlatform(null)).toContain('uber');
    expect(activityServiceLinesForPlatform(null)).toContain('roam_rides');
  });
});
