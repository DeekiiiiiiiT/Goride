import { useQuery } from '@tanstack/react-query';
import { deliveryFetch } from '../lib/partner-api';
import { MenuCategory, MenuItem } from '../types/menu';

export interface MerchantMenuData {
  merchant: Record<string, unknown>;
  categories: MenuCategory[];
  items: MenuItem[];
}

export function useMerchantMenu(merchantId: string) {
  return useQuery({
    queryKey: ['merchant-menu', merchantId],
    queryFn: async () => {
      const data = await deliveryFetch('/merchant/menu');
      const categories = [...(data.categories || [])].sort(
        (a: MenuCategory, b: MenuCategory) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      const items = [...(data.items || [])].sort(
        (a: MenuItem, b: MenuItem) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      return { ...data, categories, items } as MerchantMenuData;
    },
    enabled: Boolean(merchantId),
  });
}
