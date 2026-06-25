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
import QueryErrorState from '../../components/QueryErrorState';
import KitchenTicketCard, {
  KitchenTicketDetail,
} from '../../components/staff-ops/kitchen/KitchenTicketCard';
import { Order } from '../../types/order';

interface KitchenQueuePageProps {
  merchant: Merchant;
  onNavigate?: (tab: PartnerTab) => void;
  onOpenMobileNav?: () => void;
}

function kitchenQueue(orders: Order[]) {
  return orders
    .filter((order) => order.status === 'accepted' || order.status === 'preparing')
    .sort(
      (a, b) =>
        new Date(a.accepted_at || a.placed_at || a.created_at).getTime() -
        new Date(b.accepted_at || b.placed_at || b.created_at).getTime(),
    );
}

export default function KitchenQueuePage({
  merchant,
  onNavigate,
  onOpenMobileNav,
}: KitchenQueuePageProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const isTabVisible = usePageVisibility();
  const { isAcceptingOrders, toggleAcceptingOrders } = useAcceptingOrdersToggle(merchant);

  const { realtimeStatus } = useMerchantOrdersRealtime({
    merchantId: merchant.id,
  });

  const { orders, isLoading, isError, refetch, isInitialLoading } = useMerchantActiveOrders({
    realtimeStatus,
    isTabVisible,
    enabled: true,
  });

  const queue = useMemo(() => kitchenQueue(orders), [orders]);
  const selectedOrder = selectedOrderId
    ? queue.find((order) => order.id === selectedOrderId) ?? null
    : queue[0] ?? null;

  const updateStatusMutation = useOrderStatusMutation();

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
        <h1 className="text-headline-md font-bold">Kitchen Queue</h1>
        <p className="text-label-sm text-white/70">{merchant.name}</p>
      </div>
      <div className="rounded-full bg-primary-container px-3 py-1 text-label-md font-bold text-on-primary">
        {queue.length} ticket{queue.length === 1 ? '' : 's'}
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
          order={order}
          selected={selectedOrder?.id === order.id}
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
              if (!selectedOrder) return;
              updateStatusMutation.mutate(
                { orderId: selectedOrder.id, status: 'preparing' },
                { onSuccess: () => toast.success('Started preparing') },
              );
            }}
            onMarkReady={() => {
              if (!selectedOrder) return;
              updateStatusMutation.mutate(
                { orderId: selectedOrder.id, status: 'ready' },
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
                updateStatusMutation.mutate(
                  { orderId: selectedOrder.id, status: 'preparing' },
                  { onSuccess: () => toast.success('Started preparing') },
                );
              }}
              onMarkReady={() => {
                updateStatusMutation.mutate(
                  { orderId: selectedOrder.id, status: 'ready' },
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
