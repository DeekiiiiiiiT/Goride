import { useMemo } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd, formatMinAgo } from '../../lib/partner-utils';
import { formatTime } from '../../lib/order-utils';
import { getItemOptionLines, Order } from '../../types/order';
import { Merchant } from '../../hooks/useMerchant';

interface OrdersDesktopDashboardProps {
  merchant: Merchant;
  queueOrders: Order[];
  selectedOrderId: string | null;
  onSelectOrder: (orderId: string) => void;
  isLoading: boolean;
  newCount: number;
  prepCount: number;
  stats: {
    ordersToday: number;
    revenue: number;
    avgPrepMins: number;
  };
  onReject: (orderId: string) => void;
  onStartPreparing: (orderId: string) => void;
  onMarkReady: (orderId: string) => void;
  onContactSupport: () => void;
  isSubmitting?: boolean;
}

function getStatusBadge(order: Order) {
  if (order.status === 'placed') {
    return {
      label: 'New',
      className: 'bg-primary-container text-on-primary-container',
    };
  }
  if (['accepted', 'preparing'].includes(order.status)) {
    return {
      label: 'Preparing',
      className:
        'bg-tertiary-container text-on-tertiary-container border border-tertiary-fixed-dim',
    };
  }
  if (order.status === 'ready') {
    return {
      label: 'Ready',
      className: 'bg-primary-fixed text-on-primary-fixed',
    };
  }
  return {
    label: order.status,
    className: 'bg-surface-variant text-on-surface-variant',
  };
}

function getEstPickupTime(order: Order, fallbackPrepMins: number) {
  const base = order.accepted_at || order.placed_at || order.created_at;
  const prepMins = order.estimated_prep_time_mins ?? fallbackPrepMins;
  const pickup = new Date(new Date(base).getTime() + prepMins * 60000);
  return formatTime(pickup.toISOString());
}

