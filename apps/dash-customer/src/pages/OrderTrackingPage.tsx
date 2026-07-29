import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@/lib/supabase';
import { AlmostThereView } from '@/components/tracking/AlmostThereView';
import { CourierAssignedView } from '@/components/tracking/CourierAssignedView';
import { OnTheWayView } from '@/components/tracking/OnTheWayView';
import { PreparingTrackingView } from '@/components/tracking/PreparingTrackingView';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { allowMocks } from '@/lib/mocksGate';
import {
  getTrackingPhase,
  mapApiOrderToTracking,
  MOCK_TRACKING_ORDER,
  type TrackingOrder,
  type TrackingPhase,
} from '@/lib/trackingContent';

type Props = {
  orderId?: string;
  demoPhase?: TrackingPhase;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function OrderTrackingPage({ orderId, demoPhase, onNavigate }: Props) {
  const mocksOk = allowMocks();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch order');
      return res.json();
    },
    enabled: !!orderId && !(mocksOk && demoPhase),
    refetchInterval: 5000,
    retry: false,
  });

  // Prefer realtime updates for courier GPS when publication is enabled
  useEffect(() => {
    if (!orderId || (mocksOk && demoPhase)) return;
    const channel = supabase
      .channel(`order-track-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'delivery',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => {
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, mocksOk, demoPhase, refetch]);

  const order: TrackingOrder | null = useMemo(() => {
    if (data?.order) {
      return mapApiOrderToTracking(data.order as Record<string, unknown>);
    }
    if (mocksOk && (demoPhase || error || !data)) {
      return {
        ...MOCK_TRACKING_ORDER,
        id: orderId ?? MOCK_TRACKING_ORDER.id,
        orderNumber: orderId ?? MOCK_TRACKING_ORDER.orderNumber,
      };
    }
    return null;
  }, [data, orderId, mocksOk, demoPhase, error]);

  const phase: TrackingPhase = demoPhase ?? (order ? getTrackingPhase(order.status) : 'preparing');

  useEffect(() => {
    if (!order) return;
    if (phase === 'delivered') {
      onNavigate('order-delivered', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        tip: order.tip,
        merchantId: order.merchantId,
      });
    }
  }, [phase, onNavigate, order]);

  const handleClose = () => onNavigate('home');

  if (!orderId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-on-surface-variant mb-4">No order selected</p>
        <button type="button" onClick={() => onNavigate('orders')} className="text-primary font-semibold">
          View orders
        </button>
      </div>
    );
  }

  if (isLoading && !(mocksOk && demoPhase)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  if (!order || (error && !mocksOk)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-4">
        <MaterialIcon name="error_outline" className="text-4xl text-on-surface-variant" />
        <p className="text-on-surface-variant text-center">Couldn&apos;t load this order.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="bg-primary text-on-primary px-6 py-3 rounded-lg font-semibold"
        >
          Retry
        </button>
        <button type="button" onClick={() => onNavigate('orders')} className="text-primary font-semibold">
          Back to orders
        </button>
      </div>
    );
  }

  if (phase === 'delivered') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  switch (phase) {
    case 'courier_assigned':
      return <CourierAssignedView order={order} onBack={handleClose} />;
    case 'on_the_way':
      return <OnTheWayView order={order} onBack={handleClose} />;
    case 'almost_there':
      return <AlmostThereView order={order} onClose={handleClose} />;
    case 'preparing':
    default:
      return <PreparingTrackingView order={order} onClose={handleClose} />;
  }
}
