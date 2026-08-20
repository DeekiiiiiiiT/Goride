import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { getItemOptionLines, Order } from '../../../types/order';
import type { OrderChannel } from '../../../types/restaurant-mgmt';
import OrderChannelChip from '../../restaurant-mgmt/OrderChannelChip';
import HandledByLabel from '../shared/HandledByLabel';
import OrderElapsedTimer from '../shared/OrderElapsedTimer';

interface KitchenTicketCardProps {
  order: Order;
  selected?: boolean;
  showChannelBadge?: boolean;
  onSelect: () => void;
}

export default function KitchenTicketCard({
  order,
  selected,
  showChannelBadge,
  onSelect,
}: KitchenTicketCardProps) {
  const startedAt = order.accepted_at || order.placed_at || order.created_at;
  const statusLabel = order.status === 'accepted' ? 'Accepted' : 'Preparing';

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border p-inset-md text-left transition-colors ${
        selected
          ? 'border-primary-container bg-primary-container/10'
          : 'border-outline-variant bg-surface-container-lowest'
      }`}
    >
      <div className="flex items-center justify-between gap-inset-sm">
        <div>
          <p className="text-headline-md font-bold text-on-background">#{order.order_number}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className="inline-block rounded-full bg-surface-variant px-2 py-0.5 text-label-sm font-semibold uppercase text-on-surface-variant">
              {statusLabel}
            </span>
            {showChannelBadge && order.channel && (
              <OrderChannelChip channel={order.channel as OrderChannel} />
            )}
          </div>
        </div>
        <OrderElapsedTimer startedAt={startedAt} className="text-lg text-primary-container" />
      </div>
      <ul className="mt-inset-sm space-y-1 text-body-sm text-on-surface">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span className="font-semibold">{item.quantity}x</span> {item.name}
          </li>
        ))}
      </ul>
      <div className="mt-inset-xs">
        <HandledByLabel
          name={order.lastHandledBy?.name}
          at={order.lastHandledBy?.at}
          action={order.lastHandledBy?.action}
        />
      </div>
    </button>
  );
}

interface KitchenTicketDetailProps {
  order: Order | null;
  onStartPreparing?: () => void;
  onMarkReady?: () => void;
  isSubmitting?: boolean;
}

export function KitchenTicketDetail({
  order,
  onStartPreparing,
  onMarkReady,
  isSubmitting,
}: KitchenTicketDetailProps) {
  if (!order) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant p-inset-lg text-center text-on-surface-variant">
        <MaterialIcon name="restaurant" className="mb-2 text-4xl opacity-50" />
        <p className="text-body-lg font-semibold">Select a ticket</p>
        <p className="text-body-sm">Oldest orders appear first</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-lg">
      <div className="mb-inset-md flex items-center justify-between">
        <h2 className="text-headline-lg font-bold text-on-background">#{order.order_number}</h2>
        <OrderElapsedTimer
          startedAt={order.accepted_at || order.placed_at || order.created_at}
          className="text-xl text-primary-container"
        />
      </div>

      {order.delivery_instructions && (
        <div className="mb-inset-md rounded-lg border border-secondary-container/30 bg-secondary-container/10 p-inset-sm">
          <p className="text-label-md font-semibold text-secondary-container">Customer note</p>
          <p className="text-body-sm text-on-surface">{order.delivery_instructions}</p>
        </div>
      )}

      <ul className="flex-1 space-y-inset-sm overflow-y-auto">
        {order.items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="border-b border-outline-variant/40 pb-inset-sm">
            <p className="text-headline-md font-bold text-on-background">
              {item.quantity}x {item.name}
            </p>
            {getItemOptionLines(item).map((line) => (
              <p key={line} className="text-body-sm text-on-surface-variant">
                {line}
              </p>
            ))}
          </li>
        ))}
      </ul>

      <div className="mt-inset-md space-y-inset-xs">
        {order.status === 'accepted' && onStartPreparing && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onStartPreparing}
            className="min-h-[56px] w-full rounded-lg border-2 border-primary-container text-body-lg font-semibold text-primary-container"
          >
            Start preparing
          </button>
        )}
        {(order.status === 'accepted' || order.status === 'preparing') && onMarkReady && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onMarkReady}
            className="min-h-[56px] w-full rounded-lg bg-primary-container text-body-lg font-semibold text-on-primary"
          >
            Mark order ready
          </button>
        )}
      </div>
    </div>
  );
}
