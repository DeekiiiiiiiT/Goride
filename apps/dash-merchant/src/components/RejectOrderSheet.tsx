import { useEffect, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';

export type RejectReason =
  | 'items_unavailable'
  | 'kitchen_busy'
  | 'closing_soon'
  | 'customer_request'
  | 'other';

export interface RejectOrderPayload {
  reason: RejectReason;
  notes?: string;
}

const REASON_OPTIONS: { value: RejectReason; label: string }[] = [
  { value: 'items_unavailable', label: 'Item(s) unavailable' },
  { value: 'kitchen_busy', label: 'Kitchen too busy' },
  { value: 'closing_soon', label: 'Closing soon' },
  { value: 'customer_request', label: 'Customer request' },
  { value: 'other', label: 'Other' },
];

export function formatRejectNotes({ reason, notes }: RejectOrderPayload) {
  const label = REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
  const trimmed = notes?.trim();
  return trimmed ? `${label}: ${trimmed}` : label;
}

interface RejectOrderSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: RejectOrderPayload) => void;
  isSubmitting?: boolean;
}

export default function RejectOrderSheet({
  open,
  onClose,
  onConfirm,
  isSubmitting = false,
}: RejectOrderSheetProps) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) {
      setReason(null);
      setNotes('');
      return;
    }

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

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm({ reason, notes: notes.trim() || undefined });
  };

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[70] flex items-end justify-center bg-on-background/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="partner-modal-slide relative flex max-h-[795px] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] bg-surface shadow-xl sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-order-title"
      >
        <div className="flex w-full justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-outline-variant" />
        </div>

        <div className="flex shrink-0 items-center justify-between px-margin-mobile pb-4 pt-2">
          <h2 id="reject-order-title" className="text-headline-md font-semibold text-on-surface">
            Why are you rejecting this order?
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-low active:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
            aria-label="Close modal"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-margin-mobile pb-6">
          <div className="flex flex-col gap-3">
            {REASON_OPTIONS.map((option) => {
              const selected = reason === option.value;

              return (
                <label
                  key={option.value}
                  className={`reject-reason-radio flex min-h-[56px] cursor-pointer items-center justify-between rounded-xl border p-4 transition-colors hover:bg-surface-container-lowest ${
                    selected
                      ? 'border-primary bg-surface-container-low'
                      : 'border-outline-variant'
                  }`}
                >
                  <span className="text-body-lg text-on-surface">{option.label}</span>
                  <input
                    type="radio"
                    name="reject_reason"
                    value={option.value}
                    checked={selected}
                    onChange={() => setReason(option.value)}
                    className="focus:ring-primary focus:ring-offset-1 focus:ring-offset-surface"
                  />
                </label>
              );
            })}
          </div>

          <div className="mt-6">
            <label
              htmlFor="reject_additional_notes"
              className="mb-2 block text-label-md font-semibold text-on-surface-variant"
            >
              Additional notes (optional)
            </label>
            <textarea
              id="reject_additional_notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Tell us more..."
              rows={3}
              className="w-full resize-none rounded-xl border border-outline-variant bg-surface p-4 text-body-lg text-on-surface outline-none transition-shadow placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-error-container/50 bg-error-container p-4">
            <MaterialIcon
              name="warning"
              filled
              className="mt-0.5 shrink-0 text-on-error-container"
              size={20}
            />
            <p className="text-body-sm text-on-error-container">
              Frequent rejections may affect your store&apos;s visibility to customers.
            </p>
          </div>
        </div>

        <div className="shrink-0 border-t border-surface-variant bg-surface p-margin-mobile pt-4">
          <button
            type="button"
            disabled={!reason || isSubmitting}
            onClick={handleConfirm}
            className="flex h-inset-xl w-full items-center justify-center rounded-full bg-error text-label-md font-semibold text-on-error transition-all hover:bg-[#a61717] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-error focus:ring-offset-2 focus:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  );
}
