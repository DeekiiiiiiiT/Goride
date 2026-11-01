// Stitch: dominion-redesign/pending_catalog_automated_research_queue_parts_tab
import React, { useEffect, useState } from "react";
import {
  fetchCatalogResearchStrip,
  patchCatalogResearchSettings,
  type CatalogResearchStrip,
} from "../../../../services/pendingPartsCatalogService";
import { buildS10eStripViewModel } from "./pendingCatalogViewModels";

export function PendingResearchStrip({
  token,
  onStripChange,
}: {
  token: string | undefined;
  onStripChange?: (strip: CatalogResearchStrip | null) => void;
}) {
  const [strip, setStrip] = useState<CatalogResearchStrip | null>(null);

  const reload = () => {
    if (!token) return;
    void fetchCatalogResearchStrip(token)
      .then((next) => {
        setStrip(next);
        onStripChange?.(next);
      })
      .catch(() => {
        setStrip(null);
        onStripChange?.(null);
      });
  };

  useEffect(() => {
    reload();
  }, [token]);

  if (!strip) return null;

  const vm = buildS10eStripViewModel(strip);

  const toggleDispatcher = () => {
    if (!token) return;
    if (!strip.enabled) {
      void patchCatalogResearchSettings(token, { enabled: true, paused: false }).then(reload);
      return;
    }
    void patchCatalogResearchSettings(token, { paused: !strip.paused }).then(reload);
  };

  if (!strip.enabled) {
    return (
      <div className="mb-space-lg flex flex-wrap items-center justify-between gap-space-md rounded-xl bg-surface-container-high p-space-md shadow-sm">
        <div className="flex items-center gap-space-sm">
          <span className="h-2 w-2 rounded-full bg-outline" />
          <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
            Research is off. Requests wait here until you turn it on.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-space-md">
          <span className="font-mono-sm text-mono-sm text-on-surface-variant font-medium">{vm.todayJobsLabel.replace("Today", "Queue · Paused · Today")}</span>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary-container px-space-md font-body-sm text-body-sm font-semibold text-on-primary shadow-sm hover:bg-primary"
            onClick={toggleDispatcher}
          >
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
            Turn on
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-space-lg flex w-full flex-wrap items-center justify-between gap-space-md rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
      <div className="flex flex-wrap items-center gap-space-md">
        <div className="flex items-center gap-2 rounded-full bg-surface-container-low px-2.5 py-1">
          <span className="relative flex h-2 w-2">
            {vm.showPing ? (
              <>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </>
            ) : (
              <span className="relative inline-flex h-2 w-2 rounded-full bg-outline" />
            )}
          </span>
          <span className="font-mono-sm text-mono-sm font-semibold uppercase tracking-wider text-on-surface">
            {vm.researchStatusLabel}
          </span>
        </div>
        {strip.shadowMode !== false ? (
          <>
            <span className="hidden h-4 w-px bg-surface-container-high sm:block" />
            <span className="rounded-md bg-surface-container px-2 py-0.5 font-mono-sm text-mono-sm font-medium text-on-surface-variant">
              Shadow mode
            </span>
            <span className="hidden font-body-sm text-body-sm text-secondary md:inline">
              Everything goes to review until 20 approvals in a row{" "}
              <span className="ml-1 font-mono-sm text-mono-sm font-semibold text-on-surface">
                ({strip.shadowStreak ?? 0} / 20)
              </span>
            </span>
          </>
        ) : null}
        <span className="hidden h-4 w-px bg-surface-container-high lg:block" />
        <div className="flex flex-wrap items-center gap-space-sm font-mono-sm text-mono-sm text-secondary">
          <span>
            Queue <span className="font-semibold text-primary">{strip.queued}</span>
          </span>
          <span className="text-outline">·</span>
          <span>
            Working on <span className="font-semibold text-primary">{strip.workingOn ?? 0}</span>
          </span>
          <span className="text-outline">·</span>
          <span>
            Needs you <span className="font-semibold text-error">{strip.needsReview}</span>
          </span>
          <span className="text-outline">·</span>
          <span>
            Failed <span className="font-semibold text-on-surface">{strip.failed}</span>
          </span>
          <span className="text-outline">·</span>
          <span className="text-secondary">
            {vm.todayJobsLabel.replace("Today ", "Today ")}
          </span>
        </div>
      </div>
      <a
        className="flex items-center gap-1 font-body-sm text-body-sm font-medium text-primary hover:underline"
        href="?page=pending-catalog-research"
      >
        <span>Research settings</span>
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </a>
    </div>
  );
}

export function PendingResearchHeaderActions({
  token,
  strip,
  onRefreshStrip,
  onQueuePriority,
  busy,
}: {
  token: string | undefined;
  strip: CatalogResearchStrip | null;
  onRefreshStrip: () => void;
  onQueuePriority: () => void;
  busy?: boolean;
}) {
  if (!strip) return null;
  const vm = buildS10eStripViewModel(strip);

  const toggleDispatcher = () => {
    if (!token) return;
    if (!strip.enabled) {
      void patchCatalogResearchSettings(token, { enabled: true, paused: false }).then(onRefreshStrip);
      return;
    }
    void patchCatalogResearchSettings(token, { paused: !strip.paused }).then(onRefreshStrip);
  };

  return (
    <div className="mb-space-md flex flex-wrap items-center justify-end gap-space-sm">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-container-low px-space-md font-body-sm text-body-sm font-medium text-on-surface shadow-sm hover:bg-surface-container"
        disabled={busy}
        onClick={onQueuePriority}
      >
        <span className="material-symbols-outlined text-[17px] text-secondary">tune</span>
        Queue Priority
      </button>
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary-container px-space-md font-body-sm text-body-sm font-medium text-on-primary shadow-sm hover:opacity-95"
        disabled={busy || !strip.enabled}
        onClick={toggleDispatcher}
      >
        <span className="material-symbols-outlined text-[17px]">
          {vm.dispatcherLabel === "Pause Dispatcher" ? "pause" : "play_arrow"}
        </span>
        {vm.dispatcherLabel}
      </button>
    </div>
  );
}
