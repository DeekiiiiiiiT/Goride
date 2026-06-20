import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  icon?: string;
  metric?: { label: string; value: string };
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Go back',
  tone = 'primary',
  icon = 'help',
  metric,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-[var(--spacing-edge)]">
      <button
        type="button"
        className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Close"
      />
      <div className="relative z-10 w-full max-w-sm bg-surface rounded-2xl shadow-lg overflow-hidden">
        <div className={`h-1 w-full ${isDanger ? 'bg-error' : 'bg-primary'}`} />
        <div className="p-6 flex flex-col items-center text-center gap-6">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center ${
              isDanger ? 'bg-error-container' : 'bg-primary/10'
            }`}
          >
            <MaterialIcon
              name={icon}
              className={`text-[32px] ${isDanger ? 'text-error' : 'text-primary'}`}
              filled
            />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-on-surface">{title}</h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          {metric && (
            <div className="w-full bg-surface-container-low rounded-xl p-4 border border-surface-variant">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted">
                {metric.label}
              </span>
              <p className={`text-[28px] font-bold mt-1 ${isDanger ? 'text-error' : 'text-primary'}`}>
                {metric.value}
              </p>
            </div>
          )}
          <div className="w-full flex flex-col gap-3">
            <button
              type="button"
              onClick={onConfirm}
              className={`w-full min-h-14 rounded-xl font-semibold text-sm uppercase tracking-wide active:scale-95 transition-transform ${
                isDanger
                  ? 'bg-error text-on-error shadow-[0_6px_12px_rgba(186,26,26,0.15)]'
                  : 'bg-primary text-on-primary shadow-[0_6px_12px_rgba(0,108,73,0.15)]'
              }`}
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full min-h-14 rounded-xl border border-surface-variant text-on-surface font-semibold text-sm uppercase tracking-wide hover:bg-surface-container-low active:scale-95 transition-transform"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
