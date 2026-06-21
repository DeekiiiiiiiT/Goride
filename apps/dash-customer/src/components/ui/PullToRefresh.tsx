import { useCallback, useRef, useState, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onRefresh: () => Promise<void> | void;
  className?: string;
};

export function PullToRefresh({ children, onRefresh, className = '' }: Props) {
  const [pulling, setPulling] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setPulling(0);
    }
  }, [onRefresh]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (refreshing || !containerRef.current || containerRef.current.scrollTop > 0) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPulling(Math.min(delta * 0.5, 80));
  };

  const onTouchEnd = () => {
    if (pulling >= 60 && !refreshing) {
      void handleRefresh();
    } else {
      setPulling(0);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        className="absolute left-0 right-0 flex justify-center pointer-events-none z-10 transition-opacity"
        style={{ top: Math.max(pulling - 28, 0), opacity: pulling > 10 || refreshing ? 1 : 0 }}
      >
        <div
          className={`w-8 h-8 rounded-full border-2 border-primary-container border-t-transparent ${
            refreshing ? 'animate-spin' : ''
          }`}
          style={{ transform: refreshing ? undefined : `rotate(${pulling * 3}deg)` }}
        />
      </div>
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="h-full overflow-y-auto"
        style={{ transform: pulling ? `translateY(${pulling}px)` : undefined, transition: pulling ? 'none' : 'transform 0.2s' }}
      >
        {children}
      </div>
    </div>
  );
}
