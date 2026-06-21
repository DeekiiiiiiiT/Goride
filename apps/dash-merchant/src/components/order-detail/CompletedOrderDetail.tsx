import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd } from '../../lib/partner-utils';
import {
  formatCompletedAt,
  formatTime,
  getDurationMinutes,
  TIMELINE_STEPS,
} from '../../lib/order-utils';
import { Order } from '../../types/order';

interface CompletedOrderDetailProps {
  order: Order;
  onBack: () => void;
}

export default function CompletedOrderDetail({ order, onBack }: CompletedOrderDetailProps) {
  const completedAt = order.delivered_at || order.picked_up_at;
  const prepStart = order.preparing_at || order.accepted_at;
  const prepMins =
    prepStart && order.ready_at ? getDurationMinutes(prepStart, order.ready_at) : null;
  const deliveryMins =
    order.placed_at && order.delivered_at
      ? getDurationMinutes(order.placed_at, order.delivered_at)
      : null;
  const platformFee = order.platform_fee ?? Math.round(order.subtotal * 0.05);
  const earnings = Math.max(0, order.total - platformFee);
  const rating = order.customer_rating ?? 0;

  return (
    <div className="min-h-dvh bg-background pb-20 text-on-background">
      <header className="sticky top-0 z-50 mx-auto flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm">
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-full transition-all hover:bg-surface-container-low active:scale-95"
            aria-label="Go back"
          >
            <MaterialIcon name="arrow_back" className="text-primary" />
          </button>
          <h1 className="text-headline-md font-bold text-primary">Order Details</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-sm p-margin-mobile">
        <div className="relative flex flex-col gap-xs overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
          <div className="absolute left-0 right-0 top-0 h-1 bg-primary" />
          <div className="flex items-start justify-between pt-base">
            <div>
              <span className="text-label-md font-semibold uppercase text-on-surface-variant">
                Order ID
              </span>
              <h2 className="mt-base text-headline-lg-mobile font-bold text-on-background">
                #{order.order_number}
              </h2>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-label-sm text-on-primary-container">
              <MaterialIcon name="check_circle" size={14} filled />
              <span className="uppercase">
                {order.status === 'delivered' || order.status === 'completed'
                  ? 'DELIVERED'
                  : order.status.toUpperCase()}
              </span>
            </div>
          </div>
          {completedAt && (
            <p className="mt-xs text-body-sm text-on-surface-variant">
              {formatCompletedAt(completedAt)}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-sm">
          <div className="flex flex-col gap-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
            <div className="mb-base flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-primary">
              <MaterialIcon name="restaurant" size={18} />
            </div>
            <span className="text-label-sm uppercase text-on-surface-variant">Prep Time</span>
            <span className="text-headline-md font-semibold text-on-background">
              {prepMins != null ? `${prepMins} min` : '—'}
            </span>
          </div>
          <div className="flex flex-col gap-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
            <div className="mb-base flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-primary">
              <MaterialIcon name="two_wheeler" size={18} />
            </div>
            <span className="text-label-sm uppercase text-on-surface-variant">Delivery Time</span>
            <span className="text-headline-md font-semibold text-on-background">
              {deliveryMins != null ? `${deliveryMins} min` : '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
          <h3 className="border-b border-outline-variant pb-xs text-label-md font-semibold uppercase text-on-surface-variant">
            Earnings Breakdown
          </h3>
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-on-surface-variant">Order Total</span>
            <span className="text-body-sm text-on-background">{formatJmd(order.total)}</span>
          </div>
          <div className="flex items-center justify-between text-on-surface-variant">
            <span className="text-body-sm">Platform Fee</span>
            <span className="text-body-sm">- {formatJmd(platformFee)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-dashed border-outline-variant pt-xs">
            <span className="text-body-lg font-medium text-on-background">Your Earnings</span>
            <span className="text-headline-md font-semibold text-primary">{formatJmd(earnings)}</span>
          </div>
        </div>

        {(rating > 0 || order.customer_review) && (
          <div className="flex flex-col gap-xs rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
            <h3 className="mb-xs border-b border-outline-variant pb-xs text-label-md font-semibold uppercase text-on-surface-variant">
              Customer Feedback
            </h3>
            {rating > 0 && (
              <div className="mb-xs flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, index) => (
                  <MaterialIcon
                    key={index}
                    name="star"
                    filled={index < rating}
                    size={20}
                    className={index < rating ? 'text-[#F59E0B]' : 'text-outline-variant'}
                  />
                ))}
              </div>
            )}
            {order.customer_review && (
              <div className="rounded-md bg-surface-container-low p-3 text-body-sm italic text-on-background">
                &quot;{order.customer_review}&quot;
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
          <h3 className="mb-xs text-label-md font-semibold uppercase text-on-surface-variant">
            Order Timeline
          </h3>
          <div className="relative space-y-md pl-6">
            <div className="absolute bottom-2 left-3 top-2 w-0.5 bg-primary" />
            {TIMELINE_STEPS.map((step) => {
              const timestamp = order[step.field];
              if (!timestamp) return null;

              return (
                <div key={step.key} className="relative">
                  <div className="absolute -left-[30px] top-1 h-3.5 w-3.5 rounded-full border-2 border-surface-container-lowest bg-primary" />
                  <div className="flex items-start justify-between">
                    <p className="text-body-sm font-medium text-on-background">{step.label}</p>
                    <span className="text-label-sm text-on-surface-variant">
                      {formatTime(timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
