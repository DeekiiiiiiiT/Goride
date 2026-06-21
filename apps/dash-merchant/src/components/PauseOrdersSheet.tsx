import { useEffect, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';

export type PauseDuration = '15m' | '30m' | '1h' | '2h' | 'manual';

export type PauseReason = 'busy' | 'short_staffed' | 'technical' | 'other';

export interface PauseOrdersPayload {
  duration: PauseDuration;
  reason: PauseReason | null;
}

interface PauseOrdersSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: PauseOrdersPayload) => void;
  isSubmitting?: boolean;
}

const DURATION_OPTIONS: { value: PauseDuration; label: string }[] = [
  { value: '15m', label: '15 minutes' },
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: 'manual', label: 'Until I turn back on' },
];

const REASON_OPTIONS: { value: PauseReason; label: string }[] = [
  { value: 'busy', label: 'Busy' },
  { value: 'short_staffed', label: 'Short staffed' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'other', label: 'Other' },
];

export default function PauseOrdersSheet({
  open,
  onClose,
  onConfirm,
  isSubmitting = false,
}: PauseOrdersSheetProps) {
  const [duration, setDuration] = useState<PauseDuration>('30m');
  const [reason, setReason] = useState<PauseReason | null>(null);

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

  if (!open) return null;

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-50 flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-sm sm:items-center sm:p-margin-tablet"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="partner-modal-slide flex max-h-[795px] w-full max-w-[560px] flex-col rounded-t-2xl border-t border-outline-variant bg-surface shadow-xl sm:rounded-2xl sm:border"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-orders-title"
      >
        <div className="flex w-full cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-tertiary-fixed" />
        </div>

        <div className="flex items-center justify-between border-b border-outline-variant px-margin-mobile py-sm sm:px-md">
          <h2
            id="pause-orders-title"
            className="text-headline-lg-mobile font-bold text-on-surface"
          >
            Pause incoming orders
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high active:scale-95"
            aria-label="Close"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="flex-1 space-y-md overflow-y-auto px-margin-mobile py-sm sm:px-md">
          <div className="space-y-sm">
            <h3 className="text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
              Duration
            </h3>
            <div className="flex flex-col space-y-2">
              {DURATION_OPTIONS.map((option) => {
                const selected = duration === option.value;

                return (
                  <label
                    key={option.value}
                    className={`group flex h-14 cursor-pointer items-center rounded-lg p-sm transition-colors ${
                      selected
                        ? 'border-2 border-primary-container bg-surface-container-low'
                        : 'border border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="relative mr-3 flex h-5 w-5 items-center justify-center">
                      <input
                        type="radio"
                        name="pause-duration"
                        value={option.value}
                        checked={selected}
                        onChange={() => setDuration(option.value)}
                        className="peer h-5 w-5 appearance-none rounded-full border-2 border-outline bg-surface transition-all checked:border-[6px] checked:border-primary-container"
                      />
                    </div>
                    <span
                      className={`text-body-lg text-on-surface ${selected ? 'font-medium' : ''}`}
                    >
                      {option.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-sm">
            <h3 className="text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
              Reason{' '}
              <span className="normal-case tracking-normal text-on-surface-variant/70">
                (Optional)
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {REASON_OPTIONS.map((option) => {
                const selected = reason === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setReason(selected ? null : option.value)}
                    className={`h-10 rounded-full border px-4 text-body-sm transition-colors active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary-container ${
                      selected
                        ? 'border-secondary-container bg-secondary-container text-on-secondary-container'
                        : 'border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-b-2xl border-t border-outline-variant bg-surface p-margin-mobile sm:p-md">
          <div className="flex items-start rounded-lg border border-error-container/50 bg-error-container/30 p-3">
            <MaterialIcon
              name="info"
              className="mr-2 mt-0.5 text-on-error-container"
              size={20}
            />
            <p className="text-body-sm text-on-surface-variant">
              Customers won&apos;t be able to place new orders while paused. Existing orders must
              still be completed.
            </p>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onConfirm({ duration, reason })}
            className="flex h-14 w-full items-center justify-center rounded-lg bg-primary-container text-headline-md font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container/90 focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MaterialIcon name="pause_circle" filled className="mr-2" />
            {isSubmitting ? 'Pausing...' : 'Pause Orders'}
          </button>
        </div>
      </div>
    </div>
  );
}
