export const DRIVER_WRITE_ROLES = new Set([
  'driver_admin',
  'platform_owner',
  'platform_support',
  'superadmin',
]);

export const DRIVER_FORCE_APPROVE_ROLES = new Set([
  'platform_owner',
  'superadmin',
]);

export function canWriteDriverAdmin(role: string | null | undefined): boolean {
  return Boolean(role && DRIVER_WRITE_ROLES.has(role));
}

export function canForceApproveDriver(role: string | null | undefined): boolean {
  return Boolean(role && DRIVER_FORCE_APPROVE_ROLES.has(role));
}
