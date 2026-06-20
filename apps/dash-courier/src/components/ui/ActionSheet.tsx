import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useVisualViewport } from '@/hooks/useVisualViewport';

export type ActionSheetOption = {
  id: string;
  label: string;
  icon?: string;
  destructive?: boolean;
};

type ActionSheetProps = {
  open: boolean;
  title?: string;
  options: ActionSheetOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function ActionSheet({ open, title, options, onSelect, onClose }: ActionSheetProps) {
  const keyboardOffset = useVisualViewport();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-inverse-surface/40" onClick={onClose} aria-label="Close" />
      <div
        className="relative z-10 bg-surface rounded-t-3xl safe-x sheet-safe-bottom px-[var(--spacing-edge)] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.12)] transition-transform"
        style={{ paddingBottom: `max(1rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px))` }}
      >
        <div className="w-12 h-1.5 bg-surface-variant rounded-full mx-auto mb-4" />
        {title && (
          <h2 className="text-base font-semibold text-on-surface text-center mb-4">{title}</h2>
        )}
        <div className="flex flex-col gap-2 mb-4">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onSelect(option.id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 p-4 rounded-xl text-left active:scale-[0.98] transition-transform ${
                option.destructive
                  ? 'text-error hover:bg-error-container/30'
                  : 'text-on-surface hover:bg-surface-container-low'
              }`}
            >
              {option.icon && <MaterialIcon name={option.icon} className="text-xl" />}
              <span className="text-base font-medium">{option.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 rounded-xl border border-outline-variant text-on-surface-variant font-medium mb-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
