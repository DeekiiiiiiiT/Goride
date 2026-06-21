import { useEffect, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { formatCountdown, formatJmd } from '../lib/partner-utils';
import { getItemOptionLines, Order } from '../types/order';

const AUTO_REJECT_MINS = 5;

interface NewOrderDetailSheetProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onAccept: (orderId: string) => void;
  onReject: (orderId: string) => void;
  isSubmitting?: boolean;
  avgPrepTimeMins?: number;
}

export default function NewOrderDetailSheet({
  order,
  open,
  onClose,
  onAccept,
  onReject,
  isSubmitting = false,
  avgPrepTimeMins = 20,
}: NewOrderDetailSheetProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !order) return;
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [open, order]);

  if (!open) return null;

  if (!order) {
    return (
      <div
        className="partner-modal-fade fixed inset-0 z-[60] flex items-center justify-center bg-surface-dim md:bg-inverse-surface/40 md:backdrop-blur-sm"
        role="presentation"
      >
        <div className="flex h-full w-full items-center justify-center bg-surface-container-lowest md:h-[795px] md:max-w-[480px] md:rounded-xl">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-container border-t-transparent" />
        </div>
      </div>
    );
  }

  const placedAt = order.placed_at || order.created_at;
  const elapsedSeconds = Math.floor((Date.now() - new Date(placedAt).getTime()) / 1000);
  const autoRejectRemaining = Math.max(0, AUTO_REJECT_MINS * 60 - elapsedSeconds);
  const isDelivery = Boolean(order.delivery_address);
  const instructions = order.delivery_instructions?.trim();

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[60] flex flex-col bg-surface-dim md:items-center md:justify-center md:bg-inverse-surface/40 md:p-margin-tablet md:backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <main
        className="flex h-full w-full flex-col overflow-hidden bg-surface-container-lowest shadow-2xl md:h-[795px] md:max-w-[480px] md:rounded-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-detail-title"
      >
        <header className="z-10 flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-margin-mobile py-sm">
          <div className="flex animate-pulse items-center gap-xs text-error">
            <MaterialIcon name="notifications_active" filled />
            <span className="text-label-md font-semibold uppercase">New Order</span>
          </div>
          {autoRejectRemaining > 0 && (
            <div className="flex items-center gap-base rounded-full bg-error-container px-3 py-1.5 text-label-sm text-on-error-container">
              <MaterialIcon name="timer" size={14} />
              <span>Auto-rejects in {formatCountdown(autoRejectRemaining)}</span>
            </div>
          )}
        </header>

        <div className="flex flex-1 flex-col gap-lg overflow-y-auto bg-background px-margin-mobile py-md">
          <section className="flex flex-col gap-base">
            <div className="flex items-start justify-between">
              <h1
                id="new-order-detail-title"
                className="text-headline-lg-mobile font-bold text-on-surface"
              >
                #{order.order_number}
              </h1>
              <div className="flex items-center gap-base rounded-full bg-surface-container-high px-3 py-1.5 text-label-sm text-on-surface">
                <MaterialIcon name={isDelivery ? 'moped' : 'storefront'} size={16} />
                {isDelivery ? 'Delivery' : 'Pickup'}
              </div>
            </div>
            <h2 className="text-headline-md font-semibold text-on-surface-variant">
              {order.customer.name}
            </h2>
          </section>

          <section className="flex flex-col gap-0 border-y border-outline-variant py-xs">
            {order.items.map((item, index) => {
              const optionLines = getItemOptionLines(item);
              const lineTotal = item.price * item.quantity;

              return (
                <article
                  key={index}
                  className="flex min-h-[64px] items-start gap-sm border-b border-outline-variant/40 py-sm last:border-0"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-container-high text-label-md font-semibold text-on-surface">
                    {item.quantity}x
                  </div>
                  <div className="flex flex-1 flex-col gap-base">
                    <div className="flex items-start justify-between">
                      <span className="text-body-lg font-medium text-on-surface">{item.name}</span>
                      <span className="text-body-lg text-on-surface">{formatJmd(lineTotal)}</span>
                    </div>
                    {optionLines.length > 0 && (
                      <div className="flex flex-col gap-base text-body-sm text-on-surface-variant">
                        {optionLines.map((line) => (
                          <span key={line}>• {line}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>

          {instructions && (
            <section className="flex items-start gap-sm rounded-lg border border-outline-variant bg-surface-container p-sm">
              <MaterialIcon
                name="info"
                filled
                className="shrink-0 text-on-surface-variant"
                size={20}
              />
              <div className="flex flex-col gap-base">
                <h3 className="text-label-md font-semibold uppercase tracking-wider text-on-surface">
                  Special Instructions
                </h3>
                <p className="whitespace-pre-line text-body-sm text-on-surface-variant">
                  {instructions}
                </p>
              </div>
            </section>
          )}

          <section className="flex flex-col gap-xs pb-md pt-xs">
            <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
              <span>Subtotal</span>
              <span>{formatJmd(order.subtotal)}</span>
            </div>
            {order.delivery_fee > 0 && (
              <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
                <span>Delivery fee</span>
                <span>{formatJmd(order.delivery_fee)}</span>
              </div>
            )}
            {order.tax > 0 && (
              <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
                <span>Tax</span>
                <span>{formatJmd(order.tax)}</span>
              </div>
            )}
            {order.tip > 0 && (
              <div className="flex items-center justify-between text-body-sm text-on-surface-variant">
                <span>Tip</span>
                <span>{formatJmd(order.tip)}</span>
              </div>
            )}
            <div className="mt-base flex items-center justify-between text-headline-md font-semibold text-on-surface">
              <span>Total</span>
              <span>{formatJmd(order.total)}</span>
            </div>
          </section>
        </div>

        <footer className="z-10 flex shrink-0 flex-col gap-sm border-t border-outline-variant bg-surface-container-lowest p-margin-mobile">
          <div className="mb-xs flex items-center justify-center gap-base text-center text-label-sm text-on-surface-variant">
            <MaterialIcon name="schedule" size={14} />
            ~{avgPrepTimeMins} min based on your average prep time
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onAccept(order.id)}
            className="flex h-xl w-full items-center justify-center gap-xs rounded-lg bg-primary-container text-label-md font-semibold text-on-primary shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            <MaterialIcon name="check_circle" filled />
            ACCEPT ORDER
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onReject(order.id)}
            className="flex h-xl w-full items-center justify-center gap-xs rounded-lg bg-surface-container-high text-label-md font-semibold text-on-surface transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            REJECT ORDER
          </button>
        </footer>
      </main>
    </div>
  );
}
