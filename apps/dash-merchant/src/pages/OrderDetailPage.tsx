import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '../lib/partner-supabase';
import { toast } from 'sonner';
import { Merchant } from '../hooks/useMerchant';
import { usePageVisibility } from '../hooks/usePageVisibility';
import { useOrderDetailRealtime } from '../hooks/useMerchantOrdersRealtime';
import { Order, OrderEvent } from '../types/order';
import PreparingOrderDetail from '../components/order-detail/PreparingOrderDetail';
import ReadyOrderDetail from '../components/order-detail/ReadyOrderDetail';
import PickedUpOrderDetail from '../components/order-detail/PickedUpOrderDetail';
import CompletedOrderDetail from '../components/order-detail/CompletedOrderDetail';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { merchantOrdersKeys } from '../lib/merchant-orders-query';
import { resolveOrdersRefetchInterval } from '../lib/merchant-orders-sync-policy';

interface OrderDetailPageProps {
  orderId: string;
  merchant: Merchant;
  onBack: () => void;
  onReject: (orderId: string) => void;
}

export default function OrderDetailPage({
  orderId,
  merchant,
  onBack,
  onReject,
}: OrderDetailPageProps) {
  const queryClient = useQueryClient();
  const isTabVisible = usePageVisibility();
  const { realtimeStatus } = useOrderDetailRealtime({ orderId });

  const { data, isLoading, error } = useQuery({
    queryKey: merchantOrdersKeys.order(orderId),
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to load order');
      return res.json() as Promise<{ order: Order; events: OrderEvent[] }>;
    },
    refetchInterval: resolveOrdersRefetchInterval({ realtimeStatus, isTabVisible }),
    refetchIntervalInBackground: false,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status }: { status: string }) => {
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
        body: JSON.stringify({ status, actorType: 'merchant' }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to update order');
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.order(orderId) });
      void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
      toast.success('Order updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[55] flex items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-container border-t-transparent" />
      </div>
    );
  }

  if (error || !data?.order) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-background p-margin-mobile">
        <MaterialIcon name="error_outline" size={48} className="text-error" />
        <p className="text-body-lg text-on-surface-variant">Could not load order details.</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg bg-primary px-6 py-2 text-on-primary"
        >
          Go back
        </button>
      </div>
    );
  }

  const order = data.order;
  const status = order.status;

  if (status === 'preparing' || status === 'accepted') {
    return (
      <div className="fixed inset-0 z-[55] overflow-y-auto bg-background">
        <PreparingOrderDetail
          order={order}
          avgPrepTimeMins={merchant.avg_prep_time_mins}
          onBack={onBack}
          onMarkReady={() => updateStatusMutation.mutate({ status: 'ready' })}
          onCancel={() => onReject(order.id)}
          isSubmitting={updateStatusMutation.isPending}
        />
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <div className="fixed inset-0 z-[55] overflow-y-auto bg-background">
        <ReadyOrderDetail order={order} onBack={onBack} />
      </div>
    );
  }

  if (status === 'picked_up' || status === 'in_transit') {
    return (
      <div className="fixed inset-0 z-[55] overflow-y-auto bg-background">
        <PickedUpOrderDetail order={order} onBack={onBack} onClose={onBack} />
      </div>
    );
  }

  if (['delivered', 'completed', 'cancelled'].includes(status)) {
    return (
      <div className="fixed inset-0 z-[55] overflow-y-auto bg-background">
        <CompletedOrderDetail order={order} onBack={onBack} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-4 bg-background p-margin-mobile">
      <p className="text-body-lg text-on-surface-variant">
        No detail view for status: {status}
      </p>
      <button type="button" onClick={onBack} className="rounded-lg bg-primary px-6 py-2 text-on-primary">
        Go back
      </button>
    </div>
  );
}
