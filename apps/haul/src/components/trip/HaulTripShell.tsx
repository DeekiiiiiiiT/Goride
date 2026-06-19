import React from 'react';
import { createPortal } from 'react-dom';
import { useAppImmersiveMode } from '../../hooks/useAppImmersiveMode';

type Props = {
  show: boolean;
  rideKey?: string | null;
  ariaLabel: string;
  zIndex?: number;
  children: React.ReactNode;
};

export function HaulTripShell({ show, rideKey, ariaLabel, zIndex = 150, children }: Props) {
  useAppImmersiveMode(show);

  if (!show) return null;

  return createPortal(
    <div
      className="app-fullscreen-screen safe-x safe-t bg-[#0b1326] text-[#dae2fd]"
      style={{ zIndex }}
      role="region"
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body,
  );
}
