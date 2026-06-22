import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { Session } from '@supabase/supabase-js';

export type VerificationStatus =
  | 'pending'
  | 'in_review'
  | 'docs_requested'
  | 'approved'
  | 'rejected';

export interface Merchant {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo_url: string;
  cover_image_url: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
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
  verification_status: VerificationStatus;
  verification_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  verified_at: string | null;
}

export type TeamPermission = 'orders' | 'menu' | 'analytics' | 'payouts';

export interface MerchantMembership {
  role: 'staff' | 'manager' | 'admin';
  permissions: TeamPermission[];
  is_owner: boolean;
}

export interface MerchantProfileResponse {
  merchant: Merchant;
  membership: MerchantMembership;
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

      const data = await res.json() as MerchantProfileResponse;
      return data;
    },
    enabled: !!session,
  });

  return {
    merchant: data?.merchant,
    membership: data?.membership,
    isLoading,
    error,
    refetch,
  };
}
