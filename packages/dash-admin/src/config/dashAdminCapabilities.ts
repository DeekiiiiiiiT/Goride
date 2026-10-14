/**
 * Who can open each console destination. The only role table.
 * The server reads it from supabase/functions/delivery/admin/consoleAccess.ts.
 * Write buttons still use the existing checks (canWriteDashAdmin, finance approval).
 */
export type DashCapability =
  | 'home'
  | 'dispatch'
  | 'orders'
  | 'support'
  | 'in-house'
  | 'merchants'
  | 'couriers'
  | 'customers'
  | 'markets'
  | 'finance'
  | 'courier-cash'
  | 'pricing'
  | 'promotions'
  | 'team'
  | 'audit'
  | 'settings';

export type CapabilityAccess = 'none' | 'read' | 'write';

const ALL_WRITE: Record<DashCapability, CapabilityAccess> = {
  home: 'write',
  dispatch: 'write',
  orders: 'write',
  support: 'write',
  'in-house': 'write',
  merchants: 'write',
  couriers: 'write',
  customers: 'write',
  markets: 'write',
  finance: 'write',
  'courier-cash': 'write',
  pricing: 'write',
  promotions: 'write',
  team: 'write',
  audit: 'write',
  settings: 'write',
};

const OPS: Record<DashCapability, CapabilityAccess> = {
  home: 'write',
  dispatch: 'write',
  orders: 'write',
  support: 'write',
  'in-house': 'write',
  merchants: 'read',
  couriers: 'read',
  customers: 'read',
  markets: 'read',
  finance: 'none',
  'courier-cash': 'none',
  pricing: 'none',
  promotions: 'none',
  team: 'none',
  audit: 'none',
  settings: 'none',
};

const COURIER: Record<DashCapability, CapabilityAccess> = {
  home: 'write',
  dispatch: 'write',
  orders: 'write',
  support: 'write',
  'in-house': 'none',
  merchants: 'none',
  couriers: 'write',
  customers: 'none',
  markets: 'read',
  finance: 'none',
  'courier-cash': 'write',
  pricing: 'none',
  promotions: 'none',
  team: 'write',
  audit: 'read',
  settings: 'none',
};

const CONCIERGE: Record<DashCapability, CapabilityAccess> = {
  home: 'none',
  dispatch: 'none',
  orders: 'none',
  support: 'none',
  'in-house': 'write',
  merchants: 'none',
  couriers: 'none',
  customers: 'none',
  markets: 'none',
  finance: 'none',
  'courier-cash': 'none',
  pricing: 'none',
  promotions: 'none',
  team: 'none',
  audit: 'none',
  settings: 'none',
};

const SUPPORT: Record<DashCapability, CapabilityAccess> = {
  home: 'write',
  dispatch: 'write',
  orders: 'write',
  support: 'write',
  'in-house': 'none',
  merchants: 'read',
  couriers: 'read',
  customers: 'write',
  markets: 'none',
  finance: 'none',
  'courier-cash': 'none',
  pricing: 'none',
  promotions: 'none',
  team: 'none',
  audit: 'none',
  settings: 'none',
};

const ANALYST: Record<DashCapability, CapabilityAccess> = {
  home: 'read',
  dispatch: 'read',
  orders: 'read',
  support: 'none',
  'in-house': 'none',
  merchants: 'read',
  couriers: 'read',
  customers: 'read',
  markets: 'read',
  finance: 'read',
  'courier-cash': 'read',
  pricing: 'read',
  promotions: 'read',
  team: 'none',
  audit: 'read',
  settings: 'none',
};

export const CAPABILITY_MATRIX: Record<string, Record<DashCapability, CapabilityAccess>> = {
  platform_owner: ALL_WRITE,
  superadmin: ALL_WRITE,
  dash_admin: ALL_WRITE,
  dash_ops: OPS,
  courier_admin: COURIER,
  courier_ops: COURIER,
  dash_concierge: CONCIERGE,
  platform_support: SUPPORT,
  platform_analyst: ANALYST,
};

