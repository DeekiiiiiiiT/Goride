import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dominionCan } from '@roam/auth-client/dominionPermissions';
import { legendForVariant } from '@roam/geo-ui';
import { canPublishMaps } from './mapPermissions';

const ROLES = ['platform_owner', 'superadmin', 'platform_support', 'platform_analyst', 'staff', ''];

describe('map publish permission', () => {
  it('T9 matches dominionCan for every listed role', () => {
    for (const role of ROLES) {
      const user = { app_metadata: { role } };
      expect(canPublishMaps(user)).toBe(dominionCan(role, 'maps.publish'));
    }
    expect(canPublishMaps(null)).toBe(false);
  });
});

describe('master map legend', () => {
  it('T8 keeps delivery words off the master legend and on the Rush legend', () => {
    const master = legendForVariant('master').join(' ').toLowerCase();
    expect(master).not.toContain('delivery');
    expect(master).not.toContain('cutout');
    const rush = legendForVariant('delivery').join(' ');
    expect(rush).toContain('Active town delivery');
    expect(rush).toContain('No-delivery cutout');
  });
});

describe('world map copy', () => {
  it('T11 has no REGION, LOC: or PARTITION labels', () => {
    const root = join(import.meta.dirname, '.');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('.test.ts')) files.push(path);
      }
    };
    walk(root);
    const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toContain('REGION');
    expect(source).not.toContain('LOC:');
    expect(source).not.toContain('PARTITION');
  });
});
