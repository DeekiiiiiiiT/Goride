import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";

export type PendingCatalogTabId = "vehicles" | "parts" | "conflicts" | "settings";

function syncLabel(sec: number): string {
  if (sec < 60) return `${sec}s ago`;
  return `${Math.round(sec / 60)}m ago`;
}

const TAB_TITLES: Record<PendingCatalogTabId, { title: string; subtitle: string }> = {
  vehicles: { title: "Pending catalog", subtitle: "Cars waiting for approval." },
  parts: { title: "Pending catalog", subtitle: "Parts waiting for approval." },
  conflicts: {
    title: "Auto-match conflicts",
    subtitle: "Automated cross-reference discrepancies requiring catalog architect resolution before public propagation.",
  },
  settings: { title: "Settings & Health", subtitle: "Research intake and catalog health." },
};

const TAB_ICONS: Record<PendingCatalogTabId, string> = {
  parts: "build_circle",
  vehicles: "directions_car",
  conflicts: "published_with_changes",
  settings: "health_and_safety",
};

export function PendingCatalogShell({
  catalogTab,
  onTabChange,
  vehiclesCount,
  partsCount,
  conflictsCount,
  syncSeconds,
  conflictsHeaderActions,
  onRefreshVehicles,
  vehiclesRefreshing,
  children,
}: {
  catalogTab: PendingCatalogTabId;
  onTabChange: (tab: PendingCatalogTabId) => void;
  vehiclesCount: number;
  partsCount: number;
  conflictsCount: number;
  syncSeconds: number;
  conflictsHeaderActions?: ReactNode;
  onRefreshVehicles?: () => void;
  vehiclesRefreshing?: boolean;
  children: ReactNode;
}) {
  const syncText = `ONLINE (SYNC ${syncLabel(syncSeconds).toUpperCase()})`;
  const meta = TAB_TITLES[catalogTab];
  const isConflicts = catalogTab === "conflicts";

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
        <span className="mx-2 text-on-surface-variant">›</span>
        <span className="font-medium text-on-surface">{meta.title.toUpperCase()}</span>
      </nav>

      <div className="flex flex-col justify-between gap-space-md pb-space-lg md:flex-row md:items-end">
        <div className="space-y-space-xs min-w-0">
          <div className="flex items-center gap-space-sm">
            <h1 className="font-headline-xl text-headline-xl tracking-tight text-on-surface">{meta.title}</h1>
            {catalogTab === "vehicles" ? (
              <span className="inline-flex items-center rounded-full bg-surface-container px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface-variant">
                QUEUE ACTIVE
              </span>
            ) : null}
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">{meta.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm pt-space-sm md:pt-0 shrink-0">
          {isConflicts && conflictsHeaderActions ? conflictsHeaderActions : null}
          {!isConflicts ? (
            <div className="flex items-center gap-2 rounded-xl bg-surface-container-lowest px-3 py-1.5 text-on-surface shadow-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary-container" />
              <span className="font-mono-sm text-mono-sm uppercase tracking-wider text-on-surface-variant">Ingestion engine:</span>
              <span className="font-mono-sm text-mono-sm font-semibold text-primary">{syncText}</span>
            </div>
          ) : null}
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

      <div className="mb-space-lg flex flex-wrap items-center gap-space-xs border-b border-surface-variant">
        {([
          ["parts", "Parts", partsCount],
          ["vehicles", "Vehicles", vehiclesCount],
          ["conflicts", "Auto-match conflicts", conflictsCount],
          ["settings", "Settings & Health", null],
        ] as const).map(([id, label, count]) => {
          const active = catalogTab === id;
          return (
            <button
              key={id}
              type="button"
              className={`group relative flex cursor-pointer items-center gap-2 rounded-t-lg px-4 py-2.5 font-label-md text-label-md transition-colors ${
                active
                  ? "bg-surface-container font-semibold text-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              }`}
              onClick={() => onTabChange(id)}
            >
              <span className={`material-symbols-outlined text-[18px] ${active ? "text-primary" : ""}`}>{TAB_ICONS[id]}</span>
              <span>{label}</span>
              {count != null ? (
                <span
                  className={`am-pending-tab-count rounded-full px-1.5 py-0.5 font-mono-sm text-mono-sm font-bold ${
                    active ? "am-pending-tab-count-active bg-primary-container text-on-primary" : "bg-surface-container-high text-outline"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
