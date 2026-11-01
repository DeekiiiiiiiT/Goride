import React from "react";

export function PendingPartsEmpty() {
  return (
    <div className="flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
        <h3 className="font-headline-lg text-headline-lg text-on-surface">State 1: Empty State (Zero Requests)</h3>
        <span className="font-mono-sm text-mono-sm font-medium text-on-surface-variant">TAB: PARTS REQUEST QUEUE</span>
      </div>
    <div className="rounded-xl bg-surface-container-lowest p-space-xl shadow-sm flex flex-col items-center justify-center text-center">
      <div className="relative z-10 flex max-w-xl flex-col items-center py-space-md">
        <div className="mb-space-lg flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant">
          <span className="material-symbols-outlined text-[32px] text-secondary">inbox</span>
        </div>
        <h4 className="font-headline-xl text-headline-xl text-on-surface mb-space-sm">No part requests.</h4>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md leading-relaxed">
          When a fleet asks for a part we don't have, it shows here.
        </p>
      </div>
    </div>
    </div>
  );
}

export function PendingPartsLoading() {
  return (
    <div className="flex flex-col gap-space-lg rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex flex-col gap-space-md md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="font-headline-lg text-headline-lg text-on-surface">State 2: Loading State (Parts Queue Shimmer)</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-1">
          <span className="material-symbols-outlined animate-spin text-[16px] text-primary">refresh</span>
          <span className="font-mono-sm text-mono-sm font-medium text-primary">
            Querying pending queue across all fleet nodes… (142ms)
          </span>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-space-md pb-space-sm md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <div className="h-9 w-36 animate-pulse rounded-xl bg-surface-container" />
          <div className="h-9 w-28 animate-pulse rounded-xl bg-surface-container-low" />
          <div className="h-9 w-32 animate-pulse rounded-xl bg-surface-container-low" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-64 animate-pulse rounded-xl bg-surface-container-low" />
          <div className="h-9 w-24 animate-pulse rounded-xl bg-surface-container" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-space-md">
            <div className="h-3.5 w-24 animate-pulse rounded bg-surface-container-highest" />
            <div className="h-7 w-16 animate-pulse rounded bg-surface-container-high" />
            <div className="mt-1 h-3 w-40 animate-pulse rounded bg-surface-variant" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl bg-surface shadow-sm">
        <div className="grid grid-cols-12 gap-gutter bg-surface-container-low px-space-md py-2.5 font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          <div className="col-span-1">Status</div>
          <div className="col-span-3">Chassis &amp; Engine Variant</div>
          <div className="col-span-3">Requested Part / Component</div>
          <div className="col-span-2">Match Class</div>
          <div className="col-span-1">Fleet Nodes</div>
          <div className="col-span-2 text-right">Ingress Actions</div>
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-surface-variant px-space-md py-3">
            <div className="h-4 flex-1 animate-pulse rounded bg-surface-container-high" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-container" />
            <div className="h-8 w-16 animate-pulse rounded-lg bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  );
}

type PendingPartsErrorProps = {
  message?: string;
  onRetry: () => void;
};

export function PendingPartsError({ message, onRetry }: PendingPartsErrorProps) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
      <div className="mb-space-md flex items-center gap-1.5 rounded-xl bg-error-container px-2.5 py-1 font-mono-sm text-mono-sm font-semibold text-on-error-container">
        <span className="h-2 w-2 rounded-full bg-error" />
        SERVICE_UNAVAILABLE
      </div>
      <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-xl bg-error-container text-error">
        <span className="material-symbols-outlined text-[32px]">error_outline</span>
      </div>
      <p className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight mb-space-sm">
        State 3: Error State
      </p>
      <h4 className="font-headline-xl text-headline-xl text-on-surface font-semibold tracking-tight mb-space-sm">
        Could not load requests.
      </h4>
      <p className="font-body-md text-body-md text-on-surface-variant mb-space-lg max-w-md leading-relaxed">
        {message ||
          "An unexpected aggregation timeout occurred while fetching the pending parts queue."}
      </p>
      <button
        type="button"
        className="flex h-10 items-center gap-2 rounded-xl bg-primary-container px-space-lg font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary"
        onClick={onRetry}
      >
        <span className="material-symbols-outlined text-[18px]">replay</span>
        Retry
      </button>
    </div>
  );
}