export const CAPABILITY_LABELS: Record<DashCapability, string> = {
  home: 'Home',
  dispatch: 'Dispatch',
  orders: 'Orders',
  support: 'Support',
  'in-house': 'In-House desk',
  merchants: 'Merchants',
  couriers: 'Couriers',
  customers: 'Customers',
  markets: 'Markets',
  finance: 'Finance',
  'courier-cash': 'Courier cash',
  pricing: 'Pricing',
  promotions: 'Promotions',
  team: 'Team and access',
  audit: 'Audit log',
  settings: 'Settings',
};

const ROLE_ORDER = [
  'platform_owner',
  'superadmin',
  'dash_admin',
  'dash_ops',
  'courier_admin',
  'courier_ops',
  'dash_concierge',
  'platform_support',
  'platform_analyst',
] as const;

export const CAPABILITY_ROLE_ORDER = ROLE_ORDER;

const ACCESS_RANK: Record<CapabilityAccess, number> = { none: 0, read: 1, write: 2 };

export function capabilityAccess(role: string | null | undefined, capability: DashCapability): CapabilityAccess {
  if (!role) return 'none';
  const row = CAPABILITY_MATRIX[role];
  if (!row) return 'none';
  return row[capability] ?? 'none';
}

/** Someone with two roles gets the more generous of the two. */
export function capabilityAccessForRoles(roles: Array<string | null | undefined>, capability: DashCapability): CapabilityAccess {
  let best: CapabilityAccess = 'none';
  for (const role of roles) {
    const access = capabilityAccess(role, capability);
    if (ACCESS_RANK[access] > ACCESS_RANK[best]) best = access;
  }
  return best;
}

export function canOpenCapability(role: string | null | undefined, capability: DashCapability): boolean {
  return capabilityAccess(role, capability) !== 'none';
}

export function canOpenCapabilityForRoles(roles: Array<string | null | undefined>, capability: DashCapability): boolean {
  return capabilityAccessForRoles(roles, capability) !== 'none';
}

/** Longest-prefix match from a pathname (no basename) to a capability. */
export function capabilityForPath(pathname: string): DashCapability | null {
  const path = pathname.split('?')[0] || '/';
  if (path === '/' || path === '' || path.startsWith('/dashboard')) return 'home';
  if (path.startsWith('/dispatch') || path.startsWith('/live-ops') || path.startsWith('/couriers/presence')) return 'dispatch';
  if (path.startsWith('/orders') || path.startsWith('/couriers/ledger')) return 'orders';
  if (path.startsWith('/support') || path.startsWith('/reviews')) return 'support';
  if (path.startsWith('/in-house')) return 'in-house';
  if (path.startsWith('/merchants')) return 'merchants';
  if (path.startsWith('/couriers')) return 'couriers';
  if (path.startsWith('/customers')) return 'customers';
  if (path.startsWith('/markets')) return 'markets';
  if (path.startsWith('/finance') || path.startsWith('/disputes') || path.startsWith('/reports')) return 'finance';
  if (path.startsWith('/courier-cash') || path.startsWith('/remittance')) return 'courier-cash';
  if (path.startsWith('/pricing')) return 'pricing';
  if (path.startsWith('/promotions')) return 'promotions';
  if (path.startsWith('/team') || path.startsWith('/users')) return 'team';
  if (path.startsWith('/audit') || path.startsWith('/activity')) return 'audit';
  if (path.startsWith('/settings') || path.startsWith('/play-store')) return 'settings';
  return null;
}

export function canOpenPath(role: string | string[] | null | undefined, pathname: string): boolean {
  const capability = capabilityForPath(pathname);
  if (!capability) return true;
  const roles = Array.isArray(role) ? role : [role];
  return canOpenCapabilityForRoles(roles, capability);
}