export default function OrdersDesktopDashboard({
  merchant,
  queueOrders,
  selectedOrderId,
  onSelectOrder,
  isLoading,
  newCount,
  prepCount,
  stats,
  onReject,
  onStartPreparing,
  onMarkReady,
  onContactSupport,
  isSubmitting = false,
}: OrdersDesktopDashboardProps) {
  const selectedOrder = useMemo(
    () => queueOrders.find((order) => order.id === selectedOrderId) ?? queueOrders[0] ?? null,
    [queueOrders, selectedOrderId],
  );

  const itemCount = (order: Order) =>
    order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  const packagingFee = selectedOrder
    ? Math.max(0, selectedOrder.total - selectedOrder.subtotal - (selectedOrder.delivery_fee || 0))
    : 0;

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 gap-inset-md overflow-x-auto border-b border-outline-variant bg-surface px-margin-tablet py-inset-sm">
        <div className="group relative min-w-[200px] flex-1 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm transition-shadow hover:shadow-sm">
          <span className="text-label-md font-semibold uppercase text-on-surface-variant">
            Today&apos;s Orders
          </span>
          <span className="mt-1 block text-headline-lg font-bold text-on-surface">
            {stats.ordersToday}
          </span>
          <div className="pointer-events-none absolute bottom-0 right-0 text-primary-container opacity-10 transition-transform group-hover:scale-110">
            <MaterialIcon name="receipt_long" size={64} />
          </div>
        </div>
        <div className="group relative min-w-[200px] flex-1 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm transition-shadow hover:shadow-sm">
          <span className="text-label-md font-semibold uppercase text-on-surface-variant">
            Revenue
          </span>
          <span className="mt-1 block text-headline-lg font-bold text-on-surface">
            {formatJmd(stats.revenue)}
          </span>
          <div className="pointer-events-none absolute bottom-0 right-0 text-primary-container opacity-10 transition-transform group-hover:scale-110">
            <MaterialIcon name="payments" size={64} />
          </div>
        </div>
        <div className="group relative min-w-[200px] flex-1 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm transition-shadow hover:shadow-sm">
          <span className="text-label-md font-semibold uppercase text-on-surface-variant">
            Avg. Prep Time
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-headline-lg font-bold text-on-surface">{stats.avgPrepMins}</span>
            <span className="text-body-sm text-on-surface-variant">min</span>
          </div>
          <div className="pointer-events-none absolute bottom-0 right-0 text-primary-container opacity-10 transition-transform group-hover:scale-110">
            <MaterialIcon name="timer" size={64} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 gap-gutter overflow-hidden bg-surface-container-low p-gutter">
        <div className="flex w-[35%] min-w-[320px] flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface shadow-sm">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm">
            <h2 className="text-headline-md font-semibold text-on-surface">Queue</h2>
            <div className="flex gap-2">
              <span className="rounded-full bg-primary-container px-2 py-1 text-label-sm text-on-primary-container">
                {newCount} New
              </span>
              <span className="rounded-full bg-tertiary-container px-2 py-1 text-label-sm text-on-tertiary-container">
                {prepCount} Prep
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-inset-xs overflow-y-auto p-inset-sm">
            {isLoading ? (
              [1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-28 animate-pulse rounded-lg border border-outline-variant bg-surface-container-low"
                />
              ))
            ) : queueOrders.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <MaterialIcon name="receipt_long" className="mb-3 text-outline" size={40} />
                <p className="text-body-sm text-on-surface-variant">No active orders in queue</p>
              </div>
            ) : (
              queueOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const badge = getStatusBadge(order);
                const placedAt = order.placed_at || order.created_at;

                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onSelectOrder(order.id)}
                    className={`cursor-pointer rounded-lg p-inset-sm text-left transition-all ${
                      isSelected
                        ? 'border border-secondary-fixed-dim bg-secondary-fixed shadow-sm ring-1 ring-secondary-fixed-dim'
                        : 'border border-outline-variant bg-surface-container-lowest hover:border-outline hover:shadow-sm'
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between">
                      <span
                        className={`text-label-md font-semibold ${
                          isSelected ? 'text-on-secondary-fixed' : 'text-on-surface-variant'
                        }`}
                      >
                        #{order.order_number}
                      </span>
                      <span className="flex items-center gap-1 rounded border border-outline-variant bg-surface px-2 py-0.5 text-label-sm text-on-surface">
                        <MaterialIcon name="schedule" size={14} />
                        {formatMinAgo(placedAt)}
                      </span>
                    </div>
                    <div className="mb-1 text-headline-md font-semibold text-on-surface">
                      {order.customer.name}
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <span
                        className={`rounded-full px-3 py-1 text-label-md font-semibold uppercase tracking-wider ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-body-sm text-on-surface-variant">
                        {itemCount(order)} Item{itemCount(order) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex w-[65%] flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface shadow-sm">
          {!selectedOrder ? (
            <div className="flex flex-1 items-center justify-center p-12 text-center">
              <div>
                <MaterialIcon name="receipt_long" className="mx-auto mb-4 text-outline" size={48} />
                <p className="text-body-sm text-on-surface-variant">Select an order to view details</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start justify-between border-b border-outline-variant bg-surface-container-lowest px-inset-xl py-inset-md">
                <div>
                  <div className="mb-1 flex items-center gap-inset-xs">
                    <span className="text-headline-lg font-bold text-on-surface">
                      Order #{selectedOrder.order_number}
                    </span>
                    <span className="ml-inset-sm rounded-full bg-primary-container px-3 py-1 text-label-md font-semibold uppercase text-on-primary-container">
                      {getStatusBadge(selectedOrder).label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-body-lg text-on-surface-variant">
                    Placed at {formatTime(selectedOrder.placed_at || selectedOrder.created_at)} •{' '}
                    {selectedOrder.delivery_address ? 'Delivery' : 'Pickup'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-label-md font-semibold uppercase text-on-surface-variant">
                    Est. Pickup Time
                  </div>
                  <div className="mt-1 text-headline-md font-semibold text-primary">
                    {getEstPickupTime(selectedOrder, merchant.avg_prep_time_mins)}
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-inset-lg overflow-y-auto bg-surface px-inset-xl py-inset-md">
                <div className="grid grid-cols-2 gap-inset-md rounded-lg border border-outline-variant bg-surface-container-low p-inset-md">
                  <div className="flex items-center gap-inset-md border-r border-outline-variant pr-inset-md">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
                      <MaterialIcon name="person" size={24} />
                    </div>
                    <div>
                      <div className="mb-1 text-label-sm uppercase text-on-surface-variant">
                        Customer
                      </div>
                      <div className="text-headline-md font-semibold text-on-surface">
                        {selectedOrder.customer.name}
                      </div>
                      {selectedOrder.customer.phone && (
                        <a
                          href={`tel:${selectedOrder.customer.phone}`}
                          className="mt-1 flex items-center gap-1 text-primary transition-colors hover:text-primary-fixed-dim"
                        >
                          <MaterialIcon name="phone" size={16} />
                          <span className="text-label-md font-semibold">Contact Customer</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-inset-md pl-inset-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-variant text-on-surface-variant">
                      <MaterialIcon name="two_wheeler" size={24} />
                    </div>
                    <div>
                      <div className="mb-1 text-label-sm uppercase text-on-surface-variant">
                        Driver
                      </div>
                      <div className="text-headline-md font-semibold text-on-surface">
                        {selectedOrder.courier_id ? 'Assigned' : 'Assigning...'}
                      </div>
                      <div className="mt-1 text-body-sm text-on-surface-variant">
                        Roam Dash Network
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-inset-sm border-b border-outline-variant pb-2 text-label-md font-semibold uppercase text-on-surface-variant">
                    Order Items ({itemCount(selectedOrder)})
                  </h3>
                  <ul className="flex flex-col divide-y divide-outline-variant">
                    {selectedOrder.items.map((item, index) => {
                      const optionLines = getItemOptionLines(item);
                      const lineTotal = item.price * item.quantity;
                      const instruction = selectedOrder.delivery_instructions?.trim();

                      return (
                        <li
                          key={`${item.name}-${index}`}
                          className="-mx-2 flex items-start gap-inset-md rounded px-2 py-inset-md transition-colors hover:bg-surface-container-low"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-outline-variant bg-surface-variant text-headline-md font-semibold text-on-surface-variant">
                            {item.quantity}x
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <h4 className="text-headline-md font-semibold text-on-surface">
                                {item.name}
                              </h4>
                              <span className="text-body-lg text-on-surface">
                                {formatJmd(item.price)}
                              </span>
                            </div>
                            {optionLines.length > 0 && (
                              <div className="mt-1 text-body-sm text-on-surface-variant">
                                {optionLines.map((line) => (
                                  <div key={line}>• {line}</div>
                                ))}
                              </div>
                            )}
                            {index === 0 && instruction && (
                              <div className="mt-2 flex items-start gap-2 rounded border border-error/20 bg-error-container p-inset-sm text-on-error-container">
                                <MaterialIcon name="warning" size={18} className="mt-[2px]" />
                                <span className="text-body-sm font-medium">
                                  Special Instruction: &quot;{instruction}&quot;
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="w-24 text-right text-headline-md font-semibold text-on-surface">
                            {formatJmd(lineTotal)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="ml-auto w-full max-w-md border-t border-outline-variant pt-inset-md">
                  <div className="flex justify-between py-1 text-body-sm text-on-surface-variant">
                    <span>Subtotal</span>
                    <span>{formatJmd(selectedOrder.subtotal)}</span>
                  </div>
                  {packagingFee > 0 && (
                    <div className="flex justify-between py-1 text-body-sm text-on-surface-variant">
                      <span>Packaging Fee</span>
                      <span>{formatJmd(packagingFee)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between border-t border-outline-variant py-2 text-headline-md font-semibold text-on-surface">
                    <span>Total Payout</span>
                    <span>{formatJmd(selectedOrder.total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between border-t border-outline-variant bg-surface-container-lowest px-inset-xl py-inset-md">
                <button
                  type="button"
                  onClick={onContactSupport}
                  className="flex h-12 items-center gap-2 rounded-lg border border-outline px-inset-md py-3 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low active:scale-95"
                >
                  <MaterialIcon name="help" size={18} />
                  Contact Support
                </button>
                <div className="flex gap-inset-sm">
                  {selectedOrder.status === 'placed' && (
                    <>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => onReject(selectedOrder.id)}
                        className="h-12 rounded-lg border border-error px-inset-md py-3 text-label-md font-semibold text-error transition-colors hover:bg-error-container active:scale-95 disabled:opacity-50"
                      >
                        Reject Order
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => onStartPreparing(selectedOrder.id)}
                        className="flex h-12 items-center gap-2 rounded-lg bg-primary-container px-inset-xl py-3 text-label-md font-semibold text-on-primary-container shadow-sm transition-colors hover:bg-primary-fixed active:scale-95 disabled:opacity-50"
                      >
                        <MaterialIcon name="skillet" size={18} />
                        Start Preparing
                      </button>
                    </>
                  )}
                  {selectedOrder.status === 'accepted' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => onStartPreparing(selectedOrder.id)}
                      className="flex h-12 items-center gap-2 rounded-lg bg-primary-container px-inset-xl py-3 text-label-md font-semibold text-on-primary-container shadow-sm transition-colors hover:bg-primary-fixed active:scale-95 disabled:opacity-50"
                    >
                      <MaterialIcon name="skillet" size={18} />
                      Start Preparing
                    </button>
                  )}
                  {selectedOrder.status === 'preparing' && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => onMarkReady(selectedOrder.id)}
                      className="flex h-12 items-center gap-2 rounded-lg bg-primary-container px-inset-xl py-3 text-label-md font-semibold text-on-primary-container shadow-sm transition-colors hover:bg-primary-fixed active:scale-95 disabled:opacity-50"
                    >
                      <MaterialIcon name="check_circle" size={18} />
                      Mark Ready for Pickup
                    </button>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <span className="flex h-12 items-center gap-2 rounded-lg border border-primary-container px-inset-xl py-3 text-label-md font-semibold text-primary">
                      <MaterialIcon name="check_circle" size={18} />
                      Waiting for Pickup
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
