import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PartnerTab, getStoreStatus } from '../../lib/partner-utils';
import PartnerDesktopShell from '../../components/layout/PartnerDesktopShell';
import StoreStatusToggle from '../../components/layout/StoreStatusToggle';
import { useAcceptingOrdersToggle } from '../../hooks/useAcceptingOrdersToggle';
import { useNotificationSettings } from '../../hooks/useNotificationSettings';
import { useMerchantActiveOrders } from '../../hooks/useMerchantActiveOrders';
import { useMerchantOrdersRealtime } from '../../hooks/useMerchantOrdersRealtime';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { useOrderStatusMutation } from '../../hooks/useOrderStatusMutation';
import { playNewOrderAlert } from '../../lib/partner-order-alert';
import { triggerHaptic } from '../../lib/partner-haptics';
import NewOrderAlertView from '../../components/NewOrderAlertView';
import RejectOrderSheet, {
  formatRejectNotes,
  RejectOrderPayload,
} from '../../components/RejectOrderSheet';
import OrderAcceptedSheet from '../../components/OrderAcceptedSheet';
import NewOrderDetailSheet from '../../components/NewOrderDetailSheet';
import QueryErrorState from '../../components/QueryErrorState';
import CounterOrderCard from '../../components/staff-ops/counter/CounterOrderCard';
import EndShiftButton from '../../components/staff-ops/station/EndShiftButton';
import { Order } from '../../types/order';

interface CounterOrdersPageProps {
  merchant: Merchant;
  staffName?: string;
  onNavigate?: (tab: PartnerTab) => void;
  onOpenMobileNav?: () => void;
  onEndShift?: () => void;
}

type CounterTab = 'new' | 'kitchen' | 'ready';

const TABS: { key: CounterTab; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'kitchen', label: 'In Kitchen' },
  { key: 'ready', label: 'Ready for Driver' },
];

function filterByTab(orders: Order[], tab: CounterTab) {
  if (tab === 'new') return orders.filter((order) => order.status === 'placed');
  if (tab === 'kitchen') {
    return orders.filter((order) => order.status === 'accepted' || order.status === 'preparing');
  }
  return orders.filter((order) => order.status === 'ready');
}

