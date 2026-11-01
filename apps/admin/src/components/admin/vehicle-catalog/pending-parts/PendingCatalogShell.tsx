import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

export type PendingCatalogTabId = "vehicles" | "parts";

function syncLabel(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

export function PendingCatalogShell({
  catalogTab,
  onTabChange,
  vehiclesCount,
  partsCount,
  syncSeconds,
  onRefreshVehicles,
  vehiclesRefreshing,
  children,
}: {
  catalogTab: PendingCatalogTabId;
  onTabChange: (tab: PendingCatalogTabId) => void;
  vehiclesCount: number;
  partsCount: number;
  syncSeconds: number;
  onRefreshVehicles?: () => void;
  vehiclesRefreshing?: boolean;
  children: ReactNode;
}) {
  const syncText = `ONLINE (SYNC ${syncLabel(syncSeconds).toUpperCase()})`;

  return (
    <div className="flex w-full flex-col bg-surface p-margin text-on-surface">
      <nav
        aria-label="Breadcrumb"
        className="mb-space-md flex flex-wrap items-center font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant"
      >
        <span>DOMINION</span>
        <span className="mx-2 text-on-surface-variant">›</span>
        <span>MASTER DATA</span>
        <span className="mx-2 text-on-surface-variant">›</span>
        <span>VEHICLES</span>
        <span className="mx-2 text-on-surface-variant">›</span>
        <span className="font-medium text-primary">PENDING CATALOG</span>
      </nav>

      <div className="flex flex-col justify-between pb-space-lg md:flex-row md:items-end">
        <div className="space-y-space-xs">
          <div className="flex items-center gap-space-sm">
            <h1 className="font-headline-xl text-headline-xl tracking-tight text-on-surface">Pending catalog</h1>
            <span className="inline-flex items-center rounded-full bg-surface-container px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface-variant">
              QUEUE ACTIVE
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">Cars and parts that apps have asked us to add.</p>
        </div>
        <div className="flex items-center gap-space-md pt-space-sm md:pt-0">
          <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-1.5 text-on-surface shadow-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary-container" />
            <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant">Ingestion engine:</span>
            <span className="font-mono-sm text-mono-sm font-semibold text-primary">{syncText}</span>
          </div>
          {catalogTab === "vehicles" && onRefreshVehicles ? (
            <button
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface-container px-3 py-1.5 font-label-md text-label-md font-medium text-on-surface transition-colors hover:bg-surface-variant"
              type="button"
              onClick={onRefreshVehicles}
              disabled={vehiclesRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${vehiclesRefreshing ? "animate-spin" : ""}`} aria-hidden />
              Refresh queue
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-space-lg flex items-center gap-space-lg">
        <button
          type="button"
          className={`group flex cursor-pointer items-center gap-2 pb-2.5 transition-colors ${
            catalogTab === "vehicles"
              ? "relative pb-2 font-semibold text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          onClick={() => onTabChange("vehicles")}
        >
          <span className="font-headline-md text-headline-md font-medium">Vehicles</span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono-sm text-mono-sm ${
              catalogTab === "vehicles"
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container text-on-surface-variant group-hover:bg-surface-variant"
            }`}
          >
            {vehiclesCount}
          </span>
          {catalogTab === "vehicles" ? (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary-container" />
          ) : null}
        </button>
        <button
          type="button"
          className={`flex cursor-pointer items-center gap-2 pb-2 transition-colors ${
            catalogTab === "parts"
              ? "relative pb-2 font-semibold text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          onClick={() => onTabChange("parts")}
        >
          <span className="font-headline-md text-headline-md">Parts</span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono-sm text-mono-sm ${
              catalogTab === "parts"
                ? "bg-primary-container text-on-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {partsCount}
          </span>
          {catalogTab === "parts" ? (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary-container" />
          ) : null}
        </button>
      </div>

      {children}
    </div>
  );
}
