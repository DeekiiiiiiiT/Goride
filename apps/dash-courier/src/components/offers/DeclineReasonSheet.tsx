import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { DECLINE_REASONS, type DeclineReasonId } from '@/lib/declineReasons';

type DeclineReasonSheetProps = {
  open: boolean;
  onSkip: () => void;
  onSubmit: (reasonId: DeclineReasonId) => void;
};

export function DeclineReasonSheet({ open, onSkip, onSubmit }: DeclineReasonSheetProps) {
  const [selected, setSelected] = useState<DeclineReasonId | null>(null);
  const keyboardOffset = useVisualViewport();

  if (!open) return null;

  const handleSkip = () => {
    setSelected(null);
    onSkip();
  };

  const handleSubmit = () => {
    if (!selected) return;
    const reason = selected;
    setSelected(null);
    onSubmit(reason);
  };

  return (
    <div className="fixed inset-0 z-[85] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-inverse-surface/60 backdrop-blur-sm"
        onClick={handleSkip}
      />

      <div
        className="relative z-10 bg-surface w-full rounded-t-[24px] shadow-[0_-8px_24px_rgba(0,0,0,0.15)] flex flex-col"
        style={{
          paddingBottom: `max(1rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px))`,
        }}
      >
        <div className="w-full flex justify-center pt-2 pb-4">
          <div className="w-12 h-1.5 rounded-full bg-surface-variant" />
        </div>

        <div className="flex items-center justify-between px-[var(--spacing-edge)] pb-4">
          <div>
            <h2 className="text-2xl font-semibold text-on-surface">Why decline?</h2>
            <p className="text-sm text-muted mt-1">This helps us improve your offers.</p>
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs font-semibold uppercase tracking-wider text-primary px-3 py-2 rounded-full hover:bg-surface-container-low active:bg-surface-container-high transition-colors"
          >
            Skip
          </button>
        </div>

        <div className="px-[var(--spacing-edge)] pb-6 flex flex-col gap-2">
          {DECLINE_REASONS.map((reason) => {
            const isSelected = selected === reason.id;
            return (
              <button
                key={reason.id}
                type="button"
                onClick={() => setSelected(reason.id)}
                className={`w-full min-h-14 flex items-center justify-between px-4 py-3 rounded-xl border transition-all active:scale-[0.98] ${
                  isSelected
                    ? 'border-primary bg-primary-container/10'
                    : 'border-outline-variant bg-surface hover:bg-surface-container-lowest'
                }`}
              >
                <div className="flex items-center gap-4">
                  <MaterialIcon
                    name={reason.icon}
                    className={isSelected ? 'text-primary' : 'text-muted'}
                  />
                  <span className="text-base font-medium text-on-surface">{reason.label}</span>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? 'border-primary bg-primary' : 'border-outline-variant'
                  }`}
                >
                  {isSelected && (
                    <MaterialIcon name="check" className="text-on-primary text-base" filled />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-[var(--spacing-edge)] pt-3 pb-4 bg-surface border-t border-surface-variant">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selected}
            className="w-full min-h-14 bg-primary text-on-primary text-xl font-semibold rounded-xl flex items-center justify-center shadow-[0_6px_12px_rgba(0,108,73,0.15)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit &amp; Decline
          </button>
        </div>
      </div>
    </div>
  );
}
