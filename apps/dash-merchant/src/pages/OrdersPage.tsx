import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/partner-supabase';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { formatElapsedTimer, formatJmd, formatTimeAgo, getStoreStatus, PartnerTab } from '../lib/partner-utils';
import NewOrderDetailSheet from '../components/NewOrderDetailSheet';
import NewOrderAlertView from '../components/NewOrderAlertView';
import FirstOrderCelebrationView from '../components/FirstOrderCelebrationView';
import PayoutSetupSheet from '../components/PayoutSetupSheet';
import PartnerDesktopShell from '../components/layout/PartnerDesktopShell';
import OrdersDesktopDashboard from '../components/orders/OrdersDesktopDashboard';
import StoreStatusToggle from '../components/layout/StoreStatusToggle';
import { useAcceptingOrdersToggle } from '../hooks/useAcceptingOrdersToggle';
import { useNotificationSettings } from '../hooks/useNotificationSettings';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { usePageVisibility } from '../hooks/usePageVisibility';
import { useMerchantActiveOrders } from '../hooks/useMerchantActiveOrders';
import { useMerchantOrdersRealtime } from '../hooks/useMerchantOrdersRealtime';
import { useOrderStatusMutation } from '../hooks/useOrderStatusMutation';
import QueryErrorState from '../components/QueryErrorState';
import SwipeableOrderCard from '../components/orders/SwipeableOrderCard';
import { playNewOrderAlert } from '../lib/partner-order-alert';
import { triggerHaptic } from '../lib/partner-haptics';
import { readFlag } from '../lib/partner-feature-flags';
import RejectOrderSheet, {
  formatRejectNotes,
  RejectOrderPayload,
} from '../components/RejectOrderSheet';
import OrderAcceptedSheet from '../components/OrderAcceptedSheet';
import OrderDetailPage from './OrderDetailPage';
import OrderHistoryView from '../components/OrderHistoryView';
import { getInitials } from '../lib/order-utils';
import {
  markFirstOrderCelebrationSeen,
  markPayoutSetupDismissed,
  shouldShowFirstOrderCelebration,
  hasDismissedPayoutSetup,
} from '../lib/first-order';
import { fetchBankAccount } from '../lib/partner-api';
import { getItemOptionLines, Order } from '../types/order';
import {
  fetchMerchantHistoryOrders,
  merchantOrdersKeys,
} from '../lib/merchant-orders-query';
import {
  computeTodayStats,
  countOrdersByStatus,
  filterOrdersByTab,
  getActiveQueueOrders,
  sortOrders,
} from '../lib/merchant-orders-filters';

interface OrdersPageProps {
  merchant: Merchant;
  onNavigate?: (tab: PartnerTab) => void;
  onOpenMobileNav?: () => void;
}

type OrderFilter = 'placed' | 'preparing' | 'ready' | 'order_status';
type HistoryTab = 'completed' | 'cancelled';
type SortOrder = 'oldest' | 'newest';

const FILTER_TABS: { key: OrderFilter; label: string }[] = [
  { key: 'placed', label: 'New' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'ready', label: 'Ready' },
  { key: 'order_status', label: 'Order Status' },
];

function openOrderView(
  order: Order,
  setters: {
    setDetailOrderId: (id: string) => void;
    setAcceptedOrderId: (id: string) => void;
    setViewOrderId: (id: string) => void;
  },
) {
  if (order.status === 'placed') {
    setters.setDetailOrderId(order.id);
    return;
  }
  if (order.status === 'accepted') {
    setters.setAcceptedOrderId(order.id);
    return;
  }
  setters.setViewOrderId(order.id);
}

