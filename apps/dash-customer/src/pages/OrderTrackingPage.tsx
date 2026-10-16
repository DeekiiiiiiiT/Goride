import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { useAppConfig } from '@roam/rush-app-config';
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
import { toast } from 'sonner';

type Props = {
  orderId?: string;
  demoPhase?: TrackingPhase;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function OrderTrackingPage({ orderId, demoPhase, onNavigate }: Props) {
  const appConfig = useAppConfig('customer');
  const cancelWindowSeconds =
    Number(appConfig.settings['customer.ordering.cancel_window_seconds']) || 60;
  const mocksOk = allowMocks();
  const [cancelPending, setCancelPending] = useState(false);
  const [collectPending, setCollectPending] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelQuote, setCancelQuote] = useState('You can only cancel before the restaurant starts preparing.');
  const [, setCancelTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setCancelTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
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
    refetchInterval: (query) => {
      const status = String(
        (query.state.data as { order?: { status?: string } } | undefined)?.order?.status ?? '',
      ).toLowerCase();
      if (['delivered', 'cancelled', 'canceled'].includes(status)) return false;
      return 5000;
    },
    retry: 2,
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

  const phase: TrackingPhase =
    demoPhase ??
    (order ? getTrackingPhase(order.status, order.fulfillmentType) : 'preparing');

  useEffect(() => {
    if (!order) return;
    if (phase === 'delivered') {
      onNavigate('order-delivered', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        tip: order.tip,
        merchantId: order.merchantId,
        merchantName: order.merchantName,
        deliveredAt: order.deliveredLabel,
        proofPhotoUrl: order.deliveryPhotoUrl,
      });
    }
  }, [phase, onNavigate, order]);

  const handleClose = () => onNavigate('home');

  const handleCancelOrder = async () => {
    if (!orderId || cancelPending) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      toast.error('Sign in to cancel this order');
      return;
    }
    const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/cancel-quote`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = (await res.json().catch(() => ({}))) as { quote?: { summary?: string } };
    setCancelQuote(body.quote?.summary || 'You can only cancel before the restaurant starts preparing.');
    setShowCancelConfirm(true);
  };

  const confirmCancelOrder = async () => {
    if (!orderId || cancelPending) return;
    setShowCancelConfirm(false);
    setCancelPending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Sign in to cancel this order');
        return;
      }
      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Cancelled by customer' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || 'Could not cancel order');
        return;
      }
      toast.success('Order cancelled');
      onNavigate('orders');
    } catch {
      toast.error('Could not cancel order');
    } finally {
      setCancelPending(false);
    }
  };

  if (!orderId) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        <p className="text-on-surface-variant mb-4">No order selected</p>
        <button type="button" onClick={() => onNavigate('orders')} className="text-primary font-semibold">
          View orders
        </button>
      </div>
    );
  }

  if (isLoading && !(mocksOk && demoPhase)) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  if (!order || (error && !mocksOk)) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4 gap-4">
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
      <div className="min-h-dvh flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  const handleHelp = () => onNavigate('report-issue', { orderId: order.id, returnTo: 'tracking' });
  const handleDetails = () => onNavigate('order-details', { orderId: order.id });

  const handleCollected = async () => {
    if (!orderId || collectPending) return;
    setCollectPending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Sign in to confirm collection');
        return;
      }
      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'delivered', actorType: 'customer' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(body.error || 'Could not confirm collection');
        return;
      }
      toast.success('Enjoy your order');
      void refetch();
    } catch {
      toast.error('Could not confirm collection');
    } finally {
      setCollectPending(false);
    }
  };

  const statusLower = String(order.status || '').toLowerCase();
  const placedAtMs = order.placedAt ? new Date(order.placedAt).getTime() : NaN;
  const ageSec = Number.isFinite(placedAtMs)
    ? Math.max(0, (Date.now() - placedAtMs) / 1000)
    : 0;
  const withinFreeCancelWindow = statusLower !== 'placed' || ageSec <= cancelWindowSeconds;
  const canCancelOrder =
    ['placed', 'accepted'].includes(statusLower) && withinFreeCancelWindow;

  // courier.delivery.pin_required_over_jmd — show PIN clearly until delivered
  const showDeliveryPin =
    Boolean(order.deliveryPin)
    && !['delivered', 'cancelled', 'canceled', 'completed'].includes(statusLower);

  const deliveryPinBanner = showDeliveryPin ? (
    <div className="fixed bottom-0 inset-x-0 z-[70] pointer-events-none safe-x pb-safe">
      <div className="mx-auto mb-4 max-w-md px-4">
        <div className="rounded-2xl bg-primary text-on-primary px-5 py-4 shadow-xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest opacity-90 mb-1">
            Give this PIN to your courier
          </p>
          <p className="text-4xl font-bold tracking-[0.35em] tabular-nums">{order.deliveryPin}</p>
        </div>
      </div>
    </div>
  ) : null;

  const cancelConfirmSheet = showCancelConfirm ? (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-order-title"
        className="w-full max-w-md rounded-t-2xl bg-surface p-6 shadow-xl sm:rounded-2xl"
      >
        <h2 id="cancel-order-title" className="text-headline-sm font-semibold text-on-surface">
          Cancel this order?
        </h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          {statusLower === 'placed'
            ? `Free cancel is available for ${cancelWindowSeconds}s after placing. ${cancelQuote}`
            : cancelQuote}
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setShowCancelConfirm(false)}
            className="flex-1 rounded-lg border border-outline-variant py-3 text-label-md font-semibold text-on-surface"
          >
            Keep order
          </button>
          <button
            type="button"
            onClick={() => void confirmCancelOrder()}
            disabled={cancelPending}
            className="flex-1 rounded-lg bg-error py-3 text-label-md font-semibold text-on-error disabled:opacity-50"
          >
            {cancelPending ? 'Cancelling…' : 'Cancel order'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  switch (phase) {
    case 'ready_for_pickup':
      return (
        <>
          <div className="min-h-dvh flex flex-col bg-background text-on-surface safe-x">
            <header className="flex items-center justify-between px-4 min-h-16 pt-safe">
              <button type="button" onClick={handleClose} className="p-2 -ml-2 rounded-full">
                <MaterialIcon name="arrow_back" />
              </button>
              <h1 className="text-headline-md font-semibold">Pickup</h1>
              <button type="button" onClick={handleHelp} className="p-2 -mr-2 rounded-full">
                <MaterialIcon name="help" />
              </button>
            </header>
            <main className="flex-1 px-4 pb-safe flex flex-col items-center justify-center text-center gap-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                <MaterialIcon name="shopping_bag" className="text-4xl" filled />
              </div>
              <div>
                <h2 className="text-headline-lg font-bold mb-2">Ready for pickup</h2>
                <p className="text-body-md text-on-surface-variant">
                  Head to {order.merchantName}
                  {order.merchantAddress ? ` · ${order.merchantAddress}` : ''}
                </p>
                <p className="text-label-sm text-on-surface-variant mt-2">
                  Order #{order.orderNumber}
                </p>
              </div>
              <button
                type="button"
                disabled={collectPending}
                onClick={() => void handleCollected()}
                className="w-full max-w-sm mt-4 bg-primary text-on-primary text-headline-sm font-semibold py-4 rounded-xl disabled:opacity-50"
              >
                {collectPending ? 'Confirming…' : 'Collected'}
              </button>
              <button
                type="button"
                onClick={handleDetails}
                className="text-label-md font-semibold text-primary"
              >
                Order details
              </button>
            </main>
          </div>
          {cancelConfirmSheet}
        </>
      );
    case 'courier_assigned':
      return (
        <>
          <CourierAssignedView order={order} onBack={handleClose} onHelp={handleHelp} onDetails={handleDetails} />
          {deliveryPinBanner}
          {cancelConfirmSheet}
        </>
      );
    case 'on_the_way':
      return (
        <>
          <OnTheWayView order={order} onBack={handleClose} onHelp={handleHelp} onDetails={handleDetails} />
          {deliveryPinBanner}
          {cancelConfirmSheet}
        </>
      );
    case 'almost_there':
      return (
        <>
          <AlmostThereView order={order} onClose={handleClose} onHelp={handleHelp} />
          {deliveryPinBanner}
          {cancelConfirmSheet}
        </>
      );
    case 'preparing':
    default:
      return (
        <>
          <PreparingTrackingView
            order={order}
            onClose={handleClose}
            onCancel={canCancelOrder ? handleCancelOrder : undefined}
            cancelPending={cancelPending}
            onHelp={handleHelp}
            onNavigate={(page) => onNavigate(page)}
          />
          {deliveryPinBanner}
          {cancelConfirmSheet}
        </>
      );
  }
}
