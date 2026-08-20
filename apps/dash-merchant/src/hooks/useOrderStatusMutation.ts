import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { toast } from 'sonner';
import { merchantOrdersKeys } from '../lib/merchant-orders-query';
import { getAuthHeaders } from '../lib/partner-api';
import { supabase } from '../lib/partner-supabase';

export interface OrderStatusUpdate {
  orderId: string;
  status: string;
  notes?: string;
  estimatedPrepTimeMins?: number;
}

export function useOrderStatusMutation(options?: {
  merchantId?: string;
  onSuccess?: (variables: OrderStatusUpdate) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, status, notes, estimatedPrepTimeMins }: OrderStatusUpdate) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const headers = await getAuthHeaders();
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders/${orderId}/status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ status, notes, estimatedPrepTimeMins }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update order');
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
      options?.onSuccess?.(variables);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Could not update order');
    },
  });
}
