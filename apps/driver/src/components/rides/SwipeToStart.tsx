import React, { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

type Props = {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
};

export function SwipeToStart({ label, onComplete, disabled = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const maxDrag = () => {
    const track = trackRef.current;
    if (!track) return 200;
    return Math.max(120, track.clientWidth - 56);
  };

  const finishIfNeeded = (x: number) => {
    if (x >= maxDrag() * 0.85) {
      setDragX(maxDrag());
      onComplete();
    } else {
      setDragX(0);
    }
    setDragging(false);
  };

  return (
    <div
      ref={trackRef}
      className={`relative h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden select-none touch-none ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      onPointerDown={(e) => {
        if (disabled) return;
        setDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging || disabled) return;
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = Math.min(maxDrag(), Math.max(0, e.clientX - rect.left - 28));
        setDragX(x);
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        finishIfNeeded(dragX);
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerCancel={() => finishIfNeeded(dragX)}
    >
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-500 pointer-events-none">
        {label}
      </span>
      <div
        className="absolute top-1 left-1 h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md transition-transform"
        style={{ transform: `translateX(${dragX}px)` }}
      >
        <ChevronRight className="w-5 h-5" aria-hidden />
      </div>
    </div>
  );
}
