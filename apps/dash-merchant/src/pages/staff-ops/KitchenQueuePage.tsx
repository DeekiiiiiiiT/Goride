import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { PartnerTab } from '../../lib/partner-utils';
import PartnerDesktopShell from '../../components/layout/PartnerDesktopShell';
import { useAcceptingOrdersToggle } from '../../hooks/useAcceptingOrdersToggle';
import { useMerchantActiveOrders } from '../../hooks/useMerchantActiveOrders';
import { useMerchantOrdersRealtime } from '../../hooks/useMerchantOrdersRealtime';
import { usePageVisibility } from '../../hooks/usePageVisibility';
import { useOrderStatusMutation } from '../../hooks/useOrderStatusMutation';
import { useMerchantMenu } from '../../hooks/useMerchantMenu';
import QueryErrorState from '../../components/QueryErrorState';
import KitchenTicketCard, {
  KitchenTicketDetail,
} from '../../components/staff-ops/kitchen/KitchenTicketCard';
import EndShiftButton from '../../components/staff-ops/station/EndShiftButton';
import { CAPABILITY_IN_STORE, hasCapability } from '../../lib/merchant-capabilities';
import { useRestaurantSettings } from '../../hooks/useRestaurantSettings';
import {
  buildItemPrepStationLookup,
  filterOrderItemsForPrepStation,
  kitchenQueueForPrepStation,
  kitchenQueueOrders,
} from '../../lib/staff-ops-order-filters';
import { readFlag } from '../../lib/partner-feature-flags';
import { readDeviceSession } from '../../lib/store-tablet-session';
import { usePrepStations } from '../../hooks/usePrepStations';
import type { MerchantOrdersChannel } from '../../lib/merchant-orders-query';
import { Order } from '../../types/order';

interface KitchenQueuePageProps {
  merchant: Merchant;
  staffName?: string;
  prepStationId?: string | null;
  onNavigate?: (tab: PartnerTab) => void;
  onOpenMobileNav?: () => void;
  onEndShift?: () => void;
}

function kitchenQueue(
  orders: Order[],
  prepStationId: string | null | undefined,
  prepStationsEnabled: boolean,
  lookup: ReturnType<typeof buildItemPrepStationLookup>,
) {
  if (!prepStationsEnabled || !prepStationId) return kitchenQueueOrders(orders);
  return kitchenQueueForPrepStation(orders, prepStationId, lookup);
}

