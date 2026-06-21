import { useEffect, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { formatCountdown, formatJmd } from '../lib/partner-utils';
import { Order } from '../types/order';

const ACCEPT_DEADLINE_SECONDS = 270;
const TIMER_CIRCUMFERENCE = 283;

interface NewOrderAlertViewProps {
  order: Order;
  open: boolean;
  onAccept: (orderId: string) => void;
  onViewOrder: () => void;
  onHelp?: () => void;
  isSubmitting?: boolean;
}

export default function NewOrderAlertView({
  order,
  open,
  onAccept,
  onViewOrder,
  onHelp,
  isSubmitting = false,
}: NewOrderAlertViewProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => {
      document.body.style.overflow = '';
      window.clearInterval(interval);
    };
  }, [open]);

  if (!open) return null;

  const placedAt = order.placed_at || order.created_at;
  const elapsedSeconds = Math.floor((Date.now() - new Date(placedAt).getTime()) / 1000);
  const remainingSeconds = Math.max(0, ACCEPT_DEADLINE_SECONDS - elapsedSeconds);
  const timerProgress = remainingSeconds / ACCEPT_DEADLINE_SECONDS;
  const strokeOffset = TIMER_CIRCUMFERENCE * (1 - timerProgress);

  return (
    <div className="fixed inset-0 z-[70] flex min-h-dvh flex-col overflow-hidden bg-primary-container text-on-primary">
      <div className="pointer-events-none absolute inset-0 animate-strong-pulse bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary-fixed/30 to-transparent" />

      <header className="relative z-[60] flex h-16 w-full animate-pulse items-center bg-primary-container px-4 text-headline-md font-bold text-on-primary-container shadow-md">
        <MaterialIcon name="priority_high" filled className="mr-2" />
        New Order Alert
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center space-y-lg p-margin-mobile pb-32">
        <h1 className="text-center text-headline-lg font-black tracking-tighter text-on-primary drop-shadow-md">
          NEW ORDER!
        </h1>

        <div className="flex w-full max-w-md flex-col items-center space-y-sm rounded-xl border border-on-primary/20 bg-surface-container-lowest/15 p-md shadow-[0_8px_32px_rgba(0,0,0,0.1)] backdrop-blur-md">
          <div className="w-full text-center">
            <div className="mb-1 text-label-md uppercase tracking-widest text-on-primary/80">
              Order #{order.order_number}
            </div>
            <div className="text-headline-lg font-bold text-on-primary">{formatJmd(order.total)}</div>
          </div>
          <div className="my-2 h-px w-full bg-on-primary/20" />
          <ul className="w-full space-y-2 text-center text-body-sm text-on-primary">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex w-full items-center justify-between px-4">
                <span className="opacity-80">{item.quantity}x</span>
                <span>{item.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-sm flex h-48 w-48 items-center justify-center">
          <svg
            className="absolute inset-0 h-full w-full -rotate-90 drop-shadow-md"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-on-primary/20"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={TIMER_CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
              className="text-on-primary transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <div className="z-10 flex flex-col items-center justify-center text-center text-on-primary">
            <span className="mb-1 text-label-sm uppercase tracking-wider opacity-90">
              Accept within
            </span>
            <span className="text-headline-lg font-black tabular-nums tracking-tight">
              {formatCountdown(remainingSeconds)}
            </span>
          </div>
        </div>
      </main>

      <div className="fixed bottom-16 left-0 z-50 flex w-full flex-col gap-sm bg-gradient-to-t from-primary-container via-primary-container to-transparent p-margin-mobile pt-8">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => onAccept(order.id)}
          className="flex min-h-[56px] w-full items-center justify-center rounded-lg bg-on-primary text-headline-md font-bold text-primary-container shadow-[0_8px_16px_rgba(0,0,0,0.15)] transition-transform duration-150 active:scale-95 disabled:opacity-50"
        >
          ACCEPT NOW
        </button>
        <button
          type="button"
          onClick={onViewOrder}
          className="flex min-h-[56px] w-full items-center justify-center rounded-lg border-2 border-on-primary bg-surface-container-lowest/5 text-headline-md text-on-primary backdrop-blur-sm transition-transform duration-150 active:scale-95"
        >
          VIEW ORDER
        </button>
      </div>

      <footer className="fixed bottom-0 z-[60] flex w-full items-center justify-between border-t border-outline-variant bg-surface px-margin-mobile py-sm text-label-md text-primary">
        <span className="text-on-surface-variant">Urgent Action Required</span>
        <button
          type="button"
          onClick={onHelp}
          className="text-on-surface-variant transition-colors hover:text-primary"
        >
          Help Center
        </button>
      </footer>
    </div>
  );
}
