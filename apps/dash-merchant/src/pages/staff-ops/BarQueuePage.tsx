import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { useMerchantActiveOrders } from '../../hooks/useMerchantActiveOrders';
import { useMerchantOrdersRealtime } from '../../hooks/useMerchantOrdersRealtime';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { useOrderStatusMutation } from '../../hooks/useOrderStatusMutation';
import { useMerchantMenu } from '../../hooks/useMerchantMenu';
import QueryErrorState from '../../components/QueryErrorState';
import KitchenTicketCard, {
  KitchenTicketDetail,
} from '../../components/staff-ops/kitchen/KitchenTicketCard';
import { CAPABILITY_IN_STORE, hasCapability } from '../../lib/merchant-capabilities';
import { useRestaurantSettings } from '../../hooks/useRestaurantSettings';
import {
  barQueueOrders,
  buildBarItemLookup,
  filterBarOrderItems,
} from '../../lib/staff-ops-order-filters';
import type { MerchantOrdersChannel } from '../../lib/merchant-orders-query';
import { Order } from '../../types/order';

interface BarQueuePageProps {
  merchant: Merchant;
  staffName?: string;
}

export default function BarQueuePage({ merchant, staffName }: BarQueuePageProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const isTabVisible = usePageVisibility();
  const showChannelBadge = hasCapability(merchant, CAPABILITY_IN_STORE);
  const restaurantSettings = useRestaurantSettings(merchant);
  const menuQuery = useMerchantMenu(merchant.id);
  const barLookup = useMemo(
    () =>
      buildBarItemLookup(menuQuery.data?.categories ?? [], menuQuery.data?.items ?? []),
    [menuQuery.data?.categories, menuQuery.data?.items],
  );
  const showInStore =
    showChannelBadge && Boolean(restaurantSettings.data?.showInStoreOnKitchen);
  const ordersChannel: MerchantOrdersChannel | undefined = showInStore ? 'all' : undefined;

  const { realtimeStatus } = useMerchantOrdersRealtime({ merchantId: merchant.id });
  const { orders, isLoading, isError, refetch, isInitialLoading } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: true,
    channel: ordersChannel,
  });

  const queue = useMemo(() => barQueueOrders(orders, barLookup), [orders, barLookup]);
  const selectedOrderRaw = selectedOrderId
    ? queue.find((order) => order.id === selectedOrderId) ?? null
    : queue[0] ?? null;
  const selectedOrder: Order | null = selectedOrderRaw
    ? {
        ...selectedOrderRaw,
        items: filterBarOrderItems(selectedOrderRaw.items, barLookup),
      }
    : null;

  const updateStatusMutation = useOrderStatusMutation({ merchantId: merchant.id });

  return (
    <div className="min-h-dvh bg-[#0f1a14] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-margin-mobile py-inset-md">
        <div>
          <h1 className="text-headline-md font-bold">Bar Queue</h1>
          <p className="text-label-sm text-white/70">
            {staffName ? `Signed in as ${staffName}` : merchant.name} · Drinks fulfillment
          </p>
        </div>
        <div className="rounded-full bg-emerald-700 px-3 py-1 text-label-md font-bold">
          {queue.length} ticket{queue.length === 1 ? '' : 's'}
        </div>
      </header>

      {isError ? (
        <QueryErrorState onRetry={() => void refetch()} />
      ) : isInitialLoading || isLoading ? (
        <p className="p-margin-mobile text-body-sm text-white/70">Loading bar queue…</p>
      ) : queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-margin-mobile py-16 text-center">
          <MaterialIcon name="local_bar" className="mb-3 text-5xl text-white/30" />
          <p className="text-body-lg font-semibold">Bar is clear</p>
          <p className="text-body-sm text-white/70">Drink tickets appear when orders are accepted</p>
        </div>
      ) : (
        <div className="grid gap-inset-md p-margin-mobile md:grid-cols-2 lg:grid-cols-3">
          {queue.map((order) => (
            <KitchenTicketCard
              key={order.id}
              order={{
                ...order,
                items: filterBarOrderItems(order.items, barLookup),
              }}
              selected={selectedOrderRaw?.id === order.id}
              showChannelBadge={showChannelBadge && Boolean(order.channel)}
              onSelect={() => setSelectedOrderId(order.id)}
            />
          ))}
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#16251c] p-margin-mobile shadow-xl">
          <KitchenTicketDetail
            order={selectedOrder}
            isSubmitting={updateStatusMutation.isPending}
            onStartPreparing={() => {
              if (!selectedOrderRaw) return;
              updateStatusMutation.mutate(
                { orderId: selectedOrderRaw.id, status: 'preparing' },
                { onSuccess: () => toast.success('Started drink prep') },
              );
            }}
            onMarkReady={() => {
              if (!selectedOrderRaw) return;
              updateStatusMutation.mutate(
                { orderId: selectedOrderRaw.id, status: 'ready' },
                { onSuccess: () => toast.success('Drinks ready for expo') },
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
