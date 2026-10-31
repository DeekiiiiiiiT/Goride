import { useMemo, useState, type ReactNode } from "react";
import type { Fp5ViewModel } from "../findPartsViewModels";
import type { TrimScopeTab } from "../findPartsActions";

const STITCH_TIER1_HEADING = "Made for your car";

export type Fp5Actions = {
  onAskRoam: () => void;
  onDownloadReport: () => void;
  onSaveQuery: () => void;
  onUseInService: () => void;
  onOpenRow: (id: string) => void;
  onOpenBest: () => void;
  onTrimScope: (scope: TrimScopeTab) => void;
  onFilterTab: (tab: "all" | "oem") => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  onEditPartCategory: () => void;
  children?: ReactNode;
};

export function Fp5Screen({ actions, data, partName }: { actions: Fp5Actions; data: Fp5ViewModel; partName?: string }) {
  const titlePart = partName || data.componentTitle || "Part";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const best = data.rows.find((row) => row.isBest) || data.rows[0];
  const fitsAllLabel = `Fits all ${data.filterAllCount || 0} trims`;
  const onlyTrimLabel = data.trimLabel && data.trimLabel !== "None yet"
    ? `Only ${data.trimLabel}`
    : "Only this version";
  const sections = useMemo(() => (data.tierSections.length ? data.tierSections : []), [data.tierSections]);

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root">
        <div className="flex flex-col w-full gap-space-xl py-space-xl">
          <div className="sticky top-0 z-20 bg-surface-container-lowest shadow-sm rounded-lg px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center flex-wrap gap-space-sm font-label-code text-caption text-on-surface-variant">
              <span className="text-secondary flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px]">inventory_2</span>
                Fleet Spares
              </span>
              <span className="text-outline-variant">/</span>
              <button type="button" className="inline-flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1 rounded text-on-surface font-label-plate text-body-sm shadow-sm hover:bg-surface-container transition-colors" onClick={actions.onChangeCar}>
                <span className="material-symbols-outlined text-secondary text-[16px]">directions_car</span>
                <span>{data.vehicleLabel} · {data.plate}</span>
              </button>
              <span className="text-outline-variant">›</span>
              <button type="button" className="inline-flex items-center gap-space-xs bg-secondary-container/40 px-space-sm py-1 rounded text-on-secondary-fixed font-body-sm shadow-sm hover:bg-secondary-container transition-colors" onClick={actions.onEditPartCategory}>
                <span className="material-symbols-outlined text-[16px]">filter_alt</span>
                <span className="font-semibold">{titlePart}</span>
              </button>
              {data.chassisLabel !== "—" ? (
                <>
                  <span className="hidden md:inline-flex text-outline-variant">·</span>
                  <span className="hidden md:inline-flex items-center gap-1 bg-surface-container-highest px-2 py-0.5 rounded font-label-code text-[11px] text-on-surface-variant">
                    CHASSIS {data.chassisLabel}
                  </span>
                </>
              ) : null}
            </div>
            <button type="button" className="flex items-center gap-1 text-on-surface-variant hover:text-primary font-body-sm text-caption px-space-sm py-1 rounded bg-surface-container transition-colors" onClick={actions.onSaveQuery}>
              <span className="material-symbols-outlined text-[15px]">bookmark_border</span>
              <span className="hidden sm:inline">Save query</span>
            </button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg">
            <div className="flex flex-col gap-1 max-w-3xl">
              <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-tight">
                {titlePart} for your {data.vehicleLabel}
                {data.trimLabel && data.trimLabel !== "None yet" ? ` (${data.trimLabel})` : ""}
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Viewing verified compatible parts cataloged for {data.chassisLabel !== "—" && data.chassisLabel !== "None yet" ? `chassis ${data.chassisLabel}` : "your vehicle"}.
              </p>
            </div>
            <div className="flex items-center gap-space-sm bg-surface-container-lowest p-space-md rounded-xl shadow-sm">
              <div className="flex flex-col pr-space-md">
                <span className="font-caption text-caption text-on-surface-variant uppercase">Compatible Match Pool</span>
                <span className="font-label-code text-headline-sm text-on-surface">{data.matchCount} catalog items</span>
              </div>
              <span className="material-symbols-outlined text-[22px] text-primary">verified</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-space-md p-space-xs bg-surface-container-lowest rounded-xl shadow-sm">
            <button type="button" className={`px-space-sm py-1.5 rounded-lg font-body-sm text-body-sm transition-colors ${data.activeFilterTab === "all" ? "bg-primary text-on-primary font-semibold shadow-sm" : "bg-surface-container-low text-on-surface-variant"}`} onClick={() => actions.onFilterTab("all")}>
              All matches ({data.filterAllCount})
            </button>
            <button type="button" className={`px-space-sm py-1.5 rounded-lg font-body-sm text-body-sm transition-colors ${data.activeFilterTab === "oem" ? "bg-primary text-on-primary font-semibold shadow-sm" : "bg-surface-container-low text-on-surface-variant"}`} onClick={() => actions.onFilterTab("oem")}>
              Direct OEM only ({data.filterOemCount})
            </button>
            <span className="font-caption text-caption text-on-surface-variant uppercase font-semibold ml-auto">Trim Scope:</span>
            <div className="inline-flex p-0.5 rounded-lg bg-surface-container-low text-caption font-body-sm">
              <button type="button" className={`px-space-sm py-1 rounded transition-colors ${data.activeTrimScope === "all" ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onTrimScope("all")}>
                {fitsAllLabel}
              </button>
              <button type="button" className={`px-space-sm py-1 rounded transition-colors ${data.activeTrimScope === "specific" ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onTrimScope("specific")}>
                {onlyTrimLabel}
              </button>
            </div>
          </div>

          {best && best.id !== "empty" ? (
            <div className="relative bg-surface-container-lowest rounded-xl shadow-md p-space-lg md:p-space-xl overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary" />
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-xl pl-space-xs">
                <div className="flex flex-col gap-space-md flex-1">
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <span className="inline-flex items-center gap-1 bg-surface-container-highest text-primary font-label-code text-caption font-semibold px-2.5 py-1 rounded">
                      <span className="material-symbols-outlined text-[14px]">star</span>
                      Top recommended
                    </span>
                    {best.verified ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 font-body-sm text-caption px-2.5 py-1 rounded font-semibold">
                        Verified fit
                      </span>
                    ) : null}
                  </div>
                  <div className="font-label-code text-headline-sm md:text-headline-lg font-bold text-on-surface tracking-tight">
                    {best.brandLabel} {best.partNumber} — {best.partName}
                  </div>
                  <p className="font-caption text-caption text-on-surface-variant">{data.gtinLine !== "None yet" ? data.gtinLine : null}</p>
                  {data.scheduleLine !== "None yet" ? (
                    <p className="font-body-md text-body-md text-on-surface-variant">{data.scheduleLine}</p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-space-xs shrink-0 lg:w-64">
                  <button type="button" className="w-full h-10 px-space-md rounded-lg bg-primary text-on-primary font-body-sm font-semibold hover:bg-inverse-surface transition-all flex items-center justify-center gap-2 shadow-sm" onClick={actions.onUseInService}>
                    <span className="material-symbols-outlined text-[18px]">build</span>
                    <span>Use in a service log</span>
                  </button>
                  <button type="button" className="h-9 px-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm font-medium transition-colors flex items-center justify-center gap-1" onClick={actions.onOpenBest}>
                    <span>Details</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between mb-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Structured Match Categories</span>
              <span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{data.filterAllCount} MATCHES FOUND</span>
            </div>
            <span className="font-caption text-caption text-on-surface-variant hidden sm:inline">Click any row to reveal fitment specs</span>
          </div>

          <div className="flex flex-col gap-space-lg">
            {!sections.some((section) => section.tier === 1) ? (
              <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden p-space-md pl-space-lg">
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{STITCH_TIER1_HEADING}</span>
              </div>
            ) : null}
            {sections.map((section) => (
              <div key={section.tier} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm p-space-md bg-surface-container-low/60 pl-space-lg">
                  <div className="flex items-center flex-wrap gap-space-sm">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {section.tier === 1 ? STITCH_TIER1_HEADING : section.heading}
                    </span>
                    <span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface">{section.count}</span>
                    <span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface">{section.tag}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">{section.description}</p>
                </div>
                {section.rows.map((row) => {
                  const open = expanded[row.id];
                  return (
                    <div key={row.id} className="border-t border-surface-container-high">
                      <button
                        type="button"
                        className="p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md hover:bg-surface-container-low/30 transition-colors w-full text-left"
                        onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                      >
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-space-sm">
                            <span className="font-headline-sm text-body-lg font-bold text-on-surface">{row.partName}</span>
                            <span className="font-label-code text-body-md font-semibold text-primary">{row.brandLabel} {row.partNumber}</span>
                            {row.isOemTier ? (
                              <span className="font-caption text-caption text-on-surface-variant">Direct drop-in replacement</span>
                            ) : null}
                            {row.verified ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-caption text-caption font-semibold">
                                Verified
                              </span>
                            ) : row.matchPercent !== "—" ? (
                              <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                                {row.matchPercent}
                              </span>
                            ) : null}
                            <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">{row.scopeNote}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {row.isBest ? (
                            <span className="font-caption text-caption text-secondary font-semibold">Best match</span>
                          ) : null}
                          <button type="button" className="text-primary font-body-sm text-caption hover:underline" onClick={(e) => { e.stopPropagation(); actions.onOpenRow(row.id); }}>
                            Open detail
                          </button>
                          <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${open ? "rotate-180" : ""}`}>expand_more</span>
                        </div>
                      </button>
                      {open ? (
                        <div className="px-space-lg pb-space-lg bg-surface-container-low/20 flex flex-col gap-space-sm">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                            {row.specLines.map((spec) => (
                              <div key={`${row.id}-${spec.label}`} className="font-body-sm text-body-sm text-on-surface-variant">
                                <span className="font-semibold text-on-surface">{spec.label}:</span> {spec.value}
                              </div>
                            ))}
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            <span className="font-semibold text-on-surface">Interchange:</span> {row.interchangeLine}
                          </p>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            <span className="font-semibold text-on-surface">Service Schedule:</span> {row.scheduleLine}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {data.emptyTierNotes.map((note) => (
            <div key={note} className="bg-surface-container-low rounded-xl p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md">
              <p className="font-body-sm text-body-sm text-on-surface-variant">{note}</p>
              <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-lowest hover:bg-surface text-primary font-body-sm font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0" onClick={actions.onAskRoam}>
                <span>Ask Roam to find another option</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          ))}

          <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md shadow-sm">
            <p className="font-body-md text-body-sm text-on-surface-variant">
              Don&apos;t see the right part? Ask Roam to add it to the catalog.
            </p>
            <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-lowest hover:bg-surface text-primary font-body-sm font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0" onClick={actions.onAskRoam}>
              <span>Ask Roam to add this part</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-lg border-t border-surface-container-high">
            <button type="button" className="w-full sm:w-auto px-space-lg py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-body-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm" onClick={actions.onBackToPartSelection}>
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Back to part selection</span>
            </button>
            <button type="button" className="w-full sm:w-auto px-space-lg py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-body-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm" onClick={actions.onDownloadReport}>
              <span className="material-symbols-outlined text-[18px]">file_download</span>
              <span>Download fitment report</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
