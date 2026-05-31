import React from 'react';
import { cn } from '@roam/ui';
import { RIDE_CANCEL_REASONS } from './rideCancelReasons';

type Props = {
  open: boolean;
  cancelReason: string;
  advancing: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function RideCancelSheet({
  open,
  cancelReason,
  advancing,
  onReasonChange,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-labelledby="cancel-ride-title"
      >
        <h3 id="cancel-ride-title" className="text-base font-semibold text-red-700 dark:text-red-400">
          Cancel this ride?
        </h3>
        <select
          value={cancelReason}
          onChange={(e) => onReasonChange(e.target.value)}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-sm dark:border-slate-700"
        >
          {RIDE_CANCEL_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium dark:border-slate-700"
            onClick={onClose}
          >
            Keep ride
          </button>
          <button
            type="button"
            disabled={advancing}
            className={cn(
              'flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white',
              advancing && 'opacity-60',
            )}
            onClick={onConfirm}
          >
            Confirm cancel
          </button>
        </div>
      </div>
    </div>
  );
}
