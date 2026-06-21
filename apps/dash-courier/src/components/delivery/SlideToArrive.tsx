import React, { useCallback, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type SlideToArriveProps = {
  label?: string;
  onComplete: () => void;
  variant?: 'default' | 'en-route' | 'stacked' | 'complete';
};

export function SlideToArrive({
  label = 'SLIDE WHEN YOU ARRIVE',
  onComplete,
  variant = 'default',
}: SlideToArriveProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const maxDragRef = useRef(0);

  const isEnRoute = variant === 'en-route';
  const isStacked = variant === 'stacked';
  const isComplete = variant === 'complete';
  const thumbWidth = isEnRoute ? 68 : isStacked || isComplete ? 48 : 50;
  const thumbOffset = isEnRoute ? 6 : isStacked || isComplete ? 4 : 8;

  const getMaxDrag = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.clientWidth - thumbWidth - thumbOffset;
  }, [thumbWidth, thumbOffset]);

  const handleStart = (clientX: number) => {
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
      className={`relative w-full h-16 overflow-hidden flex items-center select-none touch-none ${
        isEnRoute || isComplete
          ? 'bg-primary rounded-xl shadow-md'
          : isStacked
            ? 'bg-surface-container-high rounded-xl shadow-primary'
            : 'bg-surface-container rounded-full border border-surface-variant/50'
      }`}
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
        className={`absolute top-2 bottom-2 flex items-center justify-center z-10 shadow-sm ${
          isEnRoute
            ? 'left-1.5 w-[68px] bg-surface rounded-lg text-primary'
            : isStacked || isComplete
              ? 'left-1 w-12 bg-surface rounded-lg text-primary'
              : 'left-2 w-[50px] bg-primary rounded-full text-on-primary shadow-md'
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
          isEnRoute || isComplete
            ? 'text-on-primary text-xs font-semibold uppercase tracking-wide'
            : isStacked
              ? 'text-xl font-semibold text-primary opacity-80'
              : 'text-xs font-bold tracking-[0.1em] text-primary'
        }`}
      >
        <span
          className="relative z-10"
          style={{
            opacity:
              isStacked || isComplete
                ? Math.max(0.3, 0.8 - (dragX / (maxDragRef.current || 1)) * 1.2)
                : 0.9,
          }}
        >
          {isEnRoute
            ? `${label} →`
            : isComplete
              ? label
              : isStacked
                ? 'Slide to Arrive'
                : label}
        </span>
        {!isEnRoute && !isStacked && !isComplete && (
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent courier-shimmer" />
        )}
      </div>
    </div>
  );
}
