import { useQuery } from '@tanstack/react-query';
import { CAPABILITY_IN_STORE, hasCapability } from '../lib/merchant-capabilities';
import { fetchSettings } from '../lib/restaurant-mgmt-api';
import type { Merchant } from './useMerchant';

export const restaurantSettingsKeys = {
  all: ['restaurant-settings'] as const,
  merchant: (merchantId: string) => ['restaurant-settings', merchantId] as const,
};

export function useRestaurantSettings(merchant: Merchant | null | undefined) {
  const enabled = Boolean(merchant && hasCapability(merchant, CAPABILITY_IN_STORE));

  return useQuery({
    queryKey: restaurantSettingsKeys.merchant(merchant?.id ?? ''),
    queryFn: fetchSettings,
    enabled,
    staleTime: 60_000,
  });
}
