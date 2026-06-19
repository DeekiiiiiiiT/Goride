import React, { useRef, useState } from 'react';

type Props = {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
};

export function HaulPullToRefresh({ onRefresh, children, className = '' }: Props) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pull = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.scrollY > 0 || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      pull.current = Math.min(delta, 80);
      setPulling(pull.current > 40);
    }
  };

  const handleTouchEnd = () => {
    if (pulling && !refreshing) {
      setRefreshing(true);
      void Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false);
        setPulling(false);
        pull.current = 0;
      });
    } else {
      setPulling(false);
      pull.current = 0;
    }
  };

  return (
    <div
      className={className}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className={`flex items-center justify-center overflow-hidden text-[#ffc174] transition-all duration-200 ${
          pulling || refreshing ? 'h-10 opacity-100' : 'h-0 opacity-0'
        }`}
      >
        <span className={`material-symbols-outlined ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
        <span className="ml-2 text-sm font-medium">{refreshing ? 'Updating…' : 'Pull to refresh'}</span>
      </div>
      {children}
    </div>
  );
}
