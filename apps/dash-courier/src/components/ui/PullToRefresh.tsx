import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type PullToRefreshProps = {
  refreshing: boolean;
  children: React.ReactNode;
  scrollRef: React.RefObject<HTMLElement | null>;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  className?: string;
};

export function PullToRefresh({
  refreshing,
  children,
  scrollRef,
  onTouchStart,
  onTouchEnd,
  className = '',
}: PullToRefreshProps) {
  return (
    <>
      <div
        className={`overflow-hidden transition-[height] duration-300 bg-surface-container-low text-primary flex justify-center items-center shrink-0 ${
          refreshing ? 'h-[52px]' : 'h-0'
        }`}
      >
        <MaterialIcon name="refresh" className={`text-xl ${refreshing ? 'courier-spin-slow' : ''}`} />
      </div>
      <main
        ref={scrollRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={className}
      >
        {children}
      </main>
    </>
  );
}
