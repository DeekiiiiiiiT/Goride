// Stitch: dominion-redesign/S42l
import type { ReactNode } from "react";
import { CATALOG_SECTION_TABS, type CatalogSectionTab } from "../partsCatalogUrl";

const SCHEMA = "SCHEMA V2.4";

export function FindPartsChrome({
  fitmentCount,
  matchTypesLabel,
  activeTab,
  advancedActive,
  breadcrumbSuffix = [],
  onTab,
  onAdvanced,
  onAddPart,
  onImport,
  onExport,
  owner = true,
  onNavigateDominion,
  onNavigateVehicles,
  children,
}: {
  fitmentCount: number | null;
  matchTypesLabel: string;
  activeTab: CatalogSectionTab | null;
  advancedActive: boolean;
  breadcrumbSuffix?: Array<"ADVANCED TUNE" | "PROBLEMS">;
  onTab: (name: CatalogSectionTab) => void;
  onAdvanced: () => void;
  onAddPart: () => void;
  onImport?: () => void;
  onExport?: () => void;
  owner?: boolean;
  onNavigateDominion: () => void;
  onNavigateVehicles: () => void;
  children: ReactNode;
}) {
  const indexed = fitmentCount == null ? "—" : fitmentCount.toLocaleString();
  const database = activeTab === "Full database";
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const subtitle = database
    ? "Every part, car family and size-based part on file, in one searchable place. Direct catalog overview."
    : "Every part that fits a car, in five match types.";
  const crumb = "font-mono-sm text-mono-sm text-on-surface-variant font-medium hover:text-primary transition-colors bg-transparent p-0";
  return (
    <div className="flex flex-col w-full">
      <div className="find-parts-header px-space-xl pt-space-md pb-space-sm bg-surface-container-lowest shadow-sm flex flex-col gap-space-sm">
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-outline-variant/40">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 font-mono-sm text-mono-sm text-secondary">
            <button type="button" className={crumb} onClick={onNavigateDominion}>DOMINION</button>
            <span className="text-outline/60">/</span>
            <span className="text-on-surface-variant font-medium">MASTER DATA</span>
            <span className="text-outline/60">/</span>
            <button type="button" className={crumb} onClick={onNavigateVehicles}>VEHICLES</button>
            <span className="text-outline/60">/</span>
            <span className={breadcrumbSuffix.length ? "text-on-surface-variant font-medium" : "text-primary font-semibold tracking-wide"}>PARTS DATABASE</span>
            {breadcrumbSuffix.map((label, index) => {
              const last = index === breadcrumbSuffix.length - 1;
              return (
                <span key={label} className="contents">
                  <span className="text-outline/60">/</span>
                  <span className={last ? "font-semibold text-on-surface tracking-wide" : "text-on-surface-variant font-medium"}>{label}</span>
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-low border border-outline-variant/40 text-on-surface font-mono-sm text-mono-sm font-medium shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-container ring-2 ring-primary/20" />
              <span>INDEX: {indexed} FITMENTS</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant/40 text-secondary font-mono-sm text-[10px] uppercase font-semibold">{SCHEMA}</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-space-md pt-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="parts-db-title font-headline-xl text-on-surface tracking-tight">Parts database</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono-sm text-mono-sm font-semibold">LIVE CLUSTER</span>
            </div>
            <p className="font-body-md text-body-md text-secondary mt-1">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {database ? null : (
              <span className="font-mono-sm text-mono-sm uppercase text-secondary bg-surface-container-high px-2.5 py-1 rounded-lg">{matchTypesLabel}</span>
            )}
            {database ? (
              <>
                <button className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:bg-surface-container text-on-surface font-body-sm font-medium disabled:opacity-40" type="button" disabled={!owner} title={owner ? "Import CSV batch" : ownerTitle} onClick={onImport}>
                  <span className="material-symbols-outlined text-[18px] text-secondary">upload_file</span>
                  <span>Import CSV</span>
                </button>
                <button className="flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-surface-container-lowest border border-outline-variant/60 hover:bg-surface-container text-on-surface font-body-sm font-medium disabled:opacity-40" type="button" disabled={!owner} title={owner ? "Export current catalog" : ownerTitle} onClick={onExport}>
                  <span className="material-symbols-outlined text-[18px] text-secondary">download</span>
                  <span>Export CSV</span>
                </button>
              </>
            ) : (
              <button
                className={advancedActive
                  ? "flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-primary-container text-on-primary font-body-sm text-body-sm font-semibold shadow-sm"
                  : "flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-surface-container border border-outline-variant/60 hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium shadow-sm"}
                type="button"
                aria-pressed={advancedActive}
                onClick={onAdvanced}
              >
                <span className={`material-symbols-outlined text-[18px] ${advancedActive ? "text-on-primary" : "text-secondary"}`}>tune</span>
                <span>Advanced tune</span>
              </button>
            )}
            <button
              className="flex items-center gap-1.5 px-4 h-9 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-body-sm text-body-sm font-semibold shadow-sm disabled:opacity-40"
              type="button"
              disabled={database && !owner}
              title={database ? ownerTitle : undefined}
              onClick={onAddPart}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Add a part</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-space-lg mt-2 pt-1 border-t border-outline-variant/30 overflow-x-auto">
          <nav aria-label="Database sections" className="flex items-center gap-space-lg">
            {CATALOG_SECTION_TABS.map((name) => {
              const on = !advancedActive && name === activeTab;
              return (
                <button
                  key={name}
                  className={on
                    ? "pb-2 font-body-md text-body-md text-primary font-semibold relative whitespace-nowrap inline-flex items-center gap-1.5"
                    : "pb-2 font-body-md text-body-md text-secondary hover:text-on-surface font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5"}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => onTab(name)}
                >
                  <span>{name}</span>
                  {name === "Import" ? (
                    <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-secondary text-[10px] font-mono-sm font-bold">CSV</span>
                  ) : null}
                  {on ? <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-primary-container" /> : null}
                </button>
              );
            })}
          </nav>
          {database ? (
            <button className="ml-auto flex items-center gap-1 py-1 px-2.5 rounded-lg text-secondary hover:text-primary hover:bg-surface-container-low font-body-sm font-medium shrink-0" type="button" aria-pressed={advancedActive} onClick={onAdvanced}>
              <span className="material-symbols-outlined text-[16px]">tune</span>
              <span>Advanced tune</span>
            </button>
          ) : (
            <div className="ml-auto hidden lg:flex items-center gap-1.5 text-secondary font-mono-sm text-mono-sm pb-2 shrink-0">
              <span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
              <span className="text-on-surface-variant font-medium">Catalog Level 0</span>
              <span className="text-outline">·</span>
              <span className="text-emerald-700 font-semibold">Audited</span>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
