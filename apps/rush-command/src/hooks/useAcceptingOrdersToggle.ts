import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '../lib/partner-supabase';
import { toast } from 'sonner';
import { Merchant } from './useMerchant';

export function useAcceptingOrdersToggle(merchant: Merchant) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (isAccepting: boolean) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: merchant.name,
          description: merchant.description,
          address: merchant.address,
          phone: merchant.phone,
          email: merchant.email,
          cuisine_type: merchant.cuisine_type,
          avg_prep_time_mins: merchant.avg_prep_time_mins,
          min_order_amount: merchant.min_order_amount,
          delivery_fee: merchant.delivery_fee,
          delivery_radius_km: merchant.delivery_radius_km,
          is_accepting_orders: isAccepting,
          logo_url: merchant.logo_url,
          cover_image_url: merchant.cover_image_url,
        }),
      });

      if (!res.ok) throw new Error('Failed to update store status');
      return res.json();
    },
    onSuccess: (_data, isAccepting) => {
      queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
      toast.success(isAccepting ? 'You are now accepting orders' : 'Orders paused');
    },
    onError: () => toast.error('Failed to update store status'),
  });

  return {
    isAcceptingOrders: merchant.is_accepting_orders,
    toggleAcceptingOrders: (
      next: boolean,
      options?: { onSuccess?: () => void },
    ) => {
      mutation.mutate(next, {
        onSuccess: () => {
          options?.onSuccess?.();
        },
      });
    },
    isPending: mutation.isPending,
  };
}
