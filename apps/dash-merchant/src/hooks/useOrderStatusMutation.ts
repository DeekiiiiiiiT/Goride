import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@roam/auth-client';
import { API_ENDPOINTS } from '@roam/api-client';
import { toast } from 'sonner';
import { merchantOrdersKeys } from '../lib/merchant-orders-query';

export interface OrderStatusUpdate {
  orderId: string;
  status: string;
  notes?: string;
  estimatedPrepTimeMins?: number;
}

export function useOrderStatusMutation(options?: {
  onSuccess?: (variables: OrderStatusUpdate) => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, status, notes, estimatedPrepTimeMins }: OrderStatusUpdate) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          status,
          actorType: 'merchant',
          notes,
          estimatedPrepTimeMins,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update order');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
      options?.onSuccess?.(variables);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
