import {
  resolveEnterpriseSeatRole,
  type EnterpriseSeatRole,
} from '@roam/auth-client';

export type EnterpriseHomeInput = {
  rawRole?: string | null;
  businessType?: string | null;
  subscribedProducts?: string[] | null;
};

/** Default post-login home by business type + seat role. */
export function resolveEnterpriseHomePath(
  rawRoleOrInput: string | null | undefined | EnterpriseHomeInput,
  maybeBusinessType?: string | null,
): '/app' | '/warehouse' {
  const input: EnterpriseHomeInput =
    typeof rawRoleOrInput === 'object' && rawRoleOrInput !== null
      ? rawRoleOrInput
      : { rawRole: rawRoleOrInput, businessType: maybeBusinessType };

  const seat = resolveEnterpriseSeatRole(input.rawRole);
  if (seat === 'enterprise_warehouse') return '/warehouse';

  const products = input.subscribedProducts || [];
  const bt = input.businessType || '';

  if (bt === 'warehouse' || (products.includes('warehouse') && !products.includes('courier'))) {
    return '/warehouse';
  }

  return '/app';
}

/** Warehouse vertical: floor seats + warehouse orgs + owners/customs running receive. */
export function canAccessWarehouseVertical(
  seatRole: EnterpriseSeatRole,
  opts?: { businessType?: string | null; subscribedProducts?: string[] | null },
): boolean {
  if (
    seatRole === 'enterprise_warehouse' ||
    seatRole === 'enterprise_owner' ||
    seatRole === 'enterprise_customs'
  ) {
    return true;
  }
  const products = opts?.subscribedProducts || [];
  if (opts?.businessType === 'warehouse' || products.includes('warehouse')) return true;
  return false;
}

export function canAccessCourierVertical(
  seatRole: EnterpriseSeatRole,
  opts?: { businessType?: string | null; subscribedProducts?: string[] | null },
): boolean {
  if (seatRole === 'enterprise_warehouse') return false;
  const products = opts?.subscribedProducts || [];
  const bt = opts?.businessType || '';
  if (bt === 'warehouse' && !products.includes('courier')) return false;
  return true;
}
