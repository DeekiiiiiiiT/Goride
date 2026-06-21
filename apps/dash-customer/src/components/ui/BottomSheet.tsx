import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useVisualViewport } from '@/hooks/useVisualViewport';

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

export function BottomSheet({ open, onClose, children, className = '' }: Props) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const keyboardInset = useVisualViewport();

  useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  if (!open) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    dragging.current = true;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setDragY(delta);
  };

  const onTouchEnd = () => {
    dragging.current = false;
    if (dragY > 120) {
      onClose();
    }
    setDragY(0);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full max-w-md bg-surface rounded-t-3xl shadow-[0px_-10px_30px_rgba(0,0,0,0.08)] flex flex-col max-h-[90dvh] animate-slide-up safe-x ${className}`}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          marginBottom: keyboardInset > 0 ? keyboardInset : undefined,
        }}
      >
        <div
          className="flex justify-center items-center py-3 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-12 h-1.5 bg-outline-variant/50 rounded-full" />
        </div>
        {children}
      </div>
    </div>
  );
}
