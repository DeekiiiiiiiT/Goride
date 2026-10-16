/** Fallback when platform.staff_security has not loaded yet. */
export const PRIVILEGED_ADMIN_MFA_ROLES = [
  'platform_owner',
  'dash_admin',
  'courier_admin',
  'identity_admin',
  'superadmin',
] as const;

const MFA_MIN_LEVEL = 800;

const ROLE_LEVELS: Record<string, number> = {
  platform_owner: 1000,
  superadmin: 1000,
  platform_support: 950,
  identity_admin: 900,
  dash_admin: 800,
  courier_admin: 800,
  dash_ops: 700,
  courier_ops: 700,
  support_agent: 600,
  dash_concierge: 500,
  platform_analyst: 500,
};

export function requiresAdminMfa(role: string, mfaRequiredRoles?: string[] | null): boolean {
  const list =
    mfaRequiredRoles && mfaRequiredRoles.length > 0
      ? mfaRequiredRoles
      : (PRIVILEGED_ADMIN_MFA_ROLES as readonly string[]);
  return list.includes(role);
}

/**
 * MFA required if role is in platform.staff_security.mfaRequiredRoles
 * or privilege level ≥ 800 (safety floor).
 */
export function requiresAdminMfaFromRoles(
  roles: string[],
  mfaRequiredRoles?: string[] | null,
): boolean {
  return roles.some((r) => {
    const level = ROLE_LEVELS[r] ?? 0;
    return level >= MFA_MIN_LEVEL || requiresAdminMfa(r, mfaRequiredRoles);
  });
}