export default function CounterOrdersPage({
  merchant,
  staffName,
  onNavigate,
  onOpenMobileNav,
  onEndShift,
}: CounterOrdersPageProps) {
  const [tab, setTab] = useState<CounterTab>('new');
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { isAcceptingOrders, toggleAcceptingOrders } = useAcceptingOrdersToggle(merchant);
  const storeStatus = getStoreStatus(merchant.is_active, isAcceptingOrders);
  const { settings: notificationSettings } = useNotificationSettings(merchant.id);
  const isTabVisible = usePageVisibility();

  const handleRealtimeInsert = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const newOrder = payload.new as Order;
      setDetailOrderId(newOrder.id);
      setTab('new');
      playNewOrderAlert(notificationSettings, audioRef);
      toast.success(`New order #${newOrder.order_number || ''}`);
    },
    [notificationSettings],
  );

  const { realtimeStatus } = useMerchantOrdersRealtime({
    merchantId: merchant.id,
    onInsert: handleRealtimeInsert,
  });

  const { orders, isLoading, isError, refetch, isInitialLoading } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: true,
  });

  const updateStatusMutation = useOrderStatusMutation({
    merchantId: merchant.id,
    onSuccess: ({ orderId, status }) => {
      setDetailOrderId((current) => (current === orderId ? null : current));
      setRejectOrderId((current) => (current === orderId ? null : current));
      if (status === 'preparing') {
        setAcceptedOrderId((current) => (current === orderId ? null : current));
      }
    },
  });

  const tabOrders = useMemo(() => filterByTab(orders, tab), [orders, tab]);
  const newCount = useMemo(() => orders.filter((order) => order.status === 'placed').length, [orders]);
  const detailOrder = detailOrderId
    ? orders.find((order) => order.id === detailOrderId) ?? null
    : null;
  const acceptedOrder = acceptedOrderId
    ? orders.find((order) => order.id === acceptedOrderId) ?? null
    : null;
  const alertOrder = orders.find((order) => order.status === 'placed') ?? null;

  const handleAccept = (orderId: string) => {
    triggerHaptic('success', notificationSettings.vibration);
    updateStatusMutation.mutate(
      { orderId, status: 'accepted' },
      {
        onSuccess: () => {
          setAcceptedOrderId(orderId);
          setTab('kitchen');
          toast.success('Order accepted');
        },
      },
    );
  };

  const handleStartPreparing = (prepTimeMins: number) => {
    if (!acceptedOrderId) return;
    updateStatusMutation.mutate({
      orderId: acceptedOrderId,
      status: 'preparing',
      estimatedPrepTimeMins: prepTimeMins,
    });
  };

  const handleConfirmReject = (payload: RejectOrderPayload) => {
    if (!rejectOrderId) return;
    updateStatusMutation.mutate({
      orderId: rejectOrderId,
      status: 'cancelled',
      notes: formatRejectNotes(payload),
    });
  };

  const emptyCopy: Record<CounterTab, { title: string; subtitle: string }> = {
    new: { title: 'No new orders', subtitle: 'New customer orders will appear here' },
    kitchen: { title: 'No orders in the kitchen', subtitle: 'Accept new orders to get started' },
    ready: { title: 'No orders ready', subtitle: 'Mark orders ready when bags are packed' },
  };

  const header = (
    <header className="sticky top-0 z-20 border-b border-outline-variant/40 bg-background/95 backdrop-blur-md">
      <div className="flex items-center justify-between px-margin-mobile py-inset-sm lg:px-margin-tablet">
        <div className="min-w-0">
          <button
            type="button"
            className="mb-1 flex items-center gap-1 text-label-md text-on-surface-variant lg:hidden"
            onClick={onOpenMobileNav}
          >
            <MaterialIcon name="menu" />
            Menu
          </button>
          <h1 className="truncate text-headline-md font-bold text-on-background">
            {merchant.name || 'Counter'}
          </h1>
          {staffName && (
            <p className="text-label-sm text-on-surface-variant">Signed in as {staffName}</p>
          )}
        </div>
        <div className="flex items-center gap-inset-sm">
          {onEndShift && (
            <EndShiftButton merchantId={merchant.id} onEnded={onEndShift} />
          )}
          <StoreStatusToggle
            storeStatus={storeStatus}
            isAcceptingOrders={isAcceptingOrders}
            onToggle={toggleAcceptingOrders}
          />
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto px-margin-mobile pb-inset-sm lg:px-margin-tablet">
        {TABS.map((entry) => {
          const count =
            entry.key === 'new'
              ? newCount
              : entry.key === 'kitchen'
                ? filterByTab(orders, 'kitchen').length
                : filterByTab(orders, 'ready').length;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`shrink-0 rounded-full px-4 py-2 text-label-md font-semibold ${
                tab === entry.key
                  ? 'bg-primary-container text-on-primary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {entry.label}
              {count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>
    </header>
  );

  const body = isError ? (
    <QueryErrorState onRetry={() => void refetch()} />
  ) : isInitialLoading || isLoading ? (
    <div className="p-margin-mobile text-body-sm text-on-surface-variant">Loading orders…</div>
  ) : tabOrders.length === 0 ? (
    <div className="flex flex-col items-center justify-center px-margin-mobile py-16 text-center">
      <MaterialIcon name="receipt_long" className="mb-3 text-5xl text-on-surface-variant/40" />
      <p className="text-body-lg font-semibold text-on-background">{emptyCopy[tab].title}</p>
      <p className="text-body-sm text-on-surface-variant">{emptyCopy[tab].subtitle}</p>
    </div>
  ) : (
    <div className="space-y-inset-md p-margin-mobile lg:px-margin-tablet">
      {tabOrders.map((order) => (
        <CounterOrderCard
          key={order.id}
          order={order}
          isSubmitting={updateStatusMutation.isPending}
          onOpen={() => setDetailOrderId(order.id)}
          onAccept={() => handleAccept(order.id)}
          onReject={() => setRejectOrderId(order.id)}
          onMarkReady={() =>
            updateStatusMutation.mutate(
              { orderId: order.id, status: 'ready' },
              { onSuccess: () => toast.success('Order marked ready') },
            )
          }
          onHandoff={() =>
            updateStatusMutation.mutate(
              { orderId: order.id, status: 'picked_up' },
              { onSuccess: () => toast.success('Handed to driver') },
            )
          }
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="hidden min-h-dvh flex-col lg:flex">
        <PartnerDesktopShell
          merchant={merchant}
          activeNavKey="orders"
          onNavigate={(page) => onNavigate?.(page)}
          isAcceptingOrders={isAcceptingOrders}
          onToggleAcceptingOrders={toggleAcceptingOrders}
        >
          {header}
          <div className="flex-1 overflow-y-auto">{body}</div>
        </PartnerDesktopShell>
      </div>

      <div className="min-h-dvh bg-background lg:hidden">
        {header}
        {newCount > 0 && tab !== 'new' && (
          <button
            type="button"
            onClick={() => setTab('new')}
            className="mx-margin-mobile mt-inset-sm flex min-h-[48px] w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-lg bg-error-container font-semibold text-on-error-container"
          >
            <MaterialIcon name="notifications_active" filled />
            {newCount} new order{newCount === 1 ? '' : 's'}
          </button>
        )}
        {body}
      </div>

      {alertOrder && (
        <NewOrderAlertView
          order={alertOrder}
          open={tab === 'new'}
          onAccept={(orderId) => handleAccept(orderId)}
          onViewOrder={() => setDetailOrderId(alertOrder.id)}
          isSubmitting={updateStatusMutation.isPending}
        />
      )}

      <NewOrderDetailSheet
        order={detailOrder}
        open={!!detailOrder && detailOrder.status === 'placed'}
        onClose={() => setDetailOrderId(null)}
        onAccept={handleAccept}
        onReject={(orderId) => setRejectOrderId(orderId)}
        isSubmitting={updateStatusMutation.isPending}
        avgPrepTimeMins={merchant.avg_prep_time_mins || 12}
      />

      <RejectOrderSheet
        open={!!rejectOrderId}
        onClose={() => setRejectOrderId(null)}
        onConfirm={handleConfirmReject}
        isSubmitting={updateStatusMutation.isPending}
      />

      <OrderAcceptedSheet
        order={acceptedOrder}
        open={!!acceptedOrder}
        avgPrepTimeMins={merchant.avg_prep_time_mins || 12}
        onClose={() => setAcceptedOrderId(null)}
        onStartPreparing={handleStartPreparing}
        isSubmitting={updateStatusMutation.isPending}
      />
    </>
  );
}
