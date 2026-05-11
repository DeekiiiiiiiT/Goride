import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { Session } from '@supabase/supabase-js';

export interface Merchant {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo_url: string;
  cover_image_url: string;
  address: string;
  phone: string;
  email: string;
  cuisine_type: string;
  is_active: boolean;
  is_verified: boolean;
  is_accepting_orders: boolean;
  avg_prep_time_mins: number;
  min_order_amount: number;
  delivery_fee: number;
  delivery_radius_km: number;
  commission_rate: number;
  rating: number;
  total_ratings: number;
}

export function useMerchant(session: Session | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-merchant', session?.user?.id],
    queryFn: async () => {
      if (!session) return null;

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/profile`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch merchant');

      const data = await res.json();
      return data.merchant as Merchant;
    },
    enabled: !!session,
  });

  return {
    merchant: data,
    isLoading,
    error,
    refetch,
  };
}
