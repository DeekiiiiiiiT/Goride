/**
 * RBAC Permission System — Roam Fleet
 *
 * Single source of truth for all roles, permissions, and access-control helpers.
 * This file is pure TypeScript — no React, no side-effects, no imports from
 * components or services.  It can be imported on both client and (in a copy)
 * server side.
 *
 * Created: Phase 1 of the RBAC rollout (see /solution.md).
 */

// ---------------------------------------------------------------------------
// 1. Roles
// ---------------------------------------------------------------------------

/**
 * Every role the system recognises.
 * Legacy values ('superadmin', 'admin') are kept so that existing Supabase
 * Auth user_metadata values still type-check; `resolveRole()` maps them to
 * their canonical equivalents at runtime.
 */
export type Role =
  // Platform-level (Super Admin side)
  | 'platform_owner'
  | 'platform_support'
  | 'platform_analyst'
  // Customer-level (Fleet Manager side)
  | 'fleet_owner'
  | 'fleet_manager'
  | 'fleet_accountant'
  | 'fleet_viewer'
  // Driver
  | 'driver';

/** Roles that have historically been stored in Supabase user_metadata. */
export type LegacyRole = 'superadmin' | 'admin' | 'manager' | 'viewer';

export type AnyRole = Role | LegacyRole;

// ---------------------------------------------------------------------------
// 2. Role metadata
// ---------------------------------------------------------------------------

export type RoleTier = 'platform' | 'customer' | 'driver';

export interface RoleMeta {
  level: number;
  label: string;
  description: string;
  tier: RoleTier;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  // Platform
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

  // Customer
  fleet_owner: {
    level: 900,
    label: 'Fleet Owner',
    description: 'Full access to the organisation — drivers, vehicles, finances, settings.',
    tier: 'customer',
  },
  fleet_manager: {
    level: 700,
    label: 'Fleet Manager',
    description: 'Manage drivers, vehicles, fuel, tolls, trips. Cannot change settings or invite users.',
    tier: 'customer',
  },
  fleet_accountant: {
    level: 500,
    label: 'Fleet Accountant',
    description: 'View-only access to financial data, fuel logs, reports, and transactions.',
    tier: 'customer',
  },
  fleet_viewer: {
    level: 300,
    label: 'Fleet Viewer',
    description: 'Dashboard view only.',
    tier: 'customer',
  },

  // Driver
  driver: {
    level: 100,
    label: 'Driver',
    description: 'Driver portal — earnings, expenses, trips, profile.',
    tier: 'driver',
  },
};

// ---------------------------------------------------------------------------
// 3. Permissions
// ---------------------------------------------------------------------------

/**
 * Every discrete permission in the app.
 * Naming convention:  <domain>.<action>
 *   - nav.*          → allowed to see a sidebar page
 *   - <entity>.*     → allowed to perform an action on that entity
 */
export type Permission =
  // Navigation / page access
  | 'nav.dashboard'
  | 'nav.imports'
  | 'nav.drivers'
  | 'nav.vehicles'
  | 'nav.maintenance'
  | 'nav.fleet'
  | 'nav.fuel_overview'
  | 'nav.fuel_review_queue'
  | 'nav.fuel_audit'
  | 'nav.fuel_integrity_gap'
  | 'nav.fuel_reconciliation'
  | 'nav.fuel_cards'
  | 'nav.fuel_logs'
  | 'nav.fuel_reports'
  | 'nav.fuel_configuration'
  | 'nav.toll_logs'
  | 'nav.toll_reconciliation'
  | 'nav.toll_tag_inventory'
  | 'nav.toll_claimable_loss'
  | 'nav.toll_analytics'
  | 'nav.trips'
  | 'nav.reports'
  | 'nav.financial_analytics'
  | 'nav.transaction_list'
  | 'nav.performance'
  | 'nav.tier_config'
  | 'nav.user_management'
  | 'nav.settings'
  | 'nav.ledger_backfill'
  | 'nav.database_management'
  // Drivers
  | 'drivers.create'
  | 'drivers.edit'
  | 'drivers.delete'
  | 'drivers.view'
  // Vehicles
  | 'vehicles.create'
  | 'vehicles.edit'
  | 'vehicles.delete'
  | 'vehicles.view'
  // Fuel
  | 'fuel.approve'
  | 'fuel.reject'
  | 'fuel.create_entry'
  | 'fuel.edit_entry'
  | 'fuel.delete_entry'
  | 'fuel.view'
  | 'fuel.export'
  // Toll
  | 'toll.manage'
  | 'toll.view'
  // Transactions
  | 'transactions.approve'
  | 'transactions.reject'
  | 'transactions.edit'
  | 'transactions.view'
  | 'transactions.export'
  // Reports
  | 'reports.generate'
  | 'reports.export'
  | 'reports.view'
  // Settings & Users
  | 'settings.edit'
  | 'users.invite'
  | 'users.edit_role'
  | 'users.remove'
  // Data
  | 'data.import'
  | 'data.export'
  | 'data.backfill';

