import React from 'react';

type Props = {
  className?: string;
};

export function HaulSkeleton({ className = '' }: Props) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[#2d3449]/60 ${className}`}
      aria-hidden
    />
  );
}

export function HaulTripCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#534434] bg-[#171f33] p-4">
      <div className="mb-3 flex justify-between">
        <HaulSkeleton className="h-4 w-24" />
        <HaulSkeleton className="h-4 w-16" />
      </div>
      <HaulSkeleton className="mb-2 h-5 w-3/4" />
      <HaulSkeleton className="h-4 w-1/2" />
    </div>
  );
}

export function HaulEarningsSummarySkeleton() {
  return (
    <div className="rounded-xl border border-[#534434] bg-[#171f33] p-6">
      <HaulSkeleton className="mb-2 h-3 w-24" />
      <HaulSkeleton className="mb-4 h-12 w-40" />
      <div className="flex gap-4">
        <HaulSkeleton className="h-16 w-20" />
        <HaulSkeleton className="h-16 w-20" />
        <HaulSkeleton className="h-16 w-20" />
      </div>
    </div>
  );
}
