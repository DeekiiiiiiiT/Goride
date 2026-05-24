/**
 * RBAC Middleware — Roam Fleet (Server-Side)
 *
 * Server-side duplicate of the role/permission logic from /utils/permissions.ts.
 * Must be kept in sync manually. Server code cannot import frontend modules.
 *
 * Created: Phase 6 of the RBAC rollout (see /solution.md).
 *
 * Exports:
 *   requireAuth()          — Hono middleware: validates token, sets user context
 *   requirePermission(p)   — Hono middleware: checks user has permission p
 *   requireRole(level)     — Hono middleware: checks user role >= level
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import type { Context, Next } from "npm:hono";

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------

export type Role =
  | 'platform_owner'
  | 'platform_support'
  | 'platform_analyst'
  | 'fleet_owner'
  | 'fleet_manager'
  | 'fleet_accountant'
  | 'fleet_viewer'
  | 'driver';

export type Permission =
  | 'nav.dashboard' | 'nav.imports' | 'nav.drivers' | 'nav.vehicles' | 'nav.maintenance'
  | 'nav.fleet' | 'nav.fuel_overview' | 'nav.fuel_review_queue'
  | 'nav.fuel_audit' | 'nav.fuel_integrity_gap' | 'nav.fuel_reconciliation'
  | 'nav.fuel_cards' | 'nav.fuel_logs' | 'nav.fuel_reports'
  | 'nav.fuel_configuration' | 'nav.toll_logs' | 'nav.toll_reconciliation'
  | 'nav.toll_tag_inventory' | 'nav.toll_claimable_loss' | 'nav.toll_analytics'
  | 'nav.trips' | 'nav.reports' | 'nav.financial_analytics'
  | 'nav.transaction_list' | 'nav.performance' | 'nav.tier_config'
  | 'nav.user_management' | 'nav.settings'
  | 'nav.database_management'
  | 'drivers.create' | 'drivers.edit' | 'drivers.delete' | 'drivers.view'
  | 'vehicles.create' | 'vehicles.edit' | 'vehicles.delete' | 'vehicles.view'
  | 'vehicles.bypass_catalog_gate'
  | 'fuel.approve' | 'fuel.reject' | 'fuel.create_entry' | 'fuel.edit_entry'
  | 'fuel.delete_entry' | 'fuel.view' | 'fuel.export'
  | 'toll.manage' | 'toll.view'
  | 'transactions.approve' | 'transactions.reject' | 'transactions.edit'
  | 'transactions.view' | 'transactions.export'
  | 'reports.generate' | 'reports.export' | 'reports.view'
  | 'settings.edit'
  | 'users.invite' | 'users.edit_role' | 'users.remove'
  | 'data.import' | 'data.export' | 'data.backfill';

export interface RbacUser {
  userId: string;
  email: string;
  rawRole: string;
  resolvedRole: Role;
  /** The organization this user belongs to. For fleet_owners, this is their own userId. */
  organizationId: string | null;
}

// ---------------------------------------------------------------------------
// 2. Role resolution (mirror of /utils/permissions.ts resolveRole)
// ---------------------------------------------------------------------------

const VALID_ROLES = new Set<string>([
  'platform_owner', 'platform_support', 'platform_analyst',
  'fleet_owner', 'fleet_manager', 'fleet_accountant', 'fleet_viewer',
  'driver',
]);

/** Product-scoped admin roles — must not override platform superadmin for RBAC. */
const PRODUCT_ADMIN_ROLES = new Set([
  'fleet_admin', 'fleet_ops', 'driver_admin', 'driver_ops',
  'rides_admin', 'rides_ops', 'dash_admin', 'dash_ops',
  'enterprise_admin', 'enterprise_ops',
]);

const PLATFORM_RAW_ROLES = [
  'superadmin', 'platform_owner', 'platform_support', 'platform_analyst',
] as const;

function readRolesArray(meta: Record<string, unknown> | undefined): string[] {
  const raw = meta?.roles;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
    .map((r) => r.trim());
}

