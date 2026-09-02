import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type UnassignConfirmModalProps = {
  open: boolean;
  completionRate?: number | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function UnassignConfirmModal({
  open,
  completionRate,
  onConfirm,
  onCancel,
}: UnassignConfirmModalProps) {
  if (!open) return null;

  const rateLabel =
    completionRate != null && Number.isFinite(completionRate) ? `${completionRate}%` : '—';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-[var(--spacing-edge)]">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm bg-surface rounded-2xl shadow-[0_6px_12px_rgba(186,26,26,0.1)] overflow-hidden">
        <div className="h-1 bg-error w-full" />
        <div className="p-6 flex flex-col items-center text-center gap-6">
          <div className="w-16 h-16 rounded-full bg-error-container flex items-center justify-center">
            <MaterialIcon name="warning" className="text-[32px] text-error" filled />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-on-surface">Release this delivery?</h2>
            <p className="text-sm text-muted">
              The order goes back to the queue for another courier. Your completion rate may drop.
            </p>
          </div>
          <div className="w-full bg-surface-container-low rounded-xl p-4 border border-surface-variant flex flex-col items-center gap-1">
            <span className="text-[11px] text-muted uppercase tracking-wider">
              Current Completion Rate
            </span>
            <span className="text-[28px] font-bold text-error leading-9">{rateLabel}</span>
          </div>
          <div className="w-full flex flex-col gap-4">
            <button
              type="button"
              onClick={onConfirm}
              className="w-full min-h-14 flex items-center justify-center bg-error text-on-error text-xs font-semibold uppercase tracking-wide rounded-xl active:scale-95 transition-transform shadow-[0_6px_12px_rgba(186,26,26,0.15)]"
            >
              Yes, release delivery
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full min-h-14 flex items-center justify-center bg-transparent border border-surface-variant text-on-surface text-xs font-semibold uppercase tracking-wide rounded-xl active:scale-95 hover:bg-surface-container-low transition-colors"
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
