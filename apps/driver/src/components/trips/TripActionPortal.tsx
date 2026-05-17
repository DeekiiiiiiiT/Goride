import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

const BOTTOM_OFFSET = 'bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]';

/**
 * Renders trip controls on document.body so they are not trapped inside
 * main's overflow scroll container (fixes dead taps / freezes on mobile Safari).
 */
export function TripActionPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={`fixed inset-x-0 z-[45] safe-x px-4 ${BOTTOM_OFFSET}`} role="presentation">
      <div className="pointer-events-auto mx-auto w-full max-w-lg sm:max-w-2xl">{children}</div>
    </div>,
    document.body,
  );
}