function collectAllJwtRoles(
  appMeta: Record<string, unknown>,
  userMeta: Record<string, unknown>,
): string[] {
  const roles = new Set<string>();
  if (typeof appMeta.role === 'string' && appMeta.role.trim()) {
    roles.add(appMeta.role.trim());
  }
  for (const r of readRolesArray(appMeta)) roles.add(r);
  if (typeof userMeta.role === 'string' && userMeta.role.trim()) {
    roles.add(userMeta.role.trim());
  }
  return Array.from(roles);
}

/** Pick the RBAC role from JWT metadata; platform roles beat product admin roles. */
export function pickRawRoleForRbac(
  appMeta: Record<string, unknown>,
  userMeta: Record<string, unknown>,
): string {
  const allRoles = collectAllJwtRoles(appMeta, userMeta);

  for (const platformRole of PLATFORM_RAW_ROLES) {
    if (allRoles.includes(platformRole)) return platformRole;
  }

  const appRole = typeof appMeta.role === 'string' ? appMeta.role.trim() : '';
  if (appRole && !PRODUCT_ADMIN_ROLES.has(appRole)) {
    return appRole;
  }

  const userRole = typeof userMeta.role === 'string' ? userMeta.role.trim() : '';
  if (userRole) return userRole;

  return 'fleet_viewer';
}

export function hasPlatformStaffAccess(user: RbacUser): boolean {
  return user.resolvedRole === 'platform_owner'
    || user.resolvedRole === 'platform_support'
    || user.resolvedRole === 'platform_analyst'
    || user.rawRole === 'superadmin'
    || user.rawRole === 'platform_owner'
    || user.rawRole === 'platform_support'
    || user.rawRole === 'platform_analyst';
}

/** Platform owner / superadmin only — full delete and other destructive platform ops. */
export function hasPlatformOwnerAccess(user: RbacUser): boolean {
  return user.resolvedRole === 'platform_owner'
    || user.rawRole === 'superadmin'
    || user.rawRole === 'platform_owner';
}

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

export function rbacUserFromSupabaseUser(user: SupabaseAuthUser): RbacUser {
  const appMeta = (user.app_metadata || {}) as Record<string, unknown>;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const rawRole = pickRawRoleForRbac(appMeta, meta);
  const resolved = resolveRole(rawRole);
  return {
    userId: user.id,
    email: user.email || '',
    rawRole,
    resolvedRole: resolved,
    organizationId: (typeof meta.organizationId === 'string' && meta.organizationId)
      ? meta.organizationId
      : (resolved === 'fleet_owner' ? user.id : null),
  };
}

export function isPlatformStaffFromAuthUser(user: SupabaseAuthUser): boolean {
  return hasPlatformStaffAccess(rbacUserFromSupabaseUser(user));
}

export function isPlatformOwnerFromAuthUser(user: SupabaseAuthUser): boolean {
  return hasPlatformOwnerAccess(rbacUserFromSupabaseUser(user));
}

export function resolveRole(raw: string | null | undefined): Role {
  if (!raw) return 'fleet_viewer';
  switch (raw) {
    case 'superadmin': return 'platform_owner';
    case 'admin':      return 'fleet_owner';
    case 'manager':    return 'fleet_manager';
    case 'viewer':     return 'fleet_viewer';
  }
  if (VALID_ROLES.has(raw)) return raw as Role;
  return 'fleet_viewer';
}

// ---------------------------------------------------------------------------
// 3. Role metadata (levels)
// ---------------------------------------------------------------------------

const ROLE_LEVELS: Record<Role, number> = {
  platform_owner:   1000,
  platform_support: 700,
  platform_analyst: 500,
  fleet_owner:      900,
  fleet_manager:    700,
  fleet_accountant: 500,
  fleet_viewer:     300,
  driver:           100,
};

// ---------------------------------------------------------------------------
// 4. Role -> Permissions map (mirror of /utils/permissions.ts)
// ---------------------------------------------------------------------------

