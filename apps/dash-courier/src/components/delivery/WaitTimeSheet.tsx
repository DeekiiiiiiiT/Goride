import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useVisualViewport } from '@/hooks/useVisualViewport';

type WaitTimeSheetProps = {
  open: boolean;
  onClose: () => void;
  onWait: (minutes: number) => void;
  onUnassign: () => void;
};

const WAIT_OPTIONS = [5, 10, 15] as const;

export function WaitTimeSheet({ open, onClose, onWait, onUnassign }: WaitTimeSheetProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const keyboardOffset = useVisualViewport();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#3c4a42]/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="relative z-10 bg-surface w-full rounded-t-[24px] shadow-[0_-12px_24px_rgba(0,0,0,0.08)] safe-x sheet-safe-bottom"
        style={{ paddingBottom: `max(1rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px))` }}
      >
        <div className="w-full flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-outline-variant rounded-full opacity-50" />
        </div>

        <div className="px-[var(--spacing-edge)] pb-6 pt-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-on-surface">How long is the wait?</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted hover:bg-surface-container-high rounded-full transition-colors active:scale-95"
            >
              <MaterialIcon name="close" className="text-2xl" />
            </button>
          </div>

          <p className="text-sm text-muted mb-4">
            Letting us know helps update the customer and adjust future prep times for this
            restaurant.
          </p>

          <div className="grid grid-cols-3 gap-2 mb-8">
            {WAIT_OPTIONS.map((mins) => {
              const isSelected = selected === mins;
              const label = mins === 15 ? '15+' : String(mins);
              return (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSelected(mins)}
                  className={`flex flex-col items-center justify-center py-4 px-2 border rounded-lg transition-all active:scale-95 ${
                    isSelected
                      ? 'border-primary bg-surface-container-low text-primary'
                      : 'border-outline-variant hover:border-primary hover:bg-surface-container-low'
                  }`}
                >
                  <span className="text-xl font-semibold mb-1">{label}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">min</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => onWait(selected ?? 10)}
              className="w-full bg-primary-container text-on-primary-container text-xl font-semibold py-4 rounded-xl flex items-center justify-center shadow-[0_6px_12px_rgba(16,185,129,0.15)] hover:bg-success transition-colors active:scale-[0.98]"
            >
              <MaterialIcon name="check_circle" className="mr-2" />
              I&apos;ll wait
            </button>
            <button
              type="button"
              onClick={onUnassign}
              className="w-full py-4 text-error text-base flex items-center justify-center hover:bg-error-container/30 rounded-xl transition-colors active:scale-[0.98]"
            >
              <MaterialIcon name="warning" className="mr-2 text-xl" />
              Unassign me from this order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
