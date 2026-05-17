import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

const BOTTOM_OFFSET = 'bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))]';

/**
 * Renders trip controls on document.body so they are not trapped inside
 * main's overflow scroll container (fixes dead taps / freezes on mobile Safari).
 */
export function TripActionPortal({
  children,
  inert = false,
}: {
  children: ReactNode;
  inert?: boolean;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-x-0 z-[45] safe-x px-4 ${BOTTOM_OFFSET} ${inert ? 'pointer-events-none opacity-40' : ''}`}
      role="presentation"
      aria-hidden={inert}
    >
      <div
        className={`mx-auto w-full max-w-lg sm:max-w-2xl ${inert ? 'pointer-events-none' : 'pointer-events-auto'}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
