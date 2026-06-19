import React, { useRef, useState } from 'react';

type Props = {
  children: React.ReactNode;
  onSwipeAction?: () => void;
  actionLabel?: string;
  actionIcon?: string;
};

export function HaulSwipeableRow({
  children,
  onSwipeAction,
  actionLabel = 'Details',
  actionIcon = 'chevron_right',
}: Props) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const dragging = useRef(false);

  const maxSwipe = 72;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {onSwipeAction ? (
        <button
          type="button"
          onClick={onSwipeAction}
          className="absolute top-0 right-0 flex h-full w-[72px] items-center justify-center bg-[#ffc174]/20 text-[#ffc174]"
          aria-label={actionLabel}
        >
          <span className="material-symbols-outlined">{actionIcon}</span>
        </button>
      ) : null}
      <div
        className="relative bg-inherit transition-transform touch-pan-y"
        style={{ transform: `translateX(${-offset}px)` }}
        onTouchStart={(e) => {
          startX.current = e.touches[0].clientX;
          dragging.current = true;
        }}
        onTouchMove={(e) => {
          if (!dragging.current || !onSwipeAction) return;
          const delta = startX.current - e.touches[0].clientX;
          setOffset(Math.max(0, Math.min(delta, maxSwipe)));
        }}
        onTouchEnd={() => {
          dragging.current = false;
          setOffset(offset > maxSwipe * 0.4 ? maxSwipe : 0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
