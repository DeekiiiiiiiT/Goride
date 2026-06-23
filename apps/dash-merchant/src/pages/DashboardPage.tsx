import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { toast } from 'sonner';
import { Merchant } from '../hooks/useMerchant';
import { useMerchantMenu } from '../hooks/useMerchantMenu';
import PartnerHeader from '../components/PartnerHeader';
import DashboardSimpleHeader from '../components/dashboard/DashboardSimpleHeader';
import StoreClosedView, { PendingAction } from '../components/dashboard/StoreClosedView';
import PoorPerformanceWarningSheet from '../components/PoorPerformanceWarningSheet';
import {
  acknowledgePerformanceWarning,
  computePerformanceMetrics,
  shouldShowPerformanceWarning,
} from '../lib/performance-metrics';
import {
  getStoreClosedSubtitle,
  MerchantHour,
  shouldShowStoreClosedView,
} from '../lib/business-hours-utils';
import PauseOrdersSheet, {
  PauseDuration,
  PauseOrdersPayload,
} from '../components/PauseOrdersSheet';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { formatElapsedTimer, formatJmd, formatTimeAgo, PartnerTab } from '../lib/partner-utils';

interface DashboardPageProps {
  merchant: Merchant;
  onNavigate: (page: PartnerTab) => void;
  onOpenMobileNav?: () => void;
}

interface OrderItem {
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  placed_at: string;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason?: string | null;
  cancelled_by?: string | null;
  items: OrderItem[];
  delivery_address?: string;
  customer: {
    name: string;
  };
}

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  icon: string;
  iconClass: string;
  filled?: boolean;
}

const SNAPSHOT_ICONS = [
  { key: 'orders', icon: 'receipt_long', label: 'Orders today' },
  { key: 'revenue', icon: 'payments', label: 'Revenue' },
  { key: 'prep', icon: 'timer', label: 'Avg prep time' },
  { key: 'rating', icon: 'star', label: 'Rating' },
] as const;

const PAUSE_DURATION_MS: Record<PauseDuration, number | null> = {
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  manual: null,
};

const PAUSE_DURATION_LABELS: Record<PauseDuration, string> = {
  '15m': '15 minutes',
  '30m': '30 minutes',
  '1h': '1 hour',
  '2h': '2 hours',
  manual: 'until you turn orders back on',
};

function pauseStorageKey(merchantId: string) {
  return `roam_partner_pause_until_${merchantId}`;
}

