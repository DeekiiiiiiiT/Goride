import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConnectionStatusBanner } from '../layout/ConnectionStatusBanner';
import { ROAM_RECONNECTED_EVENT } from '../../utils/networkReconnect';

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
  const [reconnecting, setReconnecting] = useState(false);

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

  useEffect(() => {
    if (!show) return;
    const handler = () => {
      setReconnecting(true);
      window.setTimeout(() => setReconnecting(false), 2500);
    };
    window.addEventListener(ROAM_RECONNECTED_EVENT, handler);
    return () => window.removeEventListener(ROAM_RECONNECTED_EVENT, handler);
  }, [show]);

  if (!show) return null;

  return createPortal(
    <div
      className="driver-trip-screen safe-x safe-t"
      style={{ zIndex }}
      role="region"
      aria-label={ariaLabel}
    >
      <ConnectionStatusBanner reconnecting={reconnecting} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>,
    document.body,
  );
}
