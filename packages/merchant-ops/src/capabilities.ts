import type { MerchantCapability } from '@roam/types';

type Merchant = { id: string; capabilities?: string[] | null };

export const CAPABILITY_IN_STORE = 'in_store_operations' as const;
export const CAPABILITY_ROAM = 'roam_delivery' as const;

export function getMerchantCapabilities(merchant: Merchant | null | undefined): MerchantCapability[] {
  const raw = merchant?.capabilities;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.filter((c): c is MerchantCapability => c === CAPABILITY_ROAM || c === CAPABILITY_IN_STORE);
  }
  return [CAPABILITY_ROAM];
}

export function hasCapability(
  merchant: Merchant | null | undefined,
  capability: MerchantCapability,
): boolean {
  return getMerchantCapabilities(merchant).includes(capability);
}

export function isRoamOnly(merchant: Merchant | null | undefined): boolean {
  return !hasCapability(merchant, CAPABILITY_IN_STORE);
}

/** In-store / Command access — enabled by Roam admin only. */
export function canAccessCommand(
  _merchantId: string,
  merchant: Merchant | null | undefined,
): boolean {
  return hasCapability(merchant, CAPABILITY_IN_STORE);
}

/** @deprecated Prefer canAccessCommand */
export const canAccessRestaurantMgmt = canAccessCommand;
