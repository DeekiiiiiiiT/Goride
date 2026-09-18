import { describe, expect, it } from 'vitest';
import { pathForPageId, resolvePageFromPathname } from './pageRegistry';

describe('Fuel Integrity page registry', () => {
  it('resolves /fuel-integrity and legacy /fuel-flags to fuel-integrity', () => {
    expect(resolvePageFromPathname('/fuel-integrity')).toBe('fuel-integrity');
    expect(resolvePageFromPathname('/fuel-flags')).toBe('fuel-integrity');
  });

  it('navigates legacy fuel-flags id to canonical integrity path', () => {
    expect(pathForPageId('fuel-integrity')).toBe('/fuel-integrity');
    expect(pathForPageId('fuel-flags')).toBe('/fuel-integrity');
  });
});