// ---------------------------------------------------------------------------
// 4. Role → Permissions map
// ---------------------------------------------------------------------------

/** All customer-level permissions (fleet_owner gets all of these). */
const ALL_CUSTOMER_PERMISSIONS: Permission[] = [
  // Nav
  'nav.dashboard',
  'nav.imports',
  'nav.drivers',
  'nav.vehicles',
  'nav.maintenance',
  'nav.fleet',
  'nav.fuel_overview',
  'nav.fuel_review_queue',
  'nav.fuel_audit',
  'nav.fuel_integrity_gap',
  'nav.fuel_reconciliation',
  'nav.fuel_cards',
  'nav.fuel_logs',
  'nav.fuel_reports',
  'nav.fuel_configuration',
  'nav.toll_logs',
  'nav.toll_reconciliation',
  'nav.toll_tag_inventory',
  'nav.toll_claimable_loss',
  'nav.toll_analytics',
  'nav.trips',
  'nav.reports',
  'nav.financial_analytics',
  'nav.transaction_list',
  'nav.performance',
  'nav.tier_config',
  'nav.user_management',
  'nav.settings',
  'nav.ledger_backfill',
  'nav.database_management',
  // Actions
  'drivers.create', 'drivers.edit', 'drivers.delete', 'drivers.view',
  'vehicles.create', 'vehicles.edit', 'vehicles.delete', 'vehicles.view',
  'fuel.approve', 'fuel.reject', 'fuel.create_entry', 'fuel.edit_entry', 'fuel.delete_entry', 'fuel.view', 'fuel.export',
  'toll.manage', 'toll.view',
  'transactions.approve', 'transactions.reject', 'transactions.edit', 'transactions.view', 'transactions.export',
  'reports.generate', 'reports.export', 'reports.view',
  'settings.edit',
  'users.invite', 'users.edit_role', 'users.remove',
  'data.import', 'data.export', 'data.backfill',
];

const FLEET_MANAGER_PERMISSIONS: Permission[] = ALL_CUSTOMER_PERMISSIONS.filter(
  (p) =>
    // Remove settings, user management, ledger backfill, database management
    p !== 'nav.settings' &&
    p !== 'nav.user_management' &&
    p !== 'nav.ledger_backfill' &&
    p !== 'nav.database_management' &&
    p !== 'settings.edit' &&
    p !== 'users.invite' &&
    p !== 'users.edit_role' &&
    p !== 'users.remove' &&
    p !== 'data.backfill'
);

const FLEET_ACCOUNTANT_PERMISSIONS: Permission[] = [
  // Nav — limited set
  'nav.dashboard',
  'nav.fuel_logs',
  'nav.fuel_reports',
  'nav.fuel_reconciliation',
  'nav.financial_analytics',
  'nav.transaction_list',
  'nav.reports',
  // Actions — view & export only
  'drivers.view',
  'vehicles.view',
  'fuel.view',
  'fuel.export',
  'toll.view',
  'transactions.view',
  'transactions.export',
  'reports.view',
  'reports.export',
  'data.export',
];

const FLEET_VIEWER_PERMISSIONS: Permission[] = [
  'nav.dashboard',
  'reports.view',
];

/**
 * Master map:  Role  →  Permission[]
 *
 * Platform roles are not mapped here because they operate in the Admin Portal
 * which has its own, separate navigation.  Platform permissions will be added
 * in Phase 11 when we gate the Admin sidebar.
 *
 * The `driver` role is empty because drivers use a completely separate code
 * path (DriverLayout / DriverPortal) that never consults this map.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Platform (empty for now — Phase 11)
  platform_owner: ALL_CUSTOMER_PERMISSIONS,   // fallback: if they somehow view fleet side
  platform_support: [],
  platform_analyst: [],

  // Customer
  fleet_owner: ALL_CUSTOMER_PERMISSIONS,
  fleet_manager: FLEET_MANAGER_PERMISSIONS,
  fleet_accountant: FLEET_ACCOUNTANT_PERMISSIONS,
  fleet_viewer: FLEET_VIEWER_PERMISSIONS,

  // Driver
  driver: [],
};

// ---------------------------------------------------------------------------
// 5. Helper functions
// ---------------------------------------------------------------------------

/** All canonical role strings for quick lookup. */
const VALID_ROLES = new Set<string>(Object.keys(ROLE_META));

