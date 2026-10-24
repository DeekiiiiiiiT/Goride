import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPENSE_HUB_PERMISSIONS,
  getPermissions,
  hasPermission,
  PAGE_PERMISSION_MAP,
  ROLE_PERMISSIONS,
} from './permissions';

const REPO = resolve(__dirname, '../../..');

describe('expense permission catalog', () => {
  it('gives the owner and manager every Expense Hub permission', () => {
    for (const permission of EXPENSE_HUB_PERMISSIONS) {
      expect(hasPermission('fleet_owner', permission)).toBe(true);
      expect(hasPermission('fleet_manager', permission)).toBe(true);
      expect(hasPermission('platform_owner', permission)).toBe(true);
    }
  });

  it('gives the accountant view and export only', () => {
    expect(hasPermission('fleet_accountant', 'expenses.view')).toBe(true);
    expect(hasPermission('fleet_accountant', 'expenses.export')).toBe(true);
    expect(hasPermission('fleet_accountant', 'expenses.create')).toBe(false);
    expect(hasPermission('fleet_accountant', 'expenses.approve')).toBe(false);
    expect(hasPermission('fleet_accountant', 'expenses.pay')).toBe(false);
    expect(hasPermission('fleet_viewer', 'expenses.view')).toBe(false);
  });

  it('keeps the owner on every customer permission the manager has', () => {
    const owner = new Set(getPermissions('fleet_owner'));
    for (const permission of getPermissions('fleet_manager')) {
      expect(owner.has(permission)).toBe(true);
    }
  });

  it('gives Roam product-admin roles no fleet permissions', () => {
    for (const role of ['fleet_admin', 'fleet_ops', 'enterprise_admin', 'enterprise_ops'] as const) {
      expect(getPermissions(role)).toEqual([]);
    }
  });

  it('gates the Expense Hub page on expenses.view', () => {
    expect(PAGE_PERMISSION_MAP['expense-hub']).toBe('expenses.view');
  });

  it('makes the server import this catalog instead of keeping a second list', () => {
    const server = readFileSync(
      resolve(REPO, 'supabase/functions/_fleet-server/rbac_middleware.ts'),
      'utf8',
    );
    expect(server).toContain('packages/auth-client/src/permissions.ts');
    expect(server).not.toContain('const ALL_CUSTOMER_PERMISSIONS');
    expect(server).not.toContain('const ROLE_PERMISSIONS');
  });

  it('only lets screens ask for permissions that exist in the catalog', () => {
    const granted = new Set<string>();
    for (const list of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of list) granted.add(permission);
    }
    const missing: string[] = [];
    for (const file of walk(resolve(REPO, 'apps/fleet/src'))) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\bcan(?:Any|All)?\(\s*['"]([a-z0-9_.]+)['"]/g)) {
        if (!granted.has(match[1])) missing.push(`${match[1]} in ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
