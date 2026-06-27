import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useMerchantActiveOrders } from '../../hooks/useMerchantActiveOrders';
import { useMerchantOrdersRealtime } from '../../hooks/useMerchantOrdersRealtime';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { useOrderStatusMutation } from '../../hooks/useOrderStatusMutation';
import QueryErrorState from '../../components/QueryErrorState';
import { CAPABILITY_IN_STORE, hasCapability } from '../../lib/merchant-capabilities';
import { useRestaurantSettings } from '../../hooks/useRestaurantSettings';
import { driveThruLaneOrders } from '../../lib/staff-ops-order-filters';
import type { MerchantOrdersChannel } from '../../lib/merchant-orders-query';
import OrderChannelChip from '../../components/restaurant-mgmt/OrderChannelChip';
import type { OrderChannel } from '../../types/restaurant-mgmt';
import OrderElapsedTimer from '../../components/staff-ops/shared/OrderElapsedTimer';

interface DriveThruLanePageProps {
  merchant: Merchant;
  staffName?: string;
}

type LaneTab = 'waiting' | 'preparing' | 'ready';

function laneTabForStatus(status: string): LaneTab {
  if (status === 'paid') return 'waiting';
  if (status === 'preparing') return 'preparing';
  return 'ready';
}

const TAB_LABELS: Record<LaneTab, string> = {
  waiting: 'At window',
  preparing: 'Preparing',
  ready: 'Complete',
};

export default function DriveThruLanePage({ merchant, staffName }: DriveThruLanePageProps) {
  const [tab, setTab] = useState<LaneTab>('waiting');
  const isTabVisible = usePageVisibility();
  const showChannelBadge = hasCapability(merchant, CAPABILITY_IN_STORE);
  const restaurantSettings = useRestaurantSettings(merchant);
  const showInStore = showChannelBadge && Boolean(restaurantSettings.data?.showInStoreOnCounter);
  const ordersChannel: MerchantOrdersChannel | undefined = showInStore ? 'all' : 'in_store';

  const { realtimeStatus } = useMerchantOrdersRealtime({ merchantId: merchant.id });
  const { orders, isLoading, isError, refetch, isInitialLoading } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: true,
    channel: ordersChannel,
  });

  const laneOrders = useMemo(() => driveThruLaneOrders(orders), [orders]);
  const filtered = useMemo(
    () => laneOrders.filter((order) => laneTabForStatus(order.status) === tab),
    [laneOrders, tab],
  );
  const updateStatusMutation = useOrderStatusMutation({ merchantId: merchant.id });

  return (
    <div className="min-h-dvh bg-background text-on-background">
      <header className="border-b border-outline-variant px-margin-mobile py-inset-md">
        <div className="flex items-center justify-between gap-inset-sm">
          <div>
            <h1 className="text-headline-md font-bold">Drive-thru Lane</h1>
            <p className="text-label-sm text-on-surface-variant">
              {staffName ? `Signed in as ${staffName}` : merchant.name} · Payment &amp; pickup status
            </p>
          </div>
          <MaterialIcon name="drive_eta" className="text-3xl text-primary-container" />
        </div>
        <div className="mt-inset-md flex flex-wrap gap-inset-sm">
          {(Object.keys(TAB_LABELS) as LaneTab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-label-md font-semibold ${
                tab === key
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              {TAB_LABELS[key]} (
              {laneOrders.filter((order) => laneTabForStatus(order.status) === key).length})
            </button>
          ))}
        </div>
      </header>

      {isError ? (
        <QueryErrorState onRetry={() => void refetch()} />
      ) : isInitialLoading || isLoading ? (
        <p className="p-margin-mobile text-body-sm text-on-surface-variant">Loading lane…</p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-margin-mobile py-16 text-center">
          <MaterialIcon name="drive_eta" className="mb-3 text-5xl text-on-surface-variant/40" />
          <p className="text-body-lg font-semibold">Lane clear</p>
          <p className="text-body-sm text-on-surface-variant">
            In-store drive-thru and pickup orders show here
          </p>
        </div>
      ) : (
        <div className="grid gap-inset-md p-margin-mobile md:grid-cols-2">
          {filtered.map((order) => (
            <article
              key={order.id}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm"
            >
              <div className="flex items-start justify-between gap-inset-sm">
                <div>
                  <p className="text-headline-md font-bold">#{order.order_number}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="rounded-full bg-surface-variant px-2 py-0.5 text-label-sm font-semibold uppercase">
                      {order.status}
                    </span>
                    {showChannelBadge && order.channel && (
                      <OrderChannelChip channel={order.channel as OrderChannel} />
                    )}
                  </div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    {order.customer?.name ?? 'Guest'} · ${order.total.toFixed(2)}
                  </p>
                </div>
                <OrderElapsedTimer
                  startedAt={order.placed_at || order.created_at}
                  className="text-lg text-primary-container"
                />
              </div>
              <ul className="mt-inset-sm space-y-1 text-body-sm">
                {order.items.map((item, index) => (
                  <li key={`${item.name}-${index}`}>
                    <span className="font-semibold">{item.quantity}x</span> {item.name}
                  </li>
                ))}
              </ul>
              {tab === 'waiting' && (
                <button
                  type="button"
                  disabled={updateStatusMutation.isPending}
                  onClick={() =>
                    updateStatusMutation.mutate(
                      { orderId: order.id, status: 'preparing' },
                      { onSuccess: () => toast.success('Order sent to kitchen') },
                    )
                  }
                  className="mt-inset-md flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary-container text-label-md font-semibold text-on-primary-container disabled:opacity-50"
                >
                  Send to kitchen
                </button>
              )}
              {tab === 'ready' && (
                <button
                  type="button"
                  disabled={updateStatusMutation.isPending}
                  onClick={() =>
                    updateStatusMutation.mutate(
                      { orderId: order.id, status: 'picked_up' },
                      { onSuccess: () => toast.success('Order complete') },
                    )
                  }
                  className="mt-inset-md flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary-container text-label-md font-semibold text-on-primary-container disabled:opacity-50"
                >
                  Complete order
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