export default function DashboardPage({ merchant, onNavigate, onOpenMobileNav }: DashboardPageProps) {
  const [, setTick] = useState(0);
  const [pauseSheetOpen, setPauseSheetOpen] = useState(false);
  const [performanceWarningOpen, setPerformanceWarningOpen] = useState(false);
  const queryClient = useQueryClient();
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const setAcceptingOrders = async (isAccepting: boolean) => {
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
  };

  const pauseMutation = useMutation({
    mutationFn: async (payload: PauseOrdersPayload) => {
      await setAcceptingOrders(false);

      const durationMs = PAUSE_DURATION_MS[payload.duration];
      if (durationMs) {
        localStorage.setItem(pauseStorageKey(merchant.id), String(Date.now() + durationMs));
      } else {
        localStorage.removeItem(pauseStorageKey(merchant.id));
      }
    },
    onSuccess: (_data, payload) => {
      queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
      setPauseSheetOpen(false);
      toast.success(
        payload.duration === 'manual'
          ? 'Orders paused until you turn them back on'
          : `Orders paused for ${PAUSE_DURATION_LABELS[payload.duration]}`,
      );
    },
    onError: () => toast.error('Failed to pause orders'),
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      await setAcceptingOrders(true);
      localStorage.removeItem(pauseStorageKey(merchant.id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
      toast.success('Orders resumed — you are now accepting orders');
    },
    onError: () => toast.error('Failed to resume orders'),
  });

  useEffect(() => {
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }

    const stored = localStorage.getItem(pauseStorageKey(merchant.id));
    if (!stored || merchant.is_accepting_orders) return;

    const resumeAt = Number(stored);
    if (Number.isNaN(resumeAt)) return;

    const scheduleResume = (delay: number) => {
      resumeTimerRef.current = window.setTimeout(() => {
        resumeMutation.mutate();
      }, delay);
    };

    if (resumeAt <= Date.now()) {
      resumeMutation.mutate();
      return;
    }

    scheduleResume(resumeAt - Date.now());

    return () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current);
      }
    };
  }, [merchant.id, merchant.is_accepting_orders]);

  const { data: ordersData } = useQuery({
    queryKey: ['merchant-orders-all'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: deliveredHistoryData } = useQuery({
    queryKey: ['merchant-orders', 'history', 'delivered'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?status=delivered`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const { data: cancelledHistoryData } = useQuery({
    queryKey: ['merchant-orders', 'history', 'cancelled'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?status=cancelled`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const { data: hoursData } = useQuery({
    queryKey: ['merchant-hours', merchant.id],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/hours`);
      if (!res.ok) throw new Error('Failed to fetch hours');
      return res.json();
    },
  });

  const { data: menuData } = useMerchantMenu(merchant.id);

  const merchantHours: MerchantHour[] = hoursData?.hours || [];

  const handleStatusClick = () => {
    if (merchant.is_accepting_orders) {
      setPauseSheetOpen(true);
      return;
    }
    resumeMutation.mutate();
  };

  const activeOrders: Order[] = ordersData?.orders || [];
  const completedOrders: Order[] = deliveredHistoryData?.orders || [];
  const cancelledOrders: Order[] = cancelledHistoryData?.orders || [];

  const performanceMetrics = useMemo(() => {
    const merged = new Map<string, Order>();
    for (const order of [...activeOrders, ...completedOrders, ...cancelledOrders]) {
      merged.set(order.id, order);
    }
    return computePerformanceMetrics(
      completedOrders,
      cancelledOrders,
      [...merged.values()],
    );
  }, [activeOrders, completedOrders, cancelledOrders]);

  useEffect(() => {
    if (
      !performanceWarningOpen &&
      shouldShowPerformanceWarning(merchant.id, performanceMetrics)
    ) {
      setPerformanceWarningOpen(true);
    }
  }, [merchant.id, performanceMetrics, performanceWarningOpen]);

  const handleAcknowledgePerformance = () => {
    acknowledgePerformanceWarning(merchant.id);
    setPerformanceWarningOpen(false);
  };

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayOrders = activeOrders.filter((order) => {
      const orderDate = new Date(order.placed_at || order.created_at);
      return orderDate >= todayStart && order.status !== 'cancelled';
    });

    const todayRevenue = todayOrders.reduce((sum, order) => sum + order.total, 0);

    return {
      ordersToday: todayOrders.length,
      revenue: todayRevenue,
      avgPrep: merchant.avg_prep_time_mins || 18,
      rating: merchant.rating?.toFixed(1) || '—',
    };
  }, [activeOrders, merchant.avg_prep_time_mins, merchant.rating]);

  const newOrders = activeOrders.filter((order) => order.status === 'placed');
  const preparingOrders = activeOrders.filter((order) =>
    ['accepted', 'preparing'].includes(order.status),
  );

  const previewOrders = useMemo(() => {
    const prioritized = [...newOrders, ...preparingOrders].slice(0, 2);
    return prioritized.map((order) => {
      const itemCount = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
      const isNew = order.status === 'placed';
      const timerFrom =
        order.preparing_at || order.accepted_at || order.placed_at || order.created_at;

      return {
        id: order.id,
        number: order.order_number,
        itemCount,
        type: order.delivery_address ? 'Delivery' : 'Pickup',
        isNew,
        timer: formatElapsedTimer(timerFrom),
        timerUrgent: isNew,
      };
    });
  }, [newOrders, preparingOrders]);

  const recentActivity: ActivityItem[] = useMemo(() => {
    const delivered = activeOrders
      .filter((order) => order.status === 'delivered' && order.delivered_at)
      .slice(0, 2)
      .map((order) => ({
        id: order.id,
        title: `Order ${order.order_number} picked up`,
        subtitle: 'Courier arrived and collected order',
        time: formatTimeAgo(order.delivered_at!),
        icon: 'local_mall',
        iconClass: 'bg-surface-variant text-on-surface-variant',
      }));

    const fallback: ActivityItem[] = [
      {
        id: 'review',
        title: 'New 5-star review',
        subtitle: '"Food was hot and amazing!"',
        time: '1h ago',
        icon: 'star',
        iconClass: 'bg-secondary-container/20 text-secondary',
        filled: true,
      },
      {
        id: 'sold-out',
        title: 'Item marked Sold Out',
        subtitle: 'Spicy Chicken Sandwich',
        time: '2h ago',
        icon: 'inventory_2',
        iconClass: 'bg-surface-variant text-on-surface-variant',
      },
    ];

    return [...delivered, ...fallback].slice(0, 3);
  }, [activeOrders]);

  const snapshotValues = {
    orders: String(stats.ordersToday),
    revenue: formatJmd(stats.revenue),
    prep: (
      <>
        {stats.avgPrep} <span className="text-body-sm font-normal text-on-surface-variant">min</span>
      </>
    ),
    rating: stats.rating,
  };

  const showClosedView = shouldShowStoreClosedView(
    merchant.is_accepting_orders,
    merchantHours,
  );

  const pendingActions = useMemo((): PendingAction[] => {
    const actions: PendingAction[] = [];

    activeOrders
      .filter((order) => order.status === 'cancelled')
      .slice(0, 2)
      .forEach((order) => {
        actions.push({
          id: `order-${order.id}`,
          type: 'order',
          title: `Resolve Order #${order.order_number}`,
          description:
            order.cancellation_reason?.trim() || 'Customer reported an issue with this order.',
        });
      });

    const unavailableItems = (menuData?.items || []).filter(
      (item: { is_available: boolean }) => !item.is_available,
    );

    unavailableItems.slice(0, 2).forEach((item: { id: string; name: string }) => {
      actions.push({
        id: `inventory-${item.id}`,
        type: 'inventory',
        title: 'Inventory Alert',
        description: `${item.name} is currently marked sold out.`,
      });
    });

    return actions.slice(0, 4);
  }, [activeOrders, menuData?.items]);

  const handlePendingActionClick = (action: PendingAction) => {
    if (action.type === 'order') {
      onNavigate('orders');
      return;
    }
    onNavigate('menu');
  };

  return (
    <div className="min-h-dvh bg-background font-body-lg text-on-background">
      {showClosedView ? (
        <DashboardSimpleHeader
          notificationCount={newOrders.length}
          onNotificationsClick={() => onNavigate('orders')}
          onOpenNav={onOpenMobileNav}
        />
      ) : (
        <PartnerHeader
          merchant={merchant}
          notificationCount={newOrders.length}
          onNotificationsClick={() => onNavigate('orders')}
          onSettingsClick={() => onNavigate('account')}
          onStatusClick={handleStatusClick}
          onOpenNav={onOpenMobileNav}
        />
      )}

      {showClosedView ? (
        <StoreClosedView
          opensLabel={getStoreClosedSubtitle(merchant.is_accepting_orders, merchantHours)}
          onOpenEarly={() => resumeMutation.mutate()}
          isOpening={resumeMutation.isPending}
          pendingActions={pendingActions}
          onActionClick={handlePendingActionClick}
        />
      ) : (
      <main className="mx-auto flex max-w-screen-xl flex-col gap-inset-md px-margin-mobile pt-inset-sm md:px-margin-tablet">
        {newOrders.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="partner-pulse-banner flex cursor-pointer items-center justify-between rounded-lg border border-primary-container p-inset-sm transition-transform active:scale-95"
          >
            <div className="flex items-center gap-inset-xs text-label-md font-semibold text-primary-container">
              <MaterialIcon name="notifications_active" filled />
              <span>
                {newOrders.length} new order{newOrders.length === 1 ? '' : 's'} waiting
              </span>
            </div>
            <MaterialIcon name="chevron_right" className="text-primary-container" />
          </button>
        )}

        <section>
          <h2 className="mb-inset-sm text-headline-md font-semibold text-on-surface">Today&apos;s Snapshot</h2>
          <div className="no-scrollbar flex gap-inset-sm overflow-x-auto pb-inset-xs">
            {SNAPSHOT_ICONS.map((card) => {
              const isRevenue = card.key === 'revenue';
              const content = (
                <>
                  <MaterialIcon name={card.icon} className="text-outline" />
                  <span className="text-label-md font-semibold text-on-surface-variant">{card.label}</span>
                  <span className="text-headline-lg-mobile font-bold text-on-surface">
                    {snapshotValues[card.key]}
                  </span>
                </>
              );

              if (isRevenue) {
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => onNavigate('earnings')}
                    className="flex min-w-[160px] shrink-0 flex-col gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm text-left shadow-sm transition-transform active:scale-95 hover:bg-surface-container-low"
                  >
                    {content}
                  </button>
                );
              }

              return (
                <div
                  key={card.key}
                  className="flex min-w-[160px] shrink-0 flex-col gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm"
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-3 gap-inset-xs">
          <button
            type="button"
            onClick={() => setPauseSheetOpen(true)}
            disabled={!merchant.is_accepting_orders}
            className="flex min-h-[80px] flex-col items-center justify-center gap-inset-xs rounded-lg border border-warning bg-warning/10 py-inset-sm text-label-md font-semibold text-[#d97706] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MaterialIcon name="pause_circle" />
            <span className="text-center">Pause Orders</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('menu')}
            className="flex min-h-[80px] flex-col items-center justify-center gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest py-inset-sm text-label-md font-semibold text-on-surface shadow-sm transition-transform active:scale-95"
          >
            <MaterialIcon name="restaurant_menu" />
            <span className="text-center">View Menu</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('menu')}
            className="flex min-h-[80px] flex-col items-center justify-center gap-inset-xs rounded-lg border border-outline-variant bg-surface-container-lowest py-inset-sm text-label-md font-semibold text-on-surface shadow-sm transition-transform active:scale-95"
          >
            <MaterialIcon name="inventory_2" />
            <span className="text-center">Sold Out</span>
          </button>
        </section>

        <section>
          <div className="mb-inset-sm flex items-end justify-between">
            <h2 className="text-headline-md font-semibold text-on-surface">Active Orders</h2>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="text-label-md font-semibold text-primary hover:underline"
            >
              View All
            </button>
          </div>

          <div className="flex flex-col gap-inset-sm">
            {previewOrders.length === 0 ? (
              <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md text-center text-body-sm text-on-surface-variant shadow-sm">
                No active orders right now.
              </div>
            ) : (
              previewOrders.map((order) => (
                <div
                  key={order.id}
                  className={`flex flex-col gap-inset-sm rounded-lg border bg-surface-container-lowest p-inset-sm shadow-sm ${
                    order.isNew ? 'border-primary-container' : 'border-outline-variant'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-headline-md font-semibold text-on-surface">
                        {order.number}
                      </span>
                      <span className="text-body-sm text-on-surface-variant">
                        {order.itemCount} item{order.itemCount === 1 ? '' : 's'} • {order.type}
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-1 rounded px-2 py-1 text-label-md font-semibold ${
                        order.timerUrgent
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-variant text-on-surface-variant'
                      }`}
                    >
                      <MaterialIcon name="timer" size={16} />
                      {order.timer}
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-outline-variant pt-inset-sm">
                    <span
                      className={`text-label-md font-semibold ${
                        order.isNew ? 'text-primary-container' : 'text-on-surface-variant'
                      }`}
                    >
                      {order.isNew ? 'NEW ORDER' : 'Preparing'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onNavigate('orders')}
                      className={`min-h-[48px] rounded-lg px-4 py-2 text-label-md font-semibold transition-transform active:scale-95 ${
                        order.isNew
                          ? 'bg-primary-container text-on-primary-container'
                          : 'border border-primary text-primary'
                      }`}
                    >
                      {order.isNew ? 'Accept Order' : 'Mark Ready'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-inset-sm text-headline-md font-semibold text-on-surface">Recent Activity</h2>
          <div className="flex flex-col gap-inset-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
            {recentActivity.map((activity, index) => (
              <div
                key={activity.id}
                className={`flex items-start gap-inset-sm ${
                  index < recentActivity.length - 1
                    ? 'border-b border-outline-variant pb-inset-sm'
                    : ''
                }`}
              >
                <div
                  className={`mt-1 flex items-center justify-center rounded-full p-2 ${activity.iconClass}`}
                >
                  <MaterialIcon name={activity.icon} filled={activity.filled} size={20} />
                </div>
                <div className="flex flex-1 flex-col">
                  <span className="text-body-lg text-on-surface">{activity.title}</span>
                  <span className="text-body-sm text-on-surface-variant">{activity.subtitle}</span>
                </div>
                <span className="text-label-sm text-on-surface-variant">{activity.time}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
      )}

      <PauseOrdersSheet
        open={pauseSheetOpen}
        onClose={() => setPauseSheetOpen(false)}
        onConfirm={(payload) => pauseMutation.mutate(payload)}
        isSubmitting={pauseMutation.isPending}
      />

      <PoorPerformanceWarningSheet
        open={performanceWarningOpen}
        metrics={performanceMetrics}
        onAcknowledge={handleAcknowledgePerformance}
        onGetHelp={() => {
          acknowledgePerformanceWarning(merchant.id);
          setPerformanceWarningOpen(false);
          onNavigate('account');
        }}
      />
    </div>
  );
}
