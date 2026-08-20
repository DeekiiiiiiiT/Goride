import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useImmersiveMode } from '../../hooks/useImmersiveMode';

interface PartnerFullscreenScreenProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

export default function PartnerFullscreenScreen({
  open,
  children,
  className = '',
}: PartnerFullscreenScreenProps) {
  useImmersiveMode(open);

  if (!open) return null;

  return createPortal(
    <div className={`app-fullscreen-screen safe-x safe-t ${className}`.trim()}>
      {children}
    </div>,
    document.body,
  );
}
