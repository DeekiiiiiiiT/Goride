import { useCallback, useRef, useState } from 'react';

export type SwipeDirection = 'left' | 'right' | null;

interface UseSwipeActionOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  threshold?: number;
  disabled?: boolean;
}

export function useSwipeAction({
  onSwipeRight,
  onSwipeLeft,
  threshold = 120,
  disabled = false,
}: UseSwipeActionOptions) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const [offsetX, setOffsetX] = useState(0);
  const [direction, setDirection] = useState<SwipeDirection>(null);

  const reset = useCallback(() => {
    setOffsetX(0);
    setDirection(null);
    tracking.current = false;
  }, []);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || event.touches.length !== 1) return;
      startX.current = event.touches[0].clientX;
      startY.current = event.touches[0].clientY;
      tracking.current = true;
    },
    [disabled],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (!tracking.current || disabled || event.touches.length !== 1) return;

      const dx = event.touches[0].clientX - startX.current;
      const dy = event.touches[0].clientY - startY.current;

      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
        tracking.current = false;
        reset();
        return;
      }

      if (Math.abs(dx) < 8) return;

      event.preventDefault();
      setOffsetX(dx);
      setDirection(dx > 0 ? 'right' : 'left');
    },
    [disabled, reset],
  );

  const onTouchEnd = useCallback(() => {
    if (!tracking.current || disabled) {
      reset();
      return;
    }

    if (offsetX >= threshold && direction === 'right') {
      onSwipeRight?.();
    } else if (offsetX <= -threshold && direction === 'left') {
      onSwipeLeft?.();
    }

    reset();
  }, [disabled, direction, offsetX, onSwipeLeft, onSwipeRight, reset, threshold]);

  const progress = Math.min(1, Math.abs(offsetX) / threshold);

  return {
    swipeProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
      style: { touchAction: 'pan-y' as const },
    },
    offsetX,
    direction,
    progress,
  };
}
