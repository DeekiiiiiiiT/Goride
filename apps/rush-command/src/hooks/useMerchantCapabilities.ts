import { useMemo } from 'react';
import {
  CAPABILITY_IN_STORE,
  canAccessRestaurantMgmt,
  getMerchantCapabilities,
  hasCapability,
  isRoamOnly,
} from '../lib/merchant-capabilities';
import type { Merchant } from './useMerchant';

export function useMerchantCapabilities(merchant: Merchant | null | undefined) {
  return useMemo(
    () => ({
      capabilities: getMerchantCapabilities(merchant),
      hasInStore: hasCapability(merchant, CAPABILITY_IN_STORE),
      isRoamOnly: isRoamOnly(merchant),
      canAccessRestaurantMgmt: merchant
        ? canAccessRestaurantMgmt(merchant.id, merchant)
        : false,
    }),
    [merchant],
  );
}
