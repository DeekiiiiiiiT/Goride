import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { AlmostThereView } from '@/components/tracking/AlmostThereView';
import { CourierAssignedView } from '@/components/tracking/CourierAssignedView';
import { OnTheWayView } from '@/components/tracking/OnTheWayView';
import { PreparingTrackingView } from '@/components/tracking/PreparingTrackingView';
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
  const { data, isLoading, error } = useQuery({
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
    enabled: !!orderId,
    refetchInterval: 5000,
    retry: false,
  });

  const order: TrackingOrder = useMemo(() => {
    if (data?.order) {
      return mapApiOrderToTracking(data.order as Record<string, unknown>);
    }
    return {
      ...MOCK_TRACKING_ORDER,
      id: orderId ?? MOCK_TRACKING_ORDER.id,
      orderNumber: orderId ?? MOCK_TRACKING_ORDER.orderNumber,
    };
  }, [data, orderId]);

  const phase: TrackingPhase = demoPhase ?? getTrackingPhase(order.status);

  useEffect(() => {
    if (phase === 'delivered') {
      onNavigate('order-delivered', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        tip: order.tip,
        merchantId: 'island-grill',
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

  if (isLoading && !demoPhase) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  if (error && !demoPhase) {
    // Fall through to mock tracking UI for demo orders
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
