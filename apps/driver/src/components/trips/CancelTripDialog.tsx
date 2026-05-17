import { createPortal } from 'react-dom';
import { Button } from '@roam/ui';

type CancelTripDialogProps = {
  open: boolean;
  onGoBack: () => void;
  onConfirm: () => void;
};

/** Lightweight cancel confirm — no Radix (avoids focus-trap freeze with live GPS/timer). */
export function CancelTripDialog({ open, onGoBack, onConfirm }: CancelTripDialogProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center safe-x p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 touch-manipulation"
        aria-label="Go back"
        onClick={onGoBack}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-trip-title"
        className="relative z-[101] w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 id="cancel-trip-title" className="text-lg font-semibold text-slate-900 dark:text-white">
          Cancel current trip?
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          This discards route, duration, and stops. It cannot be undone.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="btn-touch" onClick={onGoBack}>
            Go back
          </Button>
          <Button
            type="button"
            className="btn-touch bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
          >
            Yes, cancel trip
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
