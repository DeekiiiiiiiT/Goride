import { useCallback, useRef, useState } from 'react';

type UsePullToRefreshOptions = {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
};

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const scrollRef = useRef<HTMLElement | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current?.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchEnd = useCallback(
    async (e: React.TouchEvent) => {
      if (scrollRef.current?.scrollTop !== 0 || refreshing) return;
      const delta = e.changedTouches[0].clientY - touchStartY.current;
      if (delta < threshold) return;
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        window.setTimeout(() => setRefreshing(false), 400);
      }
    },
    [onRefresh, refreshing, threshold],
  );

  return { refreshing, scrollRef, handleTouchStart, handleTouchEnd };
}
