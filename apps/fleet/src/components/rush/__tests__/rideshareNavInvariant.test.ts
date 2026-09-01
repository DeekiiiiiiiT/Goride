import { describe, it, expect } from 'vitest';
import { SIDEBAR_VISIBILITY } from '@roam/business-config';
import { PAGE_PERMISSION_MAP } from '../../../utils/permissions';

/** Rideshare-only orgs must keep core nav pages visible in the matrix. */
describe('rideshare nav invariant', () => {
  const rideshareCorePages = [
    'dashboard',
    'imports',
    'drivers',
    'vehicles',
    'trips',
    'fuel-management',
    'toll-management',
    'reports',
    'settings',
  ];

  it('includes rideshare on all core sidebar keys', () => {
    for (const page of rideshareCorePages) {
      const allowed = SIDEBAR_VISIBILITY[page];
      expect(allowed, page).toBeDefined();
      expect(allowed).toContain('rideshare');
    }
  });

  it('maps core page ids to permissions', () => {
    expect(PAGE_PERMISSION_MAP.dashboard).toBe('nav.dashboard');
    expect(PAGE_PERMISSION_MAP.imports).toBe('nav.imports');
    expect(PAGE_PERMISSION_MAP.drivers).toBe('nav.drivers');
  });
});