const ALL_CUSTOMER_PERMISSIONS: Permission[] = [
  'nav.dashboard', 'nav.imports', 'nav.drivers', 'nav.vehicles', 'nav.maintenance', 'nav.fleet',
  'nav.fuel_overview', 'nav.fuel_review_queue', 'nav.fuel_audit',
  'nav.fuel_integrity_gap', 'nav.fuel_reconciliation', 'nav.fuel_cards',
  'nav.fuel_logs', 'nav.fuel_reports', 'nav.fuel_configuration',
  'nav.toll_logs', 'nav.toll_reconciliation', 'nav.toll_tag_inventory',
  'nav.toll_claimable_loss', 'nav.toll_analytics',
  'nav.trips', 'nav.reports', 'nav.financial_analytics',
  'nav.transaction_list', 'nav.performance', 'nav.tier_config',
  'nav.user_management', 'nav.settings',
  'nav.database_management',
  'drivers.create', 'drivers.edit', 'drivers.delete', 'drivers.view',
  'vehicles.create', 'vehicles.edit', 'vehicles.delete', 'vehicles.view',
  // 'vehicles.bypass_catalog_gate' is platform-only (added below).
  'fuel.approve', 'fuel.reject', 'fuel.create_entry', 'fuel.edit_entry',
  'fuel.delete_entry', 'fuel.view', 'fuel.export',
  'toll.manage', 'toll.view',
  'transactions.approve', 'transactions.reject', 'transactions.edit',
  'transactions.view', 'transactions.export',
  'reports.generate', 'reports.export', 'reports.view',
  'settings.edit',
  'users.invite', 'users.edit_role', 'users.remove',
  'data.import', 'data.export', 'data.backfill',
];

const FLEET_MANAGER_PERMISSIONS: Permission[] = ALL_CUSTOMER_PERMISSIONS.filter(
  (p) =>
    p !== 'nav.settings' &&
    p !== 'nav.user_management' &&
    p !== 'nav.database_management' &&
    p !== 'settings.edit' &&
    p !== 'users.invite' &&
    p !== 'users.edit_role' &&
    p !== 'users.remove' &&
    p !== 'data.backfill'
);

const FLEET_ACCOUNTANT_PERMISSIONS: Permission[] = [
  'nav.dashboard', 'nav.fuel_logs', 'nav.fuel_reports',
  'nav.fuel_reconciliation', 'nav.financial_analytics',
  'nav.transaction_list', 'nav.reports',
  'drivers.view', 'vehicles.view',
  'fuel.view', 'fuel.export',
  'toll.view',
  'transactions.view', 'transactions.export',
  'reports.view', 'reports.export',
  'data.export',
];

const FLEET_VIEWER_PERMISSIONS: Permission[] = [
  'nav.dashboard',
  'reports.view',
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  platform_owner:   [...ALL_CUSTOMER_PERMISSIONS, 'vehicles.bypass_catalog_gate'],
  platform_support: [],
  platform_analyst: [],
  fleet_owner:      ALL_CUSTOMER_PERMISSIONS,
  fleet_manager:    FLEET_MANAGER_PERMISSIONS,
  fleet_accountant: FLEET_ACCOUNTANT_PERMISSIONS,
  fleet_viewer:     FLEET_VIEWER_PERMISSIONS,
  driver:           [],
};

// ---------------------------------------------------------------------------
// 5. Helper functions
// ---------------------------------------------------------------------------

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

export function getRoleLevel(role: Role): number {
  return ROLE_LEVELS[role] ?? 0;
}

// ---------------------------------------------------------------------------
// 6. Supabase client (service-role for token validation)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }
  return _supabase;
}

// ---------------------------------------------------------------------------
// 7. Middleware: requireAuth()
//
// Extracts the Bearer token, validates it via supabase.auth.getUser().
// If the token is the anon key (not a user JWT), we gracefully degrade to
// fleet_owner so existing frontend calls (which send publicAnonKey) keep
// working. This passthrough will be tightened in Phase 7+ once the frontend
// sends real user access tokens.
// ---------------------------------------------------------------------------

