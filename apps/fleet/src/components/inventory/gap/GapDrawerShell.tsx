import type { ReactNode } from 'react';

/** Right-hand drawer over one dimmed backdrop (Stitch item editor pattern). */
export function GapDrawerShell({
  children,
  onClose,
  ariaLabel,
}: {
  children: ReactNode;
  onClose?: () => void;
  ariaLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={() => onClose?.()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? 'Inventory'}
        className="relative z-10 flex h-full w-full max-w-[580px] min-h-0 flex-col bg-surface-container-lowest shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
