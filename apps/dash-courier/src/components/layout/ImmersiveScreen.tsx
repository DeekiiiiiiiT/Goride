import React from 'react';
import { createPortal } from 'react-dom';

type ImmersiveScreenProps = {
  children: React.ReactNode;
  className?: string;
};

/** Full-viewport flow wrapper (offers, active delivery, maps). Renders via portal above app chrome. */
export function ImmersiveScreen({ children, className = '' }: ImmersiveScreenProps) {
  return createPortal(
    <div className={`app-fullscreen-screen safe-x safe-t z-[60] ${className}`}>{children}</div>,
    document.body,
  );
}
