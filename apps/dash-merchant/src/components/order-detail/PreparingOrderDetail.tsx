import { useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatElapsedTimer } from '../../lib/partner-utils';
import {
  getDurationMinutes,
  getInitials,
  splitInstructions,
} from '../../lib/order-utils';
import { getItemOptionLines, Order } from '../../types/order';

interface PreparingOrderDetailProps {
  order: Order;
  avgPrepTimeMins: number;
  onBack: () => void;
  onMarkReady: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function PreparingOrderDetail({
  order,
  avgPrepTimeMins,
  onBack,
  onMarkReady,
  onCancel,
  isSubmitting = false,
}: PreparingOrderDetailProps) {
  const [, setTick] = useState(0);
  const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const interval = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const prepStart = order.preparing_at || order.accepted_at || order.placed_at;
  const estimatedMins = order.estimated_prep_time_mins ?? avgPrepTimeMins ?? 20;
  const elapsedMins = prepStart ? getDurationMinutes(prepStart) : 0;
  const remainingMins = Math.max(0, estimatedMins - elapsedMins);
  const instructions = useMemo(
    () => splitInstructions(order.delivery_instructions),
    [order.delivery_instructions],
  );

  const toggleItem = (index: number) => {
    setCheckedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background print:bg-white">
      <header className="sticky top-0 z-50 mx-auto flex h-16 w-full max-w-full items-center justify-between border-b border-outline-variant bg-surface/95 px-margin-mobile shadow-sm backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex h-xl w-xl items-center justify-center rounded-full text-on-surface transition-all hover:bg-surface-container-low active:scale-95"
          aria-label="Go back"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="flex-1 truncate text-center text-headline-md font-bold tracking-tight text-on-surface">
          #{order.order_number}
        </h1>
        <button
          type="button"
          onClick={() => window.print()}
          className="-mr-2 flex h-xl w-xl items-center justify-center rounded-full text-primary transition-all hover:bg-surface-container-low active:scale-95"
          aria-label="Print order"
        >
          <MaterialIcon name="print" />
        </button>
      </header>

      <main className="partner-print-ticket mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-margin-mobile py-6 pb-[140px]">
        <section className="group relative flex flex-col gap-md overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
          <div className="absolute left-0 top-0 h-1 w-full bg-surface-variant transition-colors duration-500 group-hover:bg-primary" />
          <div className="flex items-start justify-between">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-outline-variant bg-surface-variant px-3 py-1.5 text-label-md font-semibold text-on-surface-variant shadow-sm">
              <MaterialIcon name="soup_kitchen" size={16} className="animate-pulse" />
              PREPARING
            </div>
            <div className="flex flex-col items-end">
              <div className="tabular-nums text-headline-lg-mobile font-bold tracking-tight text-primary">
                {prepStart ? formatElapsedTimer(prepStart) : '00:00'}
              </div>
              <div className="mt-0.5 text-label-sm uppercase tracking-widest text-on-surface-variant">
                Prep Time
              </div>
            </div>
          </div>
          <div className="h-px w-full bg-outline-variant opacity-50" />
          <div className="flex items-center gap-2 text-on-surface-variant">
            <MaterialIcon name="schedule" size={20} />
            <span className="text-body-sm">
              Estimated ready:{' '}
              <strong className="font-semibold text-on-surface">{remainingMins} min remaining</strong>
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md shadow-sm">
            <div className="flex items-center gap-sm">
              <div className="flex h-xl w-xl shrink-0 items-center justify-center rounded-full bg-secondary-container text-headline-md font-semibold text-on-secondary-container shadow-inner">
                {getInitials(order.customer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Customer
                </div>
                <div className="truncate text-body-lg font-semibold text-on-surface">
                  {order.customer.name}
                </div>
              </div>
              {order.customer.phone && (
                <a
                  href={`tel:${order.customer.phone}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary transition-transform hover:bg-surface-container active:scale-95"
                  aria-label="Contact customer"
                >
                  <MaterialIcon name="call" />
                </a>
              )}
            </div>
            <div className="my-1 h-px w-full bg-outline-variant opacity-50" />
            <div className="flex items-center gap-sm">
              <div className="flex h-xl w-xl shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-on-surface-variant">
                <MaterialIcon name="two_wheeler" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Courier Status
                </div>
                <div className="truncate text-body-sm text-on-surface">
                  Courier will be assigned when ready
                </div>
              </div>
            </div>
          </div>
        </section>

        {instructions.length > 0 && (
          <section className="relative flex items-start gap-sm overflow-hidden rounded-r-xl border-l-[6px] border-primary bg-surface-container p-md shadow-sm">
            <div className="pointer-events-none absolute inset-0 bg-primary opacity-5" />
            <MaterialIcon name="notification_important" className="mt-0.5 text-primary" />
            <div className="relative z-10 w-full flex flex-col gap-2">
              <span className="text-label-md font-semibold uppercase tracking-wider text-primary">
                Special Instructions
              </span>
              <ul className="ml-4 flex list-disc flex-col gap-1.5 text-body-lg text-on-surface-variant">
                {instructions.map((line) => (
                  <li key={line} className="pl-1">
                    &quot;{line}&quot;
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="mt-2 flex flex-col gap-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-headline-md font-semibold text-on-surface">Kitchen Checklist</h2>
            <span className="rounded-md bg-surface-container px-2 py-1 text-label-sm text-on-surface-variant">
              {order.items.length} Items
            </span>
          </div>
          {order.items.map((item, index) => {
            const modifiers = getItemOptionLines(item);
            const checked = Boolean(checkedItems[index]);

            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleItem(index)}
                className={`kitchen-checklist-item flex w-full items-start gap-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-md text-left shadow-sm transition-transform active:scale-[0.99] ${
                  checked ? 'kitchen-checklist-item--checked' : ''
                }`}
              >
                <MaterialIcon
                  name={checked ? 'check_box' : 'check_box_outline_blank'}
                  className={`mt-0.5 ${checked ? 'text-primary' : 'text-outline'}`}
                  size={24}
                />
                <div className="flex flex-1 flex-col gap-1">
                  <div
                    className={`text-body-lg font-semibold text-on-surface ${checked ? 'kitchen-checklist-item__text' : ''}`}
                  >
                    {item.quantity}× {item.name}
                  </div>
                  {modifiers.length > 0 && (
                    <ul className="ml-1 mt-1 flex flex-col gap-0.5 border-l-2 border-outline-variant pl-3 text-body-sm text-on-surface-variant">
                      {modifiers.map((mod) => (
                        <li key={mod}>{mod.split(': ').pop()}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </button>
            );
          })}
        </section>
      </main>

      <div className="fixed bottom-0 left-0 z-50 flex w-full flex-col gap-4 border-t border-outline-variant bg-surface px-margin-mobile pb-6 pt-4 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] md:items-center">
        <div className="flex w-full max-w-2xl flex-col gap-4">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onMarkReady}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-label-md font-semibold text-on-primary shadow-md transition-transform hover:bg-surface-tint active:scale-95 disabled:opacity-50"
          >
            <MaterialIcon name="room_service" size={20} />
            MARK READY FOR PICKUP
          </button>
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              className="flex min-h-[48px] items-center gap-1 px-2 text-label-md font-semibold text-on-surface-variant transition-all hover:text-primary active:scale-95"
            >
              <MaterialIcon name="hourglass_bottom" size={16} />
              Need more time
            </button>
            <div className="h-4 w-px bg-outline-variant opacity-50" />
            <button
              type="button"
              onClick={onCancel}
              className="flex min-h-[48px] items-center gap-1 px-2 text-label-md font-semibold text-error transition-all hover:text-on-error-container active:scale-95"
            >
              <MaterialIcon name="cancel" size={16} />
              Cancel Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
