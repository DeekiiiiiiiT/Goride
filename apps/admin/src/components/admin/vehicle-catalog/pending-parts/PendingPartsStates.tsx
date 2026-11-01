// Stitch: dominion-redesign/pending_catalog_empty_loading_error_research_off_states
import React from "react";
import type { CatalogResearchStrip } from "../../../../services/pendingPartsCatalogService";
import { PendingResearchStrip } from "./PendingResearchStrip";

export function PendingPartsLoading() {
  return (
    <div className="flex flex-col gap-space-lg rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="flex flex-col gap-space-md md:flex-row md:items-center md:justify-between">
        <span className="font-headline-lg text-headline-lg text-on-surface">Loading part requests…</span>
        <div className="flex items-center gap-2 rounded-xl bg-surface-container-high px-3 py-1">
          <span className="material-symbols-outlined animate-spin text-[16px] text-primary">sync</span>
          <span className="font-mono-sm text-mono-sm font-medium text-primary">Fetching queue and research jobs…</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-space-md">
            <div className="h-3.5 w-24 animate-pulse rounded bg-surface-container-highest" />
            <div className="h-7 w-16 animate-pulse rounded bg-surface-container-high" />
          </div>
        ))}
      </div>
      <div className="space-y-2 rounded-xl bg-surface p-space-md shadow-sm">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-container-high" />
        ))}
      </div>
    </div>
  );
}

type PendingPartsErrorProps = {
  message?: string;
  traceId?: string | null;
  onRetry: () => void;
};

export function PendingPartsError({ message, traceId, onRetry }: PendingPartsErrorProps) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
      <div className="mb-space-md flex items-center gap-1.5 rounded-xl bg-error-container px-2.5 py-1 font-mono-sm text-mono-sm font-semibold text-on-error-container">
        <span className="h-2 w-2 rounded-full bg-error" />
        SERVICE_UNAVAILABLE
      </div>
      <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-xl bg-error-container text-error">
        <span className="material-symbols-outlined text-[32px]">error_outline</span>
      </div>
      <h4 className="mb-space-sm font-headline-xl text-headline-xl font-semibold tracking-tight text-on-surface">
        Could not load requests.
      </h4>
      <p className="mb-space-lg max-w-md font-body-md text-body-md leading-relaxed text-on-surface-variant">
        {message || "An unexpected aggregation timeout occurred while fetching the pending parts queue."}
      </p>
      <button
        type="button"
        className="flex h-10 items-center gap-2 rounded-xl bg-primary-container px-space-lg font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary"
        onClick={onRetry}
      >
        <span className="material-symbols-outlined text-[18px]">replay</span>
        Retry
      </button>
      {traceId ? (
        <p className="mt-space-md font-mono-sm text-mono-sm text-on-surface-variant">
          Diagnostic trace: {traceId}
        </p>
      ) : null}
    </div>
  );
}

export function PendingPartsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-surface-container-low/50 p-space-xl text-center">
      <div className="mb-space-sm flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant shadow-sm">
        <span className="material-symbols-outlined text-[24px]">inbox</span>
      </div>
      <h2 className="font-headline-md text-headline-md text-on-surface">No part requests.</h2>
      <p className="mt-0.5 max-w-sm font-body-sm text-body-sm text-on-surface-variant">
        When a fleet asks for a part we don&apos;t have, it shows here.
      </p>
    </div>
  );
}

/** Four-panel states kit (S10j) for docs / design QA — not routed in production nav. */
export function PendingPartsStatesMatrixPreview({
  strip,
  token,
  traceId,
}: {
  strip: CatalogResearchStrip | null;
  token?: string;
  traceId?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-space-lg xl:grid-cols-2">
      <div className="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
        <div className="bg-surface-container-low px-space-lg py-space-sm font-mono-sm text-label-xs font-semibold uppercase">
          State 1: Empty
        </div>
        <div className="p-space-lg">
          <PendingResearchStrip token={token} />
          <PendingPartsEmpty />
        </div>
      </div>
      <div className="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
        <div className="bg-surface-container-low px-space-lg py-space-sm font-mono-sm text-label-xs font-semibold uppercase">
          State 2: Loading
        </div>
        <div className="p-space-lg">
          <PendingPartsLoading />
        </div>
      </div>
      <div className="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
        <div className="bg-surface-container-low px-space-lg py-space-sm font-mono-sm text-label-xs font-semibold uppercase">
          State 3: Error
        </div>
        <div className="p-space-lg">
          <PendingPartsError traceId={traceId} onRetry={() => undefined} />
        </div>
      </div>
      <div className="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
        <div className="bg-surface-container-low px-space-lg py-space-sm font-mono-sm text-label-xs font-semibold uppercase">
          State 4: Research off
        </div>
        <div className="p-space-lg">
          <PendingResearchStrip token={token} />
          <p className="mt-space-md font-body-sm text-body-sm text-on-surface-variant">
            Queued rows show — for result part numbers while the crawler is paused.
          </p>
        </div>
      </div>
    </div>
  );
}
