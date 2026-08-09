import {
  resolveEnterpriseSeatRole,
  type EnterpriseSeatRole,
} from '@roam/auth-client';

/** Default post-login home by seat role (same Enterprise domain, path verticals). */
export function resolveEnterpriseHomePath(
  rawRole: string | null | undefined,
): '/app' | '/warehouse' {
  const seat = resolveEnterpriseSeatRole(rawRole);
  if (seat === 'enterprise_warehouse') return '/warehouse';
  return '/app';
}

/** Warehouse vertical: floor seats + anyone with mailbox write (owner/customs running receive). */
export function canAccessWarehouseVertical(seatRole: EnterpriseSeatRole): boolean {
  return (
    seatRole === 'enterprise_warehouse' ||
    seatRole === 'enterprise_owner' ||
    seatRole === 'enterprise_customs'
  );
}

export function canAccessCourierVertical(seatRole: EnterpriseSeatRole): boolean {
  // Floor-only warehouse seats stay in /warehouse unless promoted
  return seatRole !== 'enterprise_warehouse';
}
