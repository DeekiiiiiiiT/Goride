import type { ReactNode } from 'react';
import { useInventoryShell } from './InventoryShellContext';

/** Fixed overlay wrapper for IN3–IN16 modals (Stitch dialog chrome). */
export function InventoryModalFrame({ children }: { children: ReactNode }) {
  const shell = useInventoryShell();
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-primary/25 backdrop-blur-[2px] p-space-md"
      role="presentation"
      onClick={() => shell.closeModal()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') shell.closeModal();
      }}
    >
      <div
        className="relative w-full max-w-[960px] my-space-lg"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
