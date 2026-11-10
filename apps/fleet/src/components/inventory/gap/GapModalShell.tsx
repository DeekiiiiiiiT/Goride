import type { ReactNode } from 'react';

export function GapModalShell({
  children,
  onClose,
  ariaLabel,
}: {
  children: ReactNode;
  onClose?: () => void;
  ariaLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4">
      <div
        role="dialog"
        aria-label={ariaLabel ?? 'Inventory'}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl md:rounded-2xl bg-surface shadow-xl"
      >
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container"
            onClick={onClose}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
          </button>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-space-md md:p-space-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
