import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { formatJmd } from '../../../lib/partner-utils';
import { Order } from '../../../types/order';
import HandledByLabel from '../shared/HandledByLabel';
import OrderElapsedTimer from '../shared/OrderElapsedTimer';

interface CounterOrderCardProps {
  order: Order;
  onOpen?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onMarkReady?: () => void;
  onHandoff?: () => void;
  isSubmitting?: boolean;
}

function itemSummary(order: Order) {
  return order.items
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(', ');
}

export default function CounterOrderCard({
  order,
  onOpen,
  onAccept,
  onReject,
  onMarkReady,
  onHandoff,
  isSubmitting,
}: CounterOrderCardProps) {
  const startedAt = order.placed_at || order.created_at;

  return (
    <article className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start justify-between gap-inset-sm">
          <div>
            <p className="text-label-md uppercase tracking-wide text-on-surface-variant">
              Order #{order.order_number}
            </p>
            <p className="text-headline-md font-bold text-on-background">{formatJmd(order.total)}</p>
          </div>
          <OrderElapsedTimer startedAt={startedAt} className="text-primary-container" />
        </div>
        <p className="mt-inset-xs text-body-sm text-on-surface-variant">{itemSummary(order)}</p>
        <div className="mt-inset-xs">
          <HandledByLabel
            name={order.lastHandledBy?.name}
            at={order.lastHandledBy?.at}
            action={order.lastHandledBy?.action}
          />
        </div>
      </button>

      <div className="mt-inset-md flex flex-wrap gap-inset-xs">
        {order.status === 'placed' && onAccept && onReject && (
          <>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onReject}
              className="min-h-[48px] flex-1 rounded-lg border border-error text-body-sm font-semibold text-error"
            >
              Reject
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onAccept}
              className="min-h-[48px] flex-1 rounded-lg bg-primary-container text-body-sm font-semibold text-on-primary"
            >
              Accept
            </button>
          </>
        )}
        {order.status === 'preparing' && onMarkReady && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onMarkReady}
            className="min-h-[48px] w-full rounded-lg bg-primary-container text-body-sm font-semibold text-on-primary"
          >
            Mark ready
          </button>
        )}
        {order.status === 'ready' && onHandoff && (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onHandoff}
            className="flex min-h-[48px] w-full items-center justify-center gap-1 rounded-lg bg-secondary-container text-body-sm font-semibold text-on-secondary"
          >
            <MaterialIcon name="delivery_dining" className="text-base" />
            Handed to driver
          </button>
        )}
      </div>
    </article>
  );
}
