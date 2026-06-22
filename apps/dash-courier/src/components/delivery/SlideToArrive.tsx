import React, { useCallback, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type SlideToArriveProps = {
  label?: string;
  onComplete: () => void;
  variant?: 'default' | 'en-route' | 'stacked' | 'complete' | 'pill';
  disabled?: boolean;
};

export function SlideToArrive({
  label = 'SLIDE WHEN YOU ARRIVE',
  onComplete,
  variant = 'default',
  disabled = false,
}: SlideToArriveProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const maxDragRef = useRef(0);

  const isPill = variant === 'pill';
  const isEnRoute = variant === 'en-route';
  const isStacked = variant === 'stacked';
  const isComplete = variant === 'complete';
  const thumbWidth = isPill ? 56 : isEnRoute ? 68 : isStacked || isComplete ? 48 : 50;
  const thumbOffset = isPill ? 4 : isEnRoute ? 6 : isStacked || isComplete ? 4 : 8;

  const getMaxDrag = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.clientWidth - thumbWidth - thumbOffset;
  }, [thumbWidth, thumbOffset]);

  const handleStart = (clientX: number) => {
    if (disabled) return;
    maxDragRef.current = getMaxDrag();
    startXRef.current = clientX - dragX;
    setDragging(true);
  };

  const handleMove = (clientX: number) => {
    if (!dragging) return;
    const next = Math.max(0, Math.min(clientX - startXRef.current, maxDragRef.current));
    setDragX(next);
  };

  const handleEnd = () => {
    if (!dragging) return;
    setDragging(false);
    const threshold = maxDragRef.current * 0.85;
    if (dragX >= threshold) {
      setDragX(maxDragRef.current);
      onComplete();
    } else {
      setDragX(0);
    }
  };

  return (
    <div
      ref={trackRef}
      className={`relative w-full overflow-hidden flex items-center select-none touch-none ${
        isPill
          ? 'h-16 rounded-full border border-outline-variant bg-surface-container-low'
          : isEnRoute || isComplete
          ? 'h-16 bg-primary rounded-xl shadow-md'
          : isStacked
            ? 'h-14 bg-surface-container-high rounded-full border border-outline-variant shadow-primary'
            : 'h-16 bg-surface-container rounded-full border border-surface-variant/50'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        handleStart(e.clientX);
      }}
      onPointerMove={(e) => handleMove(e.clientX)}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
    >
      {isEnRoute && (
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent courier-shimmer" />
      )}
      {isPill && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-primary-container/20 pointer-events-none"
          style={{ width: dragX + thumbWidth + 8 }}
        />
      )}
      {isStacked && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-primary-container/20 pointer-events-none"
          style={{ width: dragX + thumbWidth + 8 }}
        />
      )}
      {isComplete && (
        <div
          className="absolute left-0 top-0 bottom-0 bg-primary-container/30 pointer-events-none rounded-xl"
          style={{ width: dragX + thumbWidth + 8 }}
        />
      )}
      <div
        className={`absolute flex items-center justify-center z-10 shadow-sm ${
          isPill
            ? 'left-1 top-1 bottom-1 w-14 bg-primary rounded-full text-on-primary'
            : isEnRoute
            ? 'left-1.5 top-2 bottom-2 w-[68px] bg-surface rounded-lg text-primary'
            : isStacked || isComplete
              ? 'left-1 top-1 bottom-1 w-12 bg-surface rounded-lg text-primary'
              : 'left-2 top-2 bottom-2 w-[50px] bg-primary rounded-full text-on-primary shadow-md'
        } ${dragging ? '' : 'transition-transform duration-200'}`}
        style={{ transform: `translateX(${dragX}px)` }}
      >
        <MaterialIcon
          name={
            isEnRoute
              ? 'keyboard_double_arrow_right'
              : isStacked || isComplete
                ? 'arrow_forward'
                : 'arrow_forward'
          }
          className={isEnRoute ? 'text-[32px]' : 'text-2xl'}
          filled={isStacked}
        />
      </div>
      <div
        className={`w-full text-center z-0 pl-16 pr-4 relative overflow-hidden ${
          isPill
            ? 'text-label-lg font-semibold text-on-surface-variant'
            : isEnRoute || isComplete
            ? 'text-on-primary text-xs font-semibold uppercase tracking-wide'
            : isStacked
              ? 'text-label-lg font-semibold text-on-surface-variant'
              : 'text-xs font-bold tracking-[0.1em] text-primary'
        }`}
      >
        <span
          className="relative z-10"
          style={{
            opacity:
              isPill || isStacked || isComplete
                ? Math.max(0.2, 0.9 - (dragX / (maxDragRef.current || 1)) * 1.1)
                : 0.9,
          }}
        >
          {isEnRoute
            ? `${label} →`
            : isComplete
              ? label
              : isStacked || isPill
                ? label
                : label}
        </span>
        {!isEnRoute && !isStacked && !isComplete && (
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent courier-shimmer" />
        )}
      </div>
    </div>
  );
}
