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
import { expoReadyOrders } from '../../lib/staff-ops-order-filters';
import type { MerchantOrdersChannel } from '../../lib/merchant-orders-query';
import OrderChannelChip from '../../components/restaurant-mgmt/OrderChannelChip';
import type { OrderChannel } from '../../types/restaurant-mgmt';
import OrderElapsedTimer from '../../components/staff-ops/shared/OrderElapsedTimer';

interface ExpoRunnerPageProps {
  merchant: Merchant;
  staffName?: string;
}

export default function ExpoRunnerPage({ merchant, staffName }: ExpoRunnerPageProps) {
  const isTabVisible = usePageVisibility();
  const showChannelBadge = hasCapability(merchant, CAPABILITY_IN_STORE);
  const restaurantSettings = useRestaurantSettings(merchant);
  const showInStore =
    showChannelBadge &&
    Boolean(restaurantSettings.data?.showInStoreOnCounter || restaurantSettings.data?.showInStoreOnKitchen);
  const ordersChannel: MerchantOrdersChannel | undefined = showInStore ? 'all' : undefined;

  const { realtimeStatus } = useMerchantOrdersRealtime({ merchantId: merchant.id });
  const { orders, isLoading, isError, refetch, isInitialLoading } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: true,
    channel: ordersChannel,
  });

  const queue = useMemo(() => expoReadyOrders(orders), [orders]);
  const updateStatusMutation = useOrderStatusMutation({ merchantId: merchant.id });

  return (
    <div className="min-h-dvh bg-background text-on-background">
      <header className="flex items-center justify-between border-b border-outline-variant px-margin-mobile py-inset-md">
        <div>
          <h1 className="text-headline-md font-bold">Expo Pass</h1>
          <p className="text-label-sm text-on-surface-variant">
            {staffName ? `Signed in as ${staffName}` : merchant.name} · Ready for handoff
          </p>
        </div>
        <div className="rounded-full bg-primary-container px-3 py-1 text-label-md font-bold text-on-primary-container">
          {queue.length} ready
        </div>
      </header>

      {isError ? (
        <QueryErrorState onRetry={() => void refetch()} />
      ) : isInitialLoading || isLoading ? (
        <p className="p-margin-mobile text-body-sm text-on-surface-variant">Loading staging…</p>
      ) : queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-margin-mobile py-16 text-center">
          <MaterialIcon name="room_service" className="mb-3 text-5xl text-on-surface-variant/40" />
          <p className="text-body-lg font-semibold">Nothing staged</p>
          <p className="text-body-sm text-on-surface-variant">
            Orders marked ready show here for runner calls
          </p>
        </div>
      ) : (
        <div className="grid gap-inset-md p-margin-mobile md:grid-cols-2">
          {queue.map((order) => (
            <article
              key={order.id}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm"
            >
              <div className="flex items-start justify-between gap-inset-sm">
                <div>
                  <p className="text-headline-md font-bold">#{order.order_number}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="rounded-full bg-primary-container/20 px-2 py-0.5 text-label-sm font-semibold text-primary-container">
                      Ready
                    </span>
                    {showChannelBadge && order.channel && (
                      <OrderChannelChip channel={order.channel as OrderChannel} />
                    )}
                  </div>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    {order.customer?.name ?? 'Guest'}
                    {order.fulfillment_type ? ` · ${order.fulfillment_type.replace('_', ' ')}` : ''}
                  </p>
                </div>
                <OrderElapsedTimer
                  startedAt={order.ready_at || order.placed_at || order.created_at}
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
              <button
                type="button"
                disabled={updateStatusMutation.isPending}
                onClick={() =>
                  updateStatusMutation.mutate(
                    { orderId: order.id, status: 'picked_up' },
                    { onSuccess: () => toast.success(`Order #${order.order_number} handed off`) },
                  )
                }
                className="mt-inset-md flex min-h-[44px] w-full items-center justify-center rounded-full bg-primary-container text-label-md font-semibold text-on-primary-container disabled:opacity-50"
              >
                Call runner · Mark handed off
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
