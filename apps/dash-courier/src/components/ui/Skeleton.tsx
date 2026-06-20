import React from 'react';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-surface-container-high rounded-lg animate-pulse ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl p-4 shadow-soft space-y-3">
      <div className="flex gap-3">
        <Skeleton className="w-12 h-12 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

export function SkeletonEarnings() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 pt-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
