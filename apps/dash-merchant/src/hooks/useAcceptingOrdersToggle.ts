import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '../lib/partner-supabase';
import { toast } from 'sonner';
import { rememberGoLiveComplete } from '../lib/go-live';
import { Merchant } from './useMerchant';

export function useAcceptingOrdersToggle(merchant: Merchant | null | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (isAccepting: boolean) => {
      if (!merchant) throw new Error('Merchant not loaded');

      // Settle the first-time gate before pause so is_accepting_orders=false cannot reopen it.
      rememberGoLiveComplete(merchant.id);

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

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
        const err = new Error(body.error || 'Failed to update store status') as Error & { code?: string };
        err.code = body.code;
        throw err;
      }
      return res.json();
    },
    onSuccess: (_data, isAccepting) => {
      queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
      toast.success(isAccepting ? 'You are now accepting orders' : 'Orders paused');
    },
    onError: (error: Error & { code?: string }) => {
      if (error.code === 'payout_not_ready') {
        toast.error('Payout setup must be verified before accepting orders');
        return;
      }
      toast.error(error.message || 'Failed to update store status');
    },
  });

  return {
    isAcceptingOrders: merchant?.is_accepting_orders ?? false,
    toggleAcceptingOrders: (
      next: boolean,
      options?: { onSuccess?: () => void },
    ) => {
      if (!merchant) return;
      mutation.mutate(next, {
        onSuccess: () => {
          options?.onSuccess?.();
        },
      });
    },
    isPending: mutation.isPending,
  };
}
