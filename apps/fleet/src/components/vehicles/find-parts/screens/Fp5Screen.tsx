import { useMemo, useState, type ReactNode } from "react";
import type { Fp5ResultRow, Fp5ViewModel } from "../findPartsViewModels";
import type { TrimScopeTab } from "../findPartsActions";
import { FindPartsStickyHeader } from "../FindPartsStickyHeader";
import { FpNowOnFileNotice } from "./FpNowOnFileNotice";

const STITCH_TIER1_HEADING = "Made for your car";

function groupRowsForPositionSubheads(rows: Fp5ResultRow[]): Array<{ subhead: string | null; rows: Fp5ResultRow[] }> {
  const labels = rows.map((r) => r.positionLabel).filter((l): l is string => Boolean(l));
  const unique = new Set(labels);
  if (unique.size <= 1) return [{ subhead: null, rows }];
  const order = ["Front", "Rear", "Front & rear"];
  const buckets = new Map<string, Fp5ResultRow[]>();
  for (const row of rows) {
    const key = row.positionLabel || "Other";
    const list = buckets.get(key) || [];
    list.push(row);
    buckets.set(key, list);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return keys.map((key) => ({ subhead: key, rows: buckets.get(key) || [] }));
}

export type Fp5Actions = {
  onAskRoam: () => void;
  onAskForTier?: (matchType: string) => void;
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

export function Fp5Screen({ actions, data, partName, positionTrail, catalogNotice }: { actions: Fp5Actions; data: Fp5ViewModel; partName?: string; positionTrail?: string; catalogNotice?: string }) {
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
          <FindPartsStickyHeader
            step={5}
            onBack={actions.onBackToPartSelection}
            vehicleLabel={data.vehicleLabel}
            plate={data.plate}
            versionTag={data.trimBadge || data.trimLabel}
            partTrailLabel={titlePart}
            resultsTrailLabel={positionTrail || "4. Rear · Both sides"}
            onSaveSearch={actions.onSaveQuery}
            onDownloadFitmentReport={actions.onDownloadReport}
          />
          <FpNowOnFileNotice message={catalogNotice || ""} />

          {data.vinLabel !== "—" ? (
            <p className="font-label-code text-caption text-on-surface-variant -mt-space-md">
              VIN: {data.vinLabel}
            </p>
          ) : null}

          <section className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
            <div className="flex flex-col gap-1">
              <div className="inline-flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption uppercase tracking-wider">
                <span>{data.archiveEyebrow}</span>
              </div>
              <h1 className="font-headline-xl text-headline-xl tracking-tight text-on-surface">
                {data.resultsHeadline}
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant flex items-center gap-space-xs flex-wrap">
                {data.trimSeriesLabel !== "None yet" ? (
                  <>
                    <span>{data.trimSeriesLabel}</span>
                    <span className="text-outline-variant">·</span>
                  </>
                ) : null}
                {data.engineLayoutLabel !== "None yet" ? (
                  <>
                    <span className="font-label-code text-caption bg-surface-container px-1 rounded">{data.engineLayoutLabel}</span>
                    <span className="text-outline-variant">·</span>
                  </>
                ) : null}
                {data.drivetrainLabel !== "None yet" ? (
                  <>
                    <span>{data.drivetrainLabel}</span>
                    <span className="text-outline-variant">·</span>
                  </>
                ) : null}
                {data.chassisCodeLabel !== "None yet" ? (
                  <span>
                    Chassis code <strong className="font-label-code font-bold text-on-surface">{data.chassisCodeLabel}</strong>
                  </span>
                ) : null}
              </p>
            </div>
            {data.catalogSpecLabel !== "None yet" ? (
            <div className="flex items-center gap-2 p-2 bg-surface-container-lowest rounded-xl shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
              <span className="font-label-code text-caption text-on-surface font-medium">{data.catalogSpecLabel}</span>
            </div>
            ) : null}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-space-md p-space-sm bg-surface-container-low rounded-xl">
            <div className="flex items-center gap-space-xs">
              <button type="button" className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-body-sm text-body-sm font-semibold shadow-sm transition-all ${data.activeFilterTab === "all" ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface"}`} onClick={() => actions.onFilterTab("all")}>
                <span>All matches</span>
                <span className="font-label-code text-caption font-bold">({data.filterAllCount})</span>
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-medium shadow-sm" onClick={() => actions.onFilterTab("oem")}>
                <span>Made for your car only</span>
                <span className="font-label-code text-caption font-bold">({data.filterOemCount})</span>
              </button>
            </div>
            <div className="flex items-center bg-surface-container p-1 rounded-lg">
              <button type="button" className={`px-3 py-1 font-body-sm text-caption font-bold rounded shadow-sm ${data.activeTrimScope === "specific" ? "bg-surface-container-lowest text-on-surface" : "text-on-surface-variant"}`} onClick={() => actions.onTrimScope("specific")}>
                Only this version
              </button>
              <button type="button" className="px-3 py-1 text-on-surface-variant font-body-sm text-caption font-medium rounded" onClick={() => actions.onTrimScope("all")}>
                All versions (incl. Post-facelift)
              </button>
            </div>
          </div>

          {best && best.id !== "empty" ? (
            <>
            <div className="flex flex-col gap-space-xs">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Target component specifications</h2>
              <p className="font-caption text-caption text-on-surface-variant">
                Results: {data.filterAllCount} / {Math.max(data.filterAllCount, data.filterOemCount) || data.filterAllCount} alternates
              </p>
            </div>
            <div className="relative bg-surface-container-lowest rounded-xl shadow-md p-space-lg md:p-space-xl overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary" />
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-xl pl-space-xs">
                <div className="flex flex-col gap-space-md flex-1">
                  <div className="flex flex-wrap items-center gap-space-sm">
                    <span className="font-caption text-caption font-semibold uppercase tracking-wider text-on-surface-variant">Best OEM match</span>
                    <span className="inline-flex items-center gap-1 bg-surface-container-highest text-primary font-label-code text-caption font-semibold px-2.5 py-1 rounded">
                      <span className="material-symbols-outlined text-[14px]">star</span>
                      Top recommended
                    </span>
                    {data.checkedCataloguesLabel ? (
                      <span className="inline-flex items-center gap-1 text-emerald-900 font-label-code text-caption font-medium border border-emerald-300 bg-emerald-100/50 px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[14px] text-emerald-700">verified</span>
                        {data.checkedCataloguesLabel}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-emerald-900 font-label-code text-caption font-medium border border-emerald-300 bg-emerald-100/50 px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined text-[14px] text-emerald-700">verified</span>
                        Checked against catalogues
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 bg-surface-container-high text-on-surface font-label-code text-caption font-semibold px-2.5 py-1 rounded">
                      {data.fitsVersionBadge}
                    </span>
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
            </>
          ) : null}

          {sections.some((s) => s.tier > 1 && !s.isEmpty) ? (
            <div className="flex items-center justify-between gap-space-md">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                Sister &amp; aftermarket options ({sections.filter((s) => s.tier > 1 && !s.isEmpty).reduce((n, s) => n + s.count, 0)})
              </h3>
            </div>
          ) : (
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Sister &amp; aftermarket options</h3>
          )}

          <div className="flex items-center justify-between mb-space-md">
            <div className="flex items-center gap-space-sm">
              <span className="font-headline-sm text-headline-sm text-on-surface">Structured Match Categories</span>
              <span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{data.filterAllCount} MATCHES FOUND</span>
            </div>
            <span className="font-caption text-caption text-on-surface-variant hidden sm:inline">Click any row to reveal fitment specs</span>
          </div>

          <div className="flex flex-col gap-space-lg">
            {sections.map((section) => (
              <div key={section.tier} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm p-space-md bg-surface-container-low/60 pl-space-lg border-l-4 border-primary">
                  <div className="flex items-center flex-wrap gap-space-sm">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {section.tier === 1 ? STITCH_TIER1_HEADING : section.heading}
                    </span>
                    <span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface">{section.count}</span>
                    <span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface">{section.tag}</span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">{section.description}</p>
                </div>
                {section.isEmpty ? (
                  <div className="p-space-md pl-space-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md border-t border-surface-container-high">
                    <p className="font-body-sm text-body-sm text-on-surface-variant italic">{section.emptyLine}</p>
                    {section.askLabel ? (
                      <button
                        type="button"
                        className="px-space-md py-2 rounded-lg bg-surface-container-lowest hover:bg-surface text-primary font-body-sm font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0"
                        onClick={() => actions.onAskForTier?.(section.tag)}
                      >
                        <span>{section.askLabel}</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    ) : null}
                  </div>
                ) : groupRowsForPositionSubheads(section.rows).map(({ subhead, rows: subRows }) => (
                  <div key={subhead || "all"} className="border-t border-surface-container-high first:border-t-0">
                    {subhead ? (
                      <div className="px-space-lg pt-space-md pb-space-xs">
                        <span className="font-label-code text-caption font-bold uppercase tracking-wider text-on-surface-variant">{subhead}</span>
                      </div>
                    ) : null}
                    {subRows.map((row) => {
                  const open = expanded[row.id];
                  return (
                    <div key={row.id} className={subhead ? "border-t border-surface-container-high/60" : "border-t border-surface-container-high"}>
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
                          {row.specLines.length ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                            {row.specLines.map((spec) => (
                              <div key={`${row.id}-${spec.label}`} className="font-body-sm text-body-sm text-on-surface-variant">
                                <span className="font-semibold text-on-surface">{spec.label}:</span> {spec.value}
                              </div>
                            ))}
                          </div>
                          ) : null}
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
            ))}
          </div>

          {data.matchRevisionLine !== "None yet" ? (
            <p className="font-label-code text-caption text-on-surface-variant text-center pt-space-md">{data.matchRevisionLine}</p>
          ) : null}

          <div className="rounded-xl p-space-md bg-surface-container-low border border-surface-container-high flex flex-col sm:flex-row sm:items-center justify-between gap-space-md mt-space-lg">
            <div className="flex items-start gap-space-sm">
              <span className="material-symbols-outlined text-secondary text-[22px] mt-0.5">contact_support</span>
              <div>
                <div className="font-body-md text-body-md font-semibold text-on-surface">Need a different brand or custom length?</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">Ask Roam to research an alternative part number for your chassis.</div>
              </div>
            </div>
            <button
              type="button"
              className="bg-surface-container-lowest hover:bg-surface-container-highest border border-surface-container-high text-on-surface font-body-sm text-body-sm px-space-md py-2 rounded-lg font-medium whitespace-nowrap transition-colors self-start sm:self-center"
              onClick={actions.onAskRoam}
            >
              Ask Roam to find another option
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
