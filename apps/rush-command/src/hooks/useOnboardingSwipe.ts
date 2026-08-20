import { useCallback, useEffect, useRef, useState } from 'react';

const SWIPE_THRESHOLD_PX = 56;

type Options = {
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onPrev: () => void;
};

export function useOnboardingSwipe({ stepIndex, stepCount, onNext, onPrev }: Options) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const resetDrag = useCallback(() => {
    touchStartRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      setIsDragging(true);
    };

    const onTouchMove = (event: TouchEvent) => {
      const start = touchStartRef.current;
      const touch = event.touches[0];
      if (!start || !touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) < 8) return;

      event.preventDefault();

      let offset = dx;
      if (stepIndex === 0 && offset > 0) offset *= 0.35;
      if (stepIndex === stepCount - 1 && offset < 0) offset *= 0.35;

      setDragOffset(offset);
    };

    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;
      const touch = event.changedTouches[0];
      if (!start || !touch) {
        resetDrag();
        return;
      }

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      resetDrag();

      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) return;

      if (dx < 0 && stepIndex < stepCount - 1) onNext();
      else if (dx > 0 && stepIndex > 0) onPrev();
    };

    const onTouchCancel = () => {
      resetDrag();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [onNext, onPrev, resetDrag, stepCount, stepIndex]);

  return { containerRef, dragOffset, isDragging };
}

export function useOnboardingScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const { documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [active]);
}
