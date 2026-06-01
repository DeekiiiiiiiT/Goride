import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  show: boolean;
  rideKey?: string | null;
  ariaLabel: string;
  zIndex?: number;
  children: React.ReactNode;
};

/** Locks viewport and renders edge-to-edge trip UI above shell chrome. */
export function DriverTripFullscreenShell({
  show,
  rideKey,
  ariaLabel,
  zIndex = 150,
  children,
}: Props) {
  useEffect(() => {
    if (!show) return;
    document.documentElement.classList.add('driver-active-trip');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.classList.remove('driver-active-trip');
      document.body.style.overflow = prevOverflow;
    };
  }, [show, rideKey]);

  if (!show) return null;

  return createPortal(
    <div
      className="driver-trip-screen safe-x safe-t"
      style={{ zIndex }}
      role="region"
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body,
  );
}
