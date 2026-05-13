/**
 * RBAC Permission System — Roam Admin Portal
 * Simplified version for the admin app with platform-level roles only.
 */

export type Role =
  | 'platform_owner'
  | 'platform_support'
  | 'platform_analyst';

export type LegacyRole = 'superadmin' | 'admin';

export type AnyRole = Role | LegacyRole;

export type RoleTier = 'platform';

export interface RoleMeta {
  level: number;
  label: string;
  description: string;
  tier: RoleTier;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  platform_owner: {
    level: 1000,
    label: 'Platform Owner',
    description: 'Full platform sovereignty — unrestricted access to everything.',
    tier: 'platform',
  },
  platform_support: {
    level: 700,
    label: 'Platform Support',
    description: 'View customer accounts, stations, tolls. Cannot change platform settings.',
    tier: 'platform',
  },
  platform_analyst: {
    level: 500,
    label: 'Platform Analyst',
    description: 'Read-only analytics across all customers.',
    tier: 'platform',
  },
};

const VALID_ROLES = new Set<string>(Object.keys(ROLE_META));

export function resolveRole(raw: string | null | undefined): Role | null {
  if (!raw) return null;

  switch (raw) {
    case 'superadmin': return 'platform_owner';
    case 'admin': return null; // Not a platform role
  }

  if (VALID_ROLES.has(raw)) return raw as Role;

  return null;
}

export function isPlatformRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const resolved = resolveRole(role);
  return resolved !== null;
}

export function getRoleLevel(role: Role): number {
  return ROLE_META[role]?.level ?? 0;
}