export default function KitchenQueuePage({
  merchant,
  staffName,
  prepStationId: prepStationIdProp,
  onNavigate,
  onOpenMobileNav,
  onEndShift,
}: KitchenQueuePageProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const isTabVisible = usePageVisibility();
  const { isAcceptingOrders, toggleAcceptingOrders } = useAcceptingOrdersToggle(merchant);
  const showChannelBadge = hasCapability(merchant, CAPABILITY_IN_STORE);
  const restaurantSettings = useRestaurantSettings(merchant);
  const prepStationsEnabled = readFlag(merchant.id, 'prepStationsV1');
  const deviceSession = readDeviceSession();
  const prepStationId =
    prepStationIdProp ?? deviceSession?.prepStationId ?? null;
  const { prepStations } = usePrepStations(merchant.id);
  const prepStationName = prepStationId
    ? prepStations.find((station) => station.id === prepStationId)?.name
    : null;
  const menuQuery = useMerchantMenu(prepStationsEnabled && prepStationId ? merchant.id : '');
  const itemPrepLookup = useMemo(
    () => buildItemPrepStationLookup(menuQuery.data?.items ?? []),
    [menuQuery.data?.items],
  );
  const showInStoreOnKitchen =
    showChannelBadge && Boolean(restaurantSettings.data?.showInStoreOnKitchen);
  const ordersChannel: MerchantOrdersChannel | undefined = showInStoreOnKitchen
    ? 'all'
    : undefined;

  const { realtimeStatus } = useMerchantOrdersRealtime({
    merchantId: merchant.id,
  });

  const { orders, isLoading, isError, refetch, isInitialLoading } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: true,
    channel: ordersChannel,
  });

  const queue = useMemo(
    () => kitchenQueue(orders, prepStationId, prepStationsEnabled, itemPrepLookup),
    [orders, prepStationId, prepStationsEnabled, itemPrepLookup],
  );
  const displayOrder = (order: Order | null) => {
    if (!order || !prepStationsEnabled || !prepStationId) return order;
    return {
      ...order,
      items: filterOrderItemsForPrepStation(order.items, prepStationId, itemPrepLookup),
    };
  };
  const selectedOrderRaw = selectedOrderId
    ? queue.find((order) => order.id === selectedOrderId) ?? null
    : queue[0] ?? null;
  const selectedOrder = displayOrder(selectedOrderRaw);

  const updateStatusMutation = useOrderStatusMutation({ merchantId: merchant.id });

  const header = (
    <header className="flex items-center justify-between border-b border-outline-variant/40 bg-[#1c1917] px-margin-mobile py-inset-md text-white lg:px-margin-tablet">
      <div>
        <button
          type="button"
          className="mb-1 flex items-center gap-1 text-label-md text-white/70 lg:hidden"
          onClick={onOpenMobileNav}
        >
          <MaterialIcon name="menu" />
          Menu
        </button>
        <h1 className="text-headline-md font-bold">
          {prepStationName ? `${prepStationName} Queue` : 'Kitchen Queue'}
        </h1>
        <p className="text-label-sm text-white/70">
          {staffName ? `Signed in as ${staffName}` : merchant.name}
          {prepStationName ? ` · ${prepStationName} prep station` : ''}
        </p>
      </div>
      <div className="flex items-center gap-inset-sm">
        {onEndShift && (
          <EndShiftButton merchantId={merchant.id} onEnded={onEndShift} />
        )}
        <div className="rounded-full bg-primary-container px-3 py-1 text-label-md font-bold text-on-primary">
          {queue.length} ticket{queue.length === 1 ? '' : 's'}
        </div>
      </div>
    </header>
  );

  const list = isError ? (
    <QueryErrorState onRetry={() => void refetch()} />
  ) : isInitialLoading || isLoading ? (
    <div className="p-margin-mobile text-body-sm text-on-surface-variant">Loading queue…</div>
  ) : queue.length === 0 ? (
    <div className="flex flex-col items-center justify-center px-margin-mobile py-16 text-center">
      <MaterialIcon name="soup_kitchen" className="mb-3 text-5xl text-on-surface-variant/40" />
      <p className="text-body-lg font-semibold text-on-background">Kitchen is clear</p>
      <p className="text-body-sm text-on-surface-variant">Accepted orders will show up here</p>
    </div>
  ) : (
    <div className="grid gap-inset-md p-margin-mobile lg:grid-cols-2 lg:px-margin-tablet xl:grid-cols-3">
      {queue.map((order) => (
        <KitchenTicketCard
          key={order.id}
          order={displayOrder(order)!}
          selected={selectedOrderRaw?.id === order.id}
          showChannelBadge={showChannelBadge && Boolean(order.channel)}
          onSelect={() => setSelectedOrderId(order.id)}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="hidden min-h-dvh bg-[#faf2ee] lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
        <PartnerDesktopShell
          merchant={merchant}
          activeNavKey="orders"
          onNavigate={(page) => onNavigate?.(page)}
          isAcceptingOrders={isAcceptingOrders}
          onToggleAcceptingOrders={toggleAcceptingOrders}
        >
          {header}
          <div className="flex-1 overflow-y-auto bg-[#faf2ee]">{list}</div>
        </PartnerDesktopShell>
        <aside className="border-l border-outline-variant/30 bg-surface p-inset-lg">
          <KitchenTicketDetail
            order={selectedOrder}
            isSubmitting={updateStatusMutation.isPending}
            onStartPreparing={() => {
              if (!selectedOrderRaw) return;
              updateStatusMutation.mutate(
                { orderId: selectedOrderRaw.id, status: 'preparing' },
                { onSuccess: () => toast.success('Started preparing') },
              );
            }}
            onMarkReady={() => {
              if (!selectedOrderRaw) return;
              updateStatusMutation.mutate(
                { orderId: selectedOrderRaw.id, status: 'ready' },
                { onSuccess: () => toast.success('Order ready for pickup') },
              );
            }}
          />
        </aside>
      </div>

      <div className="min-h-dvh bg-background lg:hidden">
        {header}
        {list}
        {selectedOrder && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface p-margin-mobile shadow-xl">
            <KitchenTicketDetail
              order={selectedOrder}
              isSubmitting={updateStatusMutation.isPending}
              onStartPreparing={() => {
                if (!selectedOrderRaw) return;
                updateStatusMutation.mutate(
                  { orderId: selectedOrderRaw.id, status: 'preparing' },
                  { onSuccess: () => toast.success('Started preparing') },
                );
              }}
              onMarkReady={() => {
                if (!selectedOrderRaw) return;
                updateStatusMutation.mutate(
                  { orderId: selectedOrderRaw.id, status: 'ready' },
                  { onSuccess: () => toast.success('Order ready') },
                );
              }}
            />
          </div>
        )}
      </div>
    </>
  );
}
