import { useCallback, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown> | unknown;
  disabled?: boolean;
  threshold?: number;
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
  threshold = 72,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || isRefreshing) return;
      const scrollTop = (event.currentTarget as HTMLElement).scrollTop;
      if (scrollTop > 0) return;
      startY.current = event.touches[0].clientY;
      pulling.current = true;
    },
    [disabled, isRefreshing],
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent) => {
      if (!pulling.current || disabled || isRefreshing) return;
      const distance = Math.max(0, event.touches[0].clientY - startY.current);
      setPullDistance(Math.min(distance, threshold * 1.5));
    },
    [disabled, isRefreshing, threshold],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || disabled) return;
    pulling.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
  }, [disabled, isRefreshing, onRefresh, pullDistance, threshold]);

  return {
    isRefreshing,
    pullDistance,
    pullToRefreshProps: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