export function requireAuth() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return c.json({ error: 'Unauthorized: No token provided' }, 401);
    }

    const sb = getSupabase();

    try {
      const { data, error } = await sb.auth.getUser(token);

      if (error || !data?.user) {
        // Token is likely the anon key — gracefully degrade
        // Log for observability so we know when this passthrough fires
        console.log('[RBAC] Auth passthrough: token is not a user JWT (likely anon key). Defaulting to fleet_owner.');
        const passthroughUser: RbacUser = {
          userId: '_anon_passthrough',
          email: '',
          rawRole: 'admin',
          resolvedRole: 'fleet_owner',
          organizationId: null,
        };
        c.set('rbacUser', passthroughUser);
        await next();
        return;
      }

      // Resolve RBAC role from full JWT (platform roles beat product admin roles)
      const appMeta = (data.user.app_metadata || {}) as Record<string, unknown>;
      const meta = data.user.user_metadata || {};
      const rawRole = pickRawRoleForRbac(appMeta, meta);
      const resolved = resolveRole(rawRole);

      const rbacUser: RbacUser = {
        userId: data.user.id,
        email: data.user.email || '',
        rawRole,
        resolvedRole: resolved,
        // Derive organizationId: explicit metadata > self-referencing for fleet_owners
        organizationId: meta.organizationId
          || (resolved === 'fleet_owner' ? data.user.id : null),
      };

      c.set('rbacUser', rbacUser);
      await next();
    } catch (err) {
      console.log('[RBAC] Auth error, using passthrough:', err);
      // Fail-open during transition period — never break existing fleet owners
      const passthroughUser: RbacUser = {
        userId: '_anon_passthrough',
        email: '',
        rawRole: 'admin',
        resolvedRole: 'fleet_owner',
        organizationId: null,
      };
      c.set('rbacUser', passthroughUser);
      await next();
    }
  };
}

// ---------------------------------------------------------------------------
// 8. Middleware: requirePermission(permission)
//
// Must be placed AFTER requireAuth() in the middleware chain.
// Checks that the authenticated user's resolved role includes the given
// permission. Returns 403 if not.
// ---------------------------------------------------------------------------

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    const user = c.get('rbacUser') as RbacUser | undefined;

    if (!user) {
      console.log(`[RBAC] requirePermission(${permission}): No rbacUser in context — did you forget requireAuth()?`);
      return c.json({ error: 'Unauthorized: No user context' }, 401);
    }

    if (!hasPermission(user.resolvedRole, permission)) {
      console.log(`[RBAC] FORBIDDEN: User ${user.userId} (role=${user.resolvedRole}) missing permission "${permission}"`);
      return c.json({
        error: 'Forbidden',
        message: `You do not have the "${permission}" permission.`,
        required: permission,
        currentRole: user.resolvedRole,
      }, 403);
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// 9. Middleware: requireRole(minimumLevel)
//
// Alternative to permission check — ensures the user's role level is >=
// the specified minimum. Useful for broad "must be at least fleet_manager"
// checks.
// ---------------------------------------------------------------------------

export function requireRole(minimumLevel: number) {
  return async (c: Context, next: Next) => {
    const user = c.get('rbacUser') as RbacUser | undefined;

    if (!user) {
      return c.json({ error: 'Unauthorized: No user context' }, 401);
    }

    const userLevel = getRoleLevel(user.resolvedRole);
    if (userLevel < minimumLevel) {
      console.log(`[RBAC] ROLE_LEVEL: User ${user.userId} (role=${user.resolvedRole}, level=${userLevel}) below minimum ${minimumLevel}`);
      return c.json({
        error: 'Forbidden',
        message: `Insufficient role level. Required: ${minimumLevel}, yours: ${userLevel}.`,
        currentRole: user.resolvedRole,
        currentLevel: userLevel,
        requiredLevel: minimumLevel,
      }, 403);
    }

    await next();
  };
}