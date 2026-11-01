import type { ReactNode } from 'react';
import { useInventoryShell } from './InventoryShellContext';

/** Fixed overlay wrapper for IN3–IN16 modals (Stitch dialog chrome). */
export function InventoryModalFrame({ children }: { children: ReactNode }) {
  const shell = useInventoryShell();
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-primary/25 backdrop-blur-[2px] p-space-md">
      <div className="relative w-full max-w-[960px] my-space-lg">{children}</div>
      <button
        type="button"
        aria-label="Dismiss dialog"
        className="fixed inset-0 -z-10 cursor-default"
        onClick={() => shell.closeModal()}
      />
    </div>
  );
}
