import { useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';

export const PREP_TIME_OPTIONS = [15, 20, 25, 30, 35, 40] as const;

export function getDefaultPrepTime(avgPrepTimeMins: number) {
  const fallback = 20;
  const avg = avgPrepTimeMins > 0 ? avgPrepTimeMins : fallback;
  return PREP_TIME_OPTIONS.reduce((closest, option) =>
    Math.abs(option - avg) < Math.abs(closest - avg) ? option : closest,
  );
}

interface OrderAcceptedSheetProps {
  open: boolean;
  orderNumber: string;
  defaultPrepTimeMins: number;
  onStartPreparing: (prepTimeMins: number) => void;
  isSubmitting?: boolean;
}

export default function OrderAcceptedSheet({
  open,
  orderNumber,
  defaultPrepTimeMins,
  onStartPreparing,
  isSubmitting = false,
}: OrderAcceptedSheetProps) {
  const initialPrepTime = useMemo(
    () => getDefaultPrepTime(defaultPrepTimeMins),
    [defaultPrepTimeMins],
  );
  const [prepTimeMins, setPrepTimeMins] = useState(initialPrepTime);

  useEffect(() => {
    if (!open) return;
    setPrepTimeMins(initialPrepTime);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, initialPrepTime]);

  if (!open) return null;

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[65] flex items-center justify-center bg-background p-4"
      role="presentation"
    >
      <main
        className="flex h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm md:h-auto md:max-h-[800px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-accepted-title"
      >
        <div className="flex flex-1 flex-col items-center space-y-inset-md overflow-y-auto p-inset-md pb-8 pt-12 text-center">
          <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-primary-container/10">
            <MaterialIcon name="check_circle" filled className="text-primary-container" size={64} />
          </div>

          <div className="w-full space-y-inset-xs">
            <h1
              id="order-accepted-title"
              className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg"
            >
              Order Accepted!
            </h1>
            <p className="text-body-lg text-on-surface-variant">Order #{orderNumber}</p>
          </div>

          <div className="my-inset-xs w-full border-t border-outline-variant" />

          <div className="w-full space-y-inset-sm">
            <p className="text-body-sm text-on-surface-variant">
              Estimated ready in:{' '}
              <span className="text-headline-md font-semibold text-primary-container">
                {prepTimeMins} min
              </span>
            </p>
            <div className="grid w-full grid-cols-3 gap-inset-xs">
              {PREP_TIME_OPTIONS.map((option) => {
                const selected = prepTimeMins === option;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPrepTimeMins(option)}
                    className={`flex h-12 items-center justify-center rounded-lg transition-colors ${
                      selected
                        ? 'border-2 border-primary-container bg-primary-container/10 text-headline-md font-semibold text-primary-container shadow-[0px_4px_12px_rgba(0,0,0,0.05)]'
                        : 'border border-outline-variant bg-surface-container-lowest text-body-lg text-on-surface hover:bg-surface-container-low'
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1" />
        </div>

        <div className="space-y-inset-sm border-t border-outline-variant bg-surface-container-low p-inset-md">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onStartPreparing(prepTimeMins)}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold uppercase tracking-wider text-on-primary transition-opacity hover:opacity-90 active:shadow-[0px_4px_12px_rgba(0,0,0,0.05)] disabled:opacity-50"
          >
            {isSubmitting ? 'Starting...' : 'START PREPARING'}
          </button>
          <p className="text-center text-label-sm text-on-surface-variant">
            Order will automatically move to &apos;Preparing&apos; status.
          </p>
        </div>
      </main>
    </div>
  );
}