export default function OrdersPage({ merchant, onNavigate, onOpenMobileNav }: OrdersPageProps) {
  const [filter, setFilter] = useState<OrderFilter>('placed');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('completed');
  const [sortOrder, setSortOrder] = useState<SortOrder>('oldest');
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const [desktopSelectedOrderId, setDesktopSelectedOrderId] = useState<string | null>(null);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const [showFirstOrderCelebration, setShowFirstOrderCelebration] = useState(false);
  const [showPayoutSetup, setShowPayoutSetup] = useState(false);
  const pendingPayoutSetupRef = useRef(false);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null);
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();
  const { isAcceptingOrders, toggleAcceptingOrders, isPending: togglePending } =
    useAcceptingOrdersToggle(merchant);
  const { settings: notificationSettings, updateSettings } =
    useNotificationSettings(merchant.id);
  const storeStatus = getStoreStatus(merchant.is_active, isAcceptingOrders);
  const swipeEnabled = readFlag(merchant.id, 'swipeAcceptOrders');
  const isTabVisible = usePageVisibility();
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleRealtimeInsert = useCallback(
    (payload: { new: Record<string, unknown> }) => {
      const newOrder = payload.new as Order;
      setNewOrderIds((prev) => new Set([...prev, newOrder.id]));
      setDetailOrderId(newOrder.id);
      setShowOrderDetail(false);
      setFilter('placed');

      if (shouldShowFirstOrderCelebration(merchant.id)) {
        setShowFirstOrderCelebration(true);
        void fetchBankAccount()
          .then(({ bankAccount }) => {
            if (!bankAccount && !hasDismissedPayoutSetup(merchant.id)) {
              pendingPayoutSetupRef.current = true;
            }
          })
          .catch(() => undefined);
      }

      playNewOrderAlert(notificationSettings, audioRef);

      toast.success(`New order received! #${newOrder.order_number || 'New'}`, {
        duration: 10000,
      });
    },
    [merchant.id, notificationSettings],
  );

  const { realtimeStatus } = useMerchantOrdersRealtime({
    merchantId: merchant.id,
    onInsert: handleRealtimeInsert,
  });

  useEffect(() => {
    if (realtimeStatus === 'connected') {
      setShowReconnecting(false);
      return;
    }

    const timer = window.setTimeout(() => setShowReconnecting(true), 3000);
    return () => window.clearTimeout(timer);
  }, [realtimeStatus]);

  const isHistoryView = filter === 'order_status';

  const {
    orders: activeOrders,
    isLoading,
    isError,
    refetch,
    isInitialLoading,
  } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: !isHistoryView,
  });

  const { data: deliveredHistoryData, isLoading: deliveredHistoryLoading } = useQuery({
    queryKey: merchantOrdersKeys.history('delivered'),
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      return fetchMerchantHistoryOrders(session, 'delivered');
    },
    enabled: isHistoryView,
  });

  const { data: cancelledHistoryData, isLoading: cancelledHistoryLoading } = useQuery({
    queryKey: merchantOrdersKeys.history('cancelled'),
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      return fetchMerchantHistoryOrders(session, 'cancelled');
    },
    enabled: isHistoryView,
  });

  const updateStatusMutation = useOrderStatusMutation({
    onSuccess: ({ orderId, status }) => {
      setDetailOrderId((current) => (current === orderId ? null : current));
      setShowOrderDetail(false);
      setRejectOrderId((current) => (current === orderId ? null : current));
      setViewOrderId((current) => (current === orderId ? null : current));
      if (status === 'preparing') {
        setAcceptedOrderId((current) => (current === orderId ? null : current));
      }
      setNewOrderIds((prev) => {
        const updated = new Set(prev);
        updated.delete(orderId);
        return updated;
      });
    },
  });

  const allOrders: Order[] = activeOrders;
  const completedHistoryOrders: Order[] = deliveredHistoryData?.orders || [];
  const cancelledHistoryOrders: Order[] = cancelledHistoryData?.orders || [];
  const historyOrders = historyTab === 'completed' ? completedHistoryOrders : cancelledHistoryOrders;
  const historyLoading =
    historyTab === 'completed' ? deliveredHistoryLoading : cancelledHistoryLoading;

  const counts = useMemo(() => countOrdersByStatus(activeOrders), [activeOrders]);

  const orders = useMemo(() => {
    if (isHistoryView) return [];
    return sortOrders(filterOrdersByTab(allOrders, filter), sortOrder);
  }, [allOrders, filter, sortOrder, isHistoryView]);

  const detailOrder = useMemo(() => {
    if (!detailOrderId) return null;
    return activeOrders.find((o) => o.id === detailOrderId) ?? allOrders.find((o) => o.id === detailOrderId) ?? null;
  }, [detailOrderId, activeOrders, allOrders]);

  useEffect(() => {
    if (detailOrder && detailOrder.status !== 'placed') {
      setDetailOrderId(null);
      setShowOrderDetail(false);
      setShowFirstOrderCelebration(false);
    }
  }, [detailOrder]);

  useEffect(() => {
    if (!detailOrderId) {
      setShowOrderDetail(false);
    }
  }, [detailOrderId]);

  const acceptedOrder = useMemo(() => {
    if (!acceptedOrderId) return null;
    return activeOrders.find((o) => o.id === acceptedOrderId) ?? allOrders.find((o) => o.id === acceptedOrderId) ?? null;
  }, [acceptedOrderId, activeOrders, allOrders]);

  const handleAcceptOrder = (orderId: string) => {
    triggerHaptic('success', notificationSettings.vibration);
    updateStatusMutation.mutate(
      { orderId, status: 'accepted' },
      {
        onSuccess: () => {
          setAcceptedOrderId(orderId);
          setFilter('preparing');
          toast.success('Order accepted!');
        },
      },
    );
  };

  const handleStartPreparing = (prepTimeMins: number) => {
    if (!acceptedOrderId) return;
    updateStatusMutation.mutate(
      {
        orderId: acceptedOrderId,
        status: 'preparing',
        estimatedPrepTimeMins: prepTimeMins,
      },
      {
        onSuccess: () => {
          toast.success('Order is now preparing');
        },
      },
    );
  };

  const handleOpenReject = (orderId: string) => {
    setRejectOrderId(orderId);
  };

  const handleConfirmReject = (payload: RejectOrderPayload) => {
    if (!rejectOrderId) return;
    triggerHaptic('error', notificationSettings.vibration);
    updateStatusMutation.mutate({
      orderId: rejectOrderId,
      status: 'cancelled',
      notes: formatRejectNotes(payload),
    });
  };

  const getTabCount = (key: OrderFilter) => {
    if (key === 'placed') return counts.placed;
    if (key === 'preparing') return counts.preparing;
    if (key === 'ready') return counts.ready;
    return undefined;
  };

  const queueOrders = useMemo(
    () => getActiveQueueOrders(activeOrders, sortOrder),
    [activeOrders, sortOrder],
  );

  const todayStats = useMemo(
    () => computeTodayStats(activeOrders, merchant.avg_prep_time_mins || 12),
    [activeOrders, merchant.avg_prep_time_mins],
  );

  useEffect(() => {
    if (detailOrderId && window.matchMedia('(min-width: 768px)').matches) {
      setDesktopSelectedOrderId(detailOrderId);
    }
  }, [detailOrderId]);

  useEffect(() => {
    if (queueOrders.length === 0) {
      setDesktopSelectedOrderId(null);
      return;
    }
    if (!desktopSelectedOrderId || !queueOrders.some((order) => order.id === desktopSelectedOrderId)) {
      setDesktopSelectedOrderId(queueOrders[0].id);
    }
  }, [queueOrders, desktopSelectedOrderId]);

  const handleDesktopStartPreparing = (orderId: string) => {
    const order = activeOrders.find((entry) => entry.id === orderId);
    if (!order) return;

    if (order.status === 'placed') {
      updateStatusMutation.mutate(
        { orderId, status: 'accepted' },
        {
          onSuccess: () => {
            updateStatusMutation.mutate(
              {
                orderId,
                status: 'preparing',
                estimatedPrepTimeMins: merchant.avg_prep_time_mins,
              },
              {
                onSuccess: () => toast.success('Order is now preparing'),
              },
            );
          },
        },
      );
      return;
    }

    updateStatusMutation.mutate(
      {
        orderId,
        status: 'preparing',
        estimatedPrepTimeMins: merchant.avg_prep_time_mins,
      },
      {
        onSuccess: () => toast.success('Order is now preparing'),
      },
    );
  };

  const handleViewOrderFromCelebration = () => {
    markFirstOrderCelebrationSeen(merchant.id);
    setShowFirstOrderCelebration(false);
    setShowOrderDetail(true);
    if (pendingPayoutSetupRef.current) {
      pendingPayoutSetupRef.current = false;
      setShowPayoutSetup(true);
    }
  };

  const handleDismissPayoutSetup = () => {
    markPayoutSetupDismissed(merchant.id);
    setShowPayoutSetup(false);
  };

  const handleNavigate = (tab: PartnerTab) => {
    onNavigate?.(tab);
  };

  const { pullToRefreshProps, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
      await refetch();
    },
  });

  return (
    <>
    <div className="hidden h-dvh lg:flex">
      <PartnerDesktopShell
        merchant={merchant}
        activeNavKey={isHistoryView ? 'history' : 'orders'}
        onNavigate={(tab) => {
          if (tab === 'orders') setFilter('placed');
          handleNavigate(tab);
        }}
        onHistory={() => {
          setFilter('order_status');
          setHistoryTab('completed');
        }}
        onSupport={() => onNavigate?.('account')}
        isAcceptingOrders={isAcceptingOrders}
        onToggleAcceptingOrders={toggleAcceptingOrders}
        togglePending={togglePending}
        notificationCount={counts.placed}
        headerVariant="merchant"
        onSettings={() => onNavigate?.('account')}
      >
        {isHistoryView ? (
          <main className="flex flex-1 flex-col overflow-hidden bg-background p-gutter">
            <OrderHistoryView
              tab={historyTab}
              onTabChange={setHistoryTab}
              orders={historyOrders}
              completedOrders={completedHistoryOrders}
              cancelledOrders={cancelledHistoryOrders}
              isLoading={historyLoading}
              onOrderClick={(orderId) => setViewOrderId(orderId)}
              fallbackAvgPrepMins={merchant.avg_prep_time_mins}
            />
          </main>
        ) : (
          <OrdersDesktopDashboard
            merchant={merchant}
            queueOrders={queueOrders}
            selectedOrderId={desktopSelectedOrderId}
            onSelectOrder={setDesktopSelectedOrderId}
            isLoading={isLoading}
            newCount={counts.placed}
            prepCount={counts.preparing}
            stats={todayStats}
            onReject={handleOpenReject}
            onStartPreparing={handleDesktopStartPreparing}
            onMarkReady={(orderId) => updateStatusMutation.mutate({ orderId, status: 'ready' })}
            onContactSupport={() =>
              toast.info('Help Center', {
                description: 'Contact dispatch from Account → Help & Support.',
              })
            }
            isSubmitting={updateStatusMutation.isPending}
          />
        )}
      </PartnerDesktopShell>
    </div>

    <div className="flex min-h-dvh flex-col bg-background text-on-background antialiased lg:hidden">
      <header className="safe-t safe-x sticky top-0 z-50 mx-auto flex h-16 w-full max-w-full items-center justify-between border-b border-outline-variant bg-surface shadow-sm">
        <div className="flex min-w-0 items-center gap-inset-xs">
          {onOpenMobileNav && (
            <button
              type="button"
              onClick={onOpenMobileNav}
              className="btn-touch -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high active:scale-95"
              aria-label="Open navigation"
            >
              <MaterialIcon name="menu" size={24} />
            </button>
          )}
          <h1 className="shrink-0 text-headline-md font-bold text-primary">Orders</h1>
          <StoreStatusToggle
            storeStatus={storeStatus}
            isAcceptingOrders={isAcceptingOrders}
            onToggle={toggleAcceptingOrders}
            pending={togglePending}
          />
        </div>
        <div className="flex items-center gap-inset-xs">
          {showReconnecting && (
            <span className="flex items-center gap-1 text-label-sm text-on-surface-variant">
              <MaterialIcon name="sync" size={14} className="animate-spin" />
              Reconnecting…
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              updateSettings({ newOrderAlerts: !notificationSettings.newOrderAlerts })
            }
            className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-colors duration-150 active:scale-95 ${
            notificationSettings.newOrderAlerts
              ? 'text-on-surface-variant hover:bg-surface-container-low'
              : 'bg-surface-variant text-tertiary'
          }`}
          aria-label={notificationSettings.newOrderAlerts ? 'Sound on' : 'Sound off'}
        >
          <MaterialIcon
            name={notificationSettings.newOrderAlerts ? 'notifications_active' : 'notifications_off'}
            filled
          />
          {counts.placed > 0 && (
            <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-error text-[10px] font-medium text-on-error">
              {counts.placed}
            </span>
          )}
        </button>
        </div>
      </header>

      <main
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-inset-sm overflow-y-auto px-margin-mobile py-inset-sm md:max-w-[1200px] md:px-inset-lg"
        data-partner-scroll
        {...pullToRefreshProps}
      >
        {(pullDistance > 0 || isRefreshing || isInitialLoading) && (
          <div className="flex items-center justify-center gap-2 py-1 text-label-sm text-on-surface-variant">
            <MaterialIcon
              name="refresh"
              className={isRefreshing || isInitialLoading ? 'animate-spin' : ''}
              size={16}
            />
            {isRefreshing || isInitialLoading ? 'Refreshing orders…' : 'Pull to refresh'}
          </div>
        )}
        <div className="-mx-margin-mobile sticky top-16 z-40 flex flex-col justify-between gap-inset-sm bg-background/95 px-margin-mobile py-inset-xs backdrop-blur-md md:top-0 md:mx-0 md:px-0">
          <div className="hide-scroll flex gap-inset-xs overflow-x-auto pb-1">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key;
              const count = getTabCount(tab.key);

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`flex items-center gap-inset-base whitespace-nowrap rounded-full px-inset-sm py-2 text-label-md font-semibold transition-colors duration-150 active:scale-95 ${
                    active
                      ? 'bg-primary-container text-on-primary-container'
                      : 'border border-outline-variant bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {tab.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        active
                          ? 'bg-on-primary-container text-primary-container'
                          : 'bg-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!isHistoryView && (
          <div className="flex shrink-0 items-center gap-inset-xs self-end md:self-auto">
            <span className="text-body-sm text-tertiary">Sort:</span>
            <button
              type="button"
              onClick={() => setSortOrder((current) => (current === 'oldest' ? 'newest' : 'oldest'))}
              className="flex items-center gap-inset-base rounded-lg border border-outline-variant bg-surface px-3 py-1.5 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low"
            >
              {sortOrder === 'oldest' ? 'Oldest first' : 'Newest first'}
              <MaterialIcon name="arrow_drop_down" size={16} />
            </button>
          </div>
          )}
        </div>

        {isHistoryView ? (
            <OrderHistoryView
              tab={historyTab}
              onTabChange={setHistoryTab}
              orders={historyOrders}
              completedOrders={completedHistoryOrders}
              cancelledOrders={cancelledHistoryOrders}
              isLoading={historyLoading}
              onOrderClick={(orderId) => setViewOrderId(orderId)}
              fallbackAvgPrepMins={merchant.avg_prep_time_mins}
            />
        ) : (
        <div className="mt-inset-xs flex flex-col gap-inset-sm">
          {isError ? (
            <QueryErrorState
              title="Could not load orders"
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            [1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-40 animate-pulse rounded-lg border border-outline-variant bg-surface"
              />
            ))
          ) : orders.length === 0 ? (
            <div className="rounded-lg border border-outline-variant bg-surface p-12 text-center shadow-sm">
              <MaterialIcon name="receipt_long" className="mx-auto mb-4 text-outline" size={48} />
              <h3 className="mb-2 text-headline-md font-semibold text-on-surface">No orders here</h3>
              <p className="text-body-sm text-on-surface-variant">
                New orders will appear in this queue in real time.
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const isNew = order.status === 'placed';
              const isPreparing = ['accepted', 'preparing'].includes(order.status);
              const isReady = order.status === 'ready';
              const prepStart = order.preparing_at || order.accepted_at || order.placed_at;
              const readySince = order.ready_at;

              return (
                <SwipeableOrderCard
                  key={order.id}
                  enabled={isNew && swipeEnabled}
                  onSwipeAccept={() => handleAcceptOrder(order.id)}
                  onSwipeReject={() => handleOpenReject(order.id)}
                >
                <article
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    openOrderView(order, {
                      setDetailOrderId,
                      setAcceptedOrderId,
                      setViewOrderId,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openOrderView(order, {
                        setDetailOrderId,
                        setAcceptedOrderId,
                        setViewOrderId,
                      });
                    }
                  }}
                  className={`relative flex cursor-pointer flex-col gap-inset-sm overflow-hidden rounded-lg border bg-surface p-inset-sm shadow-sm transition-colors hover:bg-surface-container-lowest ${
                    isNew ? 'partner-order-pulse border-2' : 'border-outline-variant opacity-90'
                  }`}
                >
                  <div
                    className={`absolute left-0 top-0 h-full w-1 ${
                      isNew
                        ? 'bg-primary-container'
                        : isPreparing
                          ? 'bg-warning'
                          : isReady
                            ? 'bg-primary-container'
                            : 'bg-outline-variant'
                    }`}
                  />

                  <div className="flex items-start justify-between pl-inset-xs">
                    <div className="flex flex-col gap-inset-base">
                      <div className="flex items-center gap-inset-xs">
                        {isNew && (
                          <span className="rounded bg-primary-container px-2 py-1 text-label-sm font-bold tracking-wider text-on-primary-container">
                            NEW ORDER
                          </span>
                        )}
                        {isPreparing && (
                          <span className="rounded border border-[#FCD34D] bg-[#FEF3C7] px-2 py-1 text-label-sm font-bold tracking-wider text-[#92400E]">
                            PREPARING
                          </span>
                        )}
                        {isReady && (
                          <span className="flex items-center gap-inset-base rounded border border-[#6EE7B7] bg-[#D1FAE5] px-2 py-1 text-label-sm font-bold tracking-wider text-[#065F46]">
                            <MaterialIcon name="check_circle" size={14} />
                            READY FOR PICKUP
                          </span>
                        )}
                        <span className="text-body-sm text-tertiary">
                          {isNew && formatTimeAgo(order.placed_at || order.created_at)}
                          {isPreparing &&
                            `Started ${formatTimeAgo(prepStart || order.placed_at)}`}
                          {isReady && readySince && `Ready for ${formatTimeAgo(readySince)}`}
                        </span>
                      </div>
                      <h2 className="text-headline-md font-semibold text-on-surface">
                        Order #{order.order_number}
                      </h2>
                    </div>

                    {!isPreparing && (
                      <div className="flex flex-col items-end gap-inset-base text-right">
                        <span className="text-headline-md font-bold text-on-surface">
                          {formatJmd(order.total)}
                        </span>
                        {order.delivery_address && (
                          <span className="flex items-center gap-inset-base rounded-full bg-surface-variant px-2 py-1 text-label-sm text-on-surface-variant">
                            <MaterialIcon name="local_shipping" size={14} />
                            Delivery
                          </span>
                        )}
                      </div>
                    )}

                    {isPreparing && prepStart && (
                      <div className="flex flex-col items-end gap-inset-base rounded-lg border border-outline-variant bg-surface-variant px-3 py-1.5">
                        <span className="text-label-sm uppercase text-tertiary">Prep Time</span>
                        <span className="font-mono text-headline-md font-semibold text-on-surface">
                          {formatElapsedTimer(prepStart)}
                        </span>
                      </div>
                    )}
                  </div>

                  {isNew && (
                    <>
                      <div className="mt-inset-xs flex items-center gap-inset-xs border-y border-surface-variant py-inset-xs pl-inset-xs">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container/20 text-label-md font-semibold text-secondary">
                          {getInitials(order.customer.name)}
                        </div>
                        <span className="text-body-sm font-medium text-on-surface">
                          {order.customer.name}
                        </span>
                      </div>

                      <div className="flex flex-col gap-inset-base pl-inset-xs">
                        {order.items.map((item, index) => {
                          const modifiers = getItemOptionLines(item);
                          return (
                            <div key={index}>
                              <p className="text-body-lg text-on-surface">
                                {item.quantity}x {item.name}
                              </p>
                              {modifiers.map((modifier) => (
                                <p
                                  key={modifier}
                                  className="ml-inset-xs flex items-center gap-inset-xs text-body-sm text-on-surface-variant"
                                >
                                  <span className="h-1 w-1 rounded-full bg-tertiary" />
                                  {modifier}
                                </p>
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-inset-xs flex gap-inset-sm pl-inset-xs" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => handleAcceptOrder(order.id)}
                          className="flex h-inset-xl flex-1 items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
                        >
                          ACCEPT ORDER
                        </button>
                        <button
                          type="button"
                          disabled={updateStatusMutation.isPending}
                          onClick={() => handleOpenReject(order.id)}
                          className="flex h-inset-xl items-center justify-center rounded-lg border border-outline-variant px-inset-lg text-label-md font-semibold text-tertiary transition-all hover:bg-surface-variant active:scale-95 disabled:opacity-50"
                        >
                          REJECT
                        </button>
                      </div>
                    </>
                  )}

                  {isPreparing && (
                    <>
                      <div className="mt-inset-xs flex flex-col gap-inset-base border-t border-surface-variant pt-inset-xs pl-inset-xs">
                        {order.items.map((item, index) => (
                          <p key={index} className="text-body-lg text-on-surface">
                            {item.quantity}x {item.name}
                          </p>
                        ))}
                      </div>
                      <div className="mt-inset-xs flex gap-inset-sm pl-inset-xs" onClick={(e) => e.stopPropagation()}>
                        {order.status === 'accepted' ? (
                          <button
                            type="button"
                            disabled={updateStatusMutation.isPending}
                            onClick={() => setAcceptedOrderId(order.id)}
                            className="flex h-inset-xl flex-1 items-center justify-center rounded-lg border-2 border-primary-container text-label-md font-semibold text-primary-container transition-all hover:bg-primary-container/10 active:scale-95 disabled:opacity-50"
                          >
                            START PREPARING
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={updateStatusMutation.isPending}
                            onClick={() =>
                              updateStatusMutation.mutate({ orderId: order.id, status: 'ready' })
                            }
                            className="flex h-inset-xl flex-1 items-center justify-center rounded-lg border-2 border-primary-container text-label-md font-semibold text-primary-container transition-all hover:bg-primary-container/10 active:scale-95 disabled:opacity-50"
                          >
                            MARK READY FOR PICKUP
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {isReady && (
                    <div className="mt-inset-xs flex items-center justify-between rounded-lg border border-surface-variant bg-surface-container-low p-inset-xs pl-inset-xs">
                      <div className="flex items-center gap-inset-xs">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface text-primary">
                          <MaterialIcon name="two_wheeler" size={18} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-label-md font-semibold text-on-surface">
                            Courier: Assigning soon
                          </span>
                          <span className="text-body-sm font-medium text-primary-container">
                            Waiting for pickup
                          </span>
                        </div>
                      </div>
                      {order.customer.phone && (
                        <a
                          href={`tel:${order.customer.phone}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition-colors hover:bg-surface-variant"
                          aria-label="Call customer"
                        >
                          <MaterialIcon name="call" />
                        </a>
                      )}
                    </div>
                  )}
                </article>
                </SwipeableOrderCard>
              );
            })
          )}
        </div>
        )}
      </main>

      {detailOrder?.status === 'placed' && (
        <FirstOrderCelebrationView
          open={Boolean(detailOrderId && showFirstOrderCelebration)}
          onViewOrder={handleViewOrderFromCelebration}
        />
      )}

      {detailOrder?.status === 'placed' && (
        <div className="lg:hidden">
        <NewOrderAlertView
          order={detailOrder}
          open={Boolean(detailOrderId && !showOrderDetail && !showFirstOrderCelebration)}
          onAccept={handleAcceptOrder}
          onViewOrder={() => setShowOrderDetail(true)}
          onHelp={() =>
            toast.info('Help Center', {
              description: 'Contact dispatch from Account → Help & Support.',
            })
          }
          isSubmitting={updateStatusMutation.isPending}
        />
        </div>
      )}

      <NewOrderDetailSheet
        order={detailOrder?.status === 'placed' ? detailOrder : null}
        open={Boolean(detailOrderId && showOrderDetail && detailOrder?.status === 'placed')}
        onClose={() => setShowOrderDetail(false)}
        onAccept={handleAcceptOrder}
        onReject={handleOpenReject}
        isSubmitting={updateStatusMutation.isPending}
        avgPrepTimeMins={merchant.avg_prep_time_mins}
      />

      <RejectOrderSheet
        open={Boolean(rejectOrderId)}
        onClose={() => setRejectOrderId(null)}
        onConfirm={handleConfirmReject}
        isSubmitting={updateStatusMutation.isPending}
      />

      <OrderAcceptedSheet
        open={Boolean(acceptedOrderId)}
        orderNumber={
          acceptedOrder?.order_number ??
          activeOrders.find((o) => o.id === acceptedOrderId)?.order_number ??
          allOrders.find((o) => o.id === acceptedOrderId)?.order_number ??
          ''
        }
        defaultPrepTimeMins={merchant.avg_prep_time_mins}
        onStartPreparing={handleStartPreparing}
        isSubmitting={updateStatusMutation.isPending}
      />

      {viewOrderId && (
        <OrderDetailPage
          orderId={viewOrderId}
          merchant={merchant}
          onBack={() => setViewOrderId(null)}
          onReject={handleOpenReject}
        />
      )}

      <PayoutSetupSheet
        open={showPayoutSetup}
        onClose={handleDismissPayoutSetup}
        onSaved={() => setShowPayoutSetup(false)}
      />
    </div>
    </>
  );
}