/**
 * Map a raw role string (possibly a legacy value from Supabase user_metadata)
 * to a canonical `Role`.
 *
 *   'superadmin' → 'platform_owner'
 *   'admin'      → 'fleet_owner'
 *   'manager'    → 'fleet_manager'     (legacy TeamMember value)
 *   'viewer'     → 'fleet_viewer'      (legacy TeamMember value)
 *   valid Role   → pass through
 *   unknown      → 'fleet_viewer'      (safest fallback — minimal access)
 */
export function resolveRole(raw: string | null | undefined): Role {
  if (!raw) return 'fleet_viewer';

  // Legacy mappings
  switch (raw) {
    case 'superadmin': return 'platform_owner';
    case 'admin':      return 'fleet_owner';
    case 'manager':    return 'fleet_manager';
    case 'viewer':     return 'fleet_viewer';
  }

  // Already a canonical role?
  if (VALID_ROLES.has(raw)) return raw as Role;

  // Unknown → safest fallback
  return 'fleet_viewer';
}

/** Check whether a role has a specific permission. */
export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/** Return every permission granted to a role. */
export function getPermissions(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Return the numeric level for a role (higher = more powerful). */
export function getRoleLevel(role: Role): number {
  return ROLE_META[role]?.level ?? 0;
}

/**
 * Can `managerRole` manage (edit/remove) a user who currently holds `targetRole`?
 * Rule: your level must be strictly greater than the target's level.
 */
export function canManageRole(managerRole: Role, targetRole: Role): boolean {
  return getRoleLevel(managerRole) > getRoleLevel(targetRole);
}

// ---------------------------------------------------------------------------
// 6. Sidebar page ID → required permission map
// ---------------------------------------------------------------------------

/**
 * Maps each sidebar page ID (the string passed to `onNavigate` in AppLayout)
 * to the `nav.*` permission required to see / access it.
 *
 * If a page ID is not in this map, it defaults to VISIBLE (safe fallback so
 * we never accidentally hide something that has no permission defined yet).
 */
export const PAGE_PERMISSION_MAP: Record<string, Permission> = {
  // Top-level
  'dashboard':          'nav.dashboard',
  'imports':            'nav.imports',

  // Driver Operations
  'drivers':            'nav.drivers',
  'performance':        'nav.performance',
  'tier-config':        'nav.tier_config',
  'driver-ledger':      'nav.drivers',

  // Vehicles / Fleet
  'vehicles':           'nav.vehicles',
  'maintenance-hub':    'nav.maintenance',
  'fleet':              'nav.fleet',

  // Fuel Management
  'fuel-management':    'nav.fuel_overview',
  'fuel-overview':      'nav.fuel_overview',
  'fuel-reimbursements':'nav.fuel_review_queue',
  'fuel-audit':         'nav.fuel_audit',
  'fuel-integrity-gap': 'nav.fuel_integrity_gap',
  'fuel-reconciliation':'nav.fuel_reconciliation',
  'fuel-cards':         'nav.fuel_cards',
  'fuel-logs':          'nav.fuel_logs',
  'fuel-reports':       'nav.fuel_reports',
  'fuel-configuration': 'nav.fuel_configuration',

  // Toll Management
  'toll-logs':          'nav.toll_logs',
  'toll-tags':          'nav.toll_reconciliation',
  'tag-inventory':      'nav.toll_tag_inventory',
  'claimable-loss':     'nav.toll_claimable_loss',
  'toll-analytics':     'nav.toll_analytics',

  // Trips / Reports / Finance
  'trips':              'nav.trips',
  'reports':            'nav.reports',
  'transactions':       'nav.financial_analytics',
  'transaction-list':   'nav.transaction_list',

  // System
  'user-management':    'nav.user_management',
  'settings':           'nav.settings',
  'ledger-backfill':    'nav.ledger_backfill',
  'db-main-ledger':     'nav.database_management',
  'db-trip-ledger':     'nav.database_management',
  'db-fuel-ledger':     'nav.database_management',
  'db-toll-ledger':     'nav.database_management',
};

/**
 * Check whether a role can view a given sidebar page.
 * Pages not in PAGE_PERMISSION_MAP default to visible (safe fallback).
 */
export function canViewPage(role: Role, pageId: string): boolean {
  const perm = PAGE_PERMISSION_MAP[pageId];
  if (!perm) return true; // not mapped → visible by default
  return hasPermission(role, perm);
}
