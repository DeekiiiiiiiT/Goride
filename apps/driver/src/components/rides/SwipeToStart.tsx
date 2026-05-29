import React, { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';

type Props = {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
};

export function SwipeToStart({ label, onComplete, disabled = false }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragXRef = useRef(0);
  const draggingRef = useRef(false);
  const completedRef = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const maxDrag = () => {
    const track = trackRef.current;
    if (!track) return 200;
    return Math.max(120, track.clientWidth - 56);
  };

  const dragFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(maxDrag(), Math.max(0, clientX - rect.left - 28));
  };

  const finishIfNeeded = (x: number) => {
    draggingRef.current = false;
    setDragging(false);
    if (x >= maxDrag() * 0.85) {
      if (completedRef.current) return;
      completedRef.current = true;
      dragXRef.current = maxDrag();
      setDragX(maxDrag());
      onComplete();
      window.setTimeout(() => {
        completedRef.current = false;
        dragXRef.current = 0;
        setDragX(0);
      }, 400);
    } else {
      dragXRef.current = 0;
      setDragX(0);
    }
  };

  return (
    <div
      ref={trackRef}
      className={`relative h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden select-none touch-none ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
      onPointerDown={(e) => {
        if (disabled || completedRef.current) return;
        draggingRef.current = true;
        setDragging(true);
        trackRef.current?.setPointerCapture(e.pointerId);
        const x = dragFromClientX(e.clientX);
        dragXRef.current = x;
        setDragX(x);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current || disabled) return;
        const x = dragFromClientX(e.clientX);
        dragXRef.current = x;
        setDragX(x);
      }}
      onPointerUp={(e) => {
        if (!draggingRef.current) return;
        finishIfNeeded(dragXRef.current);
        try {
          trackRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerCancel={(e) => {
        finishIfNeeded(dragXRef.current);
        try {
          trackRef.current?.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-500 pointer-events-none">
        {label}
      </span>
      <div
        className="absolute top-1 left-1 h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        <ChevronRight className="w-5 h-5" aria-hidden />
      </div>
    </div>
  );
}
