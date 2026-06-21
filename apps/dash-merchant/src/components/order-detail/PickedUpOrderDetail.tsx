import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd } from '../../lib/partner-utils';
import { formatTime, getDurationMinutes, getItemModifiersText } from '../../lib/order-utils';
import { Order } from '../../types/order';

interface PickedUpOrderDetailProps {
  order: Order;
  onBack: () => void;
  onClose: () => void;
}

export default function PickedUpOrderDetail({ order, onBack, onClose }: PickedUpOrderDetailProps) {
  const prepStart = order.preparing_at || order.accepted_at;
  const prepTaken =
    prepStart && order.picked_up_at
      ? getDurationMinutes(prepStart, order.picked_up_at)
      : order.estimated_prep_time_mins ?? null;

  return (
    <div className="min-h-dvh bg-background pb-inset-xl text-on-background antialiased">
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm">
        <div className="flex items-center gap-inset-sm">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-all hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <div className="flex items-center gap-2">
            <MaterialIcon name="storefront" filled className="text-primary" />
            <span className="text-headline-md font-bold text-primary">Roam Dash Merchant</span>
          </div>
        </div>
        <button
          type="button"
          className="rounded-full px-3 py-2 text-label-md font-semibold text-primary transition-colors hover:bg-surface-container-low active:scale-95"
        >
          Open
        </button>
      </header>

      <main className="mx-auto flex max-w-lg flex-col gap-inset-sm px-margin-mobile py-margin-mobile">
        <div className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
          <div className="flex flex-col">
            <span className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
              Order Details
            </span>
            <h1 className="text-headline-lg-mobile font-bold text-on-surface">
              #{order.order_number}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface-container-highest px-3 py-1.5">
            <MaterialIcon name="check_circle" size={16} />
            <span className="text-label-md font-semibold uppercase tracking-wider text-on-surface">
              Picked Up
            </span>
          </div>
        </div>

        <div className="relative flex flex-col gap-inset-sm overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
          <div className="absolute right-0 top-0 -z-10 h-32 w-32 rounded-bl-full bg-primary/5" />
          <div className="flex items-center justify-between border-b border-surface-container pb-3">
            <div className="flex items-center gap-2">
              <MaterialIcon name="two_wheeler" className="text-outline" />
              <span className="text-label-md font-semibold uppercase text-on-surface-variant">
                Courier Status
              </span>
            </div>
            {order.picked_up_at && (
              <span className="text-body-sm text-on-surface-variant">
                Picked up at {formatTime(order.picked_up_at)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-inset-md pt-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant bg-surface-container-high">
              <MaterialIcon name="person" className="text-on-surface-variant" />
            </div>
            <div className="flex flex-1 flex-col">
              <span className="text-headline-md font-semibold text-on-surface">Marcus</span>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="h-2 w-2 animate-subtle-pulse rounded-full bg-primary-container" />
                <span className="text-body-sm text-on-surface-variant">En route to customer</span>
              </div>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant text-primary transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="call" />
            </button>
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
          <div className="mb-3 flex items-center gap-2 border-b border-surface-container pb-3">
            <MaterialIcon name="receipt_long" className="text-outline" />
            <span className="text-label-md font-semibold uppercase text-on-surface-variant">
              Order Summary
            </span>
          </div>
          <div className="flex flex-col gap-3 border-b border-dashed border-surface-container pb-4">
            {order.items.map((item, index) => (
              <div key={index} className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded bg-surface-container-high px-2 py-1 text-label-md font-semibold text-on-surface">
                    {item.quantity}x
                  </span>
                  <div className="flex flex-col">
                    <span className="text-body-lg text-on-surface">{item.name}</span>
                    {getItemModifiersText(item) && (
                      <span className="text-body-sm text-on-surface-variant">
                        {getItemModifiersText(item)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-body-lg font-medium text-on-surface">
                  {formatJmd(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-b border-surface-container py-4">
            <div className="flex items-center justify-between">
              <span className="text-body-sm text-on-surface-variant">Order received</span>
              <span className="text-body-sm text-on-surface-variant">
                {formatTime(order.placed_at || order.created_at)}
              </span>
            </div>
            {prepTaken != null && (
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-on-surface-variant">Prep time taken</span>
                <span className="text-body-sm font-medium text-on-surface">{prepTaken} min</span>
              </div>
            )}
          </div>
          <div className="flex items-end justify-between pt-4">
            <span className="text-headline-md font-semibold text-on-surface">Total</span>
            <span className="text-headline-lg-mobile font-bold text-primary">
              {formatJmd(order.total)}
            </span>
          </div>
        </div>

        <div className="mb-inset-lg mt-inset-md">
          <p className="mb-3 text-center text-body-sm text-on-surface-variant">
            This order will be moved to your completed history.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-label-md font-semibold uppercase tracking-widest text-on-primary transition-all hover:bg-surface-tint hover:shadow-md active:scale-[0.98]"
          >
            <MaterialIcon name="done_all" />
            Close Order
          </button>
        </div>
      </main>
    </div>
  );
}
