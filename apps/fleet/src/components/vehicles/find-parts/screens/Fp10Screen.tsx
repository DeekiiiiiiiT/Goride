import type { ReactNode } from "react";
import type { Fp10ActivityFilter, Fp10ViewModel } from "../findPartsViewModels";

export type Fp10Actions = {
  onBack: () => void;
  onDismissAlert: () => void;
  onInspect: () => void;
  onInvestigate: () => void;
  onOpenCatalogSearch: () => void;
  onFilterTab: (tab: Fp10ActivityFilter) => void;
  onSeeAllRequests: () => void;
  onSeeAllAlerts: () => void;
  children?: ReactNode;
};

function filterTabClass(active: boolean) {
  return active
    ? "filter-btn active px-space-md py-1.5 rounded-lg font-body-sm text-body-sm bg-primary text-on-primary font-medium transition-all shadow-sm"
    : "filter-btn px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors";
}

export function Fp10Screen({ actions, data }: { actions: Fp10Actions; data: Fp10ViewModel }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">

<div className="bg-surface-container-low">
<div className="w-full py-space-xs flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors flex items-center gap-space-xs" onClick={actions.onOpenCatalogSearch}>
<span className="material-symbols-outlined text-[17px]">manage_search</span>
<span>Catalog Search</span>
</button>
<button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-body-sm bg-surface-container-lowest text-on-surface font-medium shadow-sm flex items-center gap-space-xs" onClick={actions.onBack}>
<span className="material-symbols-outlined text-[17px] text-[#f97316]">history_edu</span>
<span>Your parts activity</span>
<span className="w-1.5 h-1.5 rounded-full bg-[#f97316]"></span>
</button>
</div>
<div className="hidden sm:flex items-center gap-space-xs font-label-code text-caption text-secondary">
<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
<span>JAD Telemetry Broker Live</span>
</div>
</div>
</div>

<div className="w-full py-space-xl">

<div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
<div>
<div className="flex items-center gap-space-sm">
<span className="font-label-code text-caption text-on-tertiary-container uppercase tracking-wider font-semibold">Procurement Pipeline</span>
<span className="text-outline-variant">•</span>
<span className="font-label-code text-caption text-secondary">St. Andrew & Corporate Area Fleet</span>
</div>
<h2 className="font-headline-xl text-headline-xl tracking-tight text-on-surface mt-0.5">Your parts activity</h2>
<p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-3xl">
          Ask Roam catalog requests and repeat-part wear alerts across {data.hubLabel} hub.
        </p>
</div>

<div className="flex items-center gap-space-sm bg-surface-container-lowest p-1.5 rounded-xl shadow-sm shrink-0 flex-wrap">
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">Open requests</span>
<span className="font-label-code text-headline-sm font-semibold text-on-surface">{data.openRfqLabel}</span>
</div>
<div className="w-px h-6 bg-surface-container-high"></div>
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">Alerts</span>
<span className="font-label-code text-headline-sm font-semibold text-on-surface">{data.filterCounts.alerts}</span>
</div>
<div className="w-px h-6 bg-surface-container-high hidden sm:block"></div>
<div className="flex items-center gap-3 px-space-md py-1 font-label-code text-caption text-on-surface-variant">
<span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Looking</span>
<span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Found</span>
<span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-surface-container-highest border border-outline-variant"></span> Pending</span>
</div>
</div>
</div>

<div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm mb-space-xl flex flex-col md:flex-row items-center justify-between gap-space-md">

<div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0" id="filter-tabs">
<button type="button" className={filterTabClass(data.activeActivityFilter === "all")} onClick={() => actions.onFilterTab("all")}>
          All activity <span className="ml-1 opacity-80 font-label-code text-caption">{data.activityCountLabel}</span>
</button>
<button type="button" className={filterTabClass(data.activeActivityFilter === "requests")} onClick={() => actions.onFilterTab("requests")}>
          Requests <span className="ml-1 font-label-code text-caption text-secondary">{data.filterCounts.requests}</span>
</button>
<button type="button" className={filterTabClass(data.activeActivityFilter === "alerts")} onClick={() => actions.onFilterTab("alerts")}>
          Alerts <span className="ml-1 font-label-code text-caption text-on-error-container">{data.filterCounts.alerts}</span>
</button>
</div>

<div className="w-full md:w-80 relative">
<span className="material-symbols-outlined text-[18px] text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
<input className="w-full h-9 pl-9 pr-8 bg-surface-container-low rounded-lg text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner transition-all font-body-sm" id="parts-search-input" placeholder="Filter by plate or OEM SKU..." type="text" />
<span className="font-label-code text-[10px] text-secondary absolute right-3 top-1/2 -translate-y-1/2 uppercase px-1 py-0.5 rounded bg-surface-container">Esc</span>
</div>
</div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">

<div className="lg:col-span-6 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col justify-between" id="section-requests">
<div>

<div className="p-space-lg bg-surface-container-lowest flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-secondary-fixed flex items-center justify-center">
<span className="material-symbols-outlined text-[17px] text-on-secondary-fixed">search_hands_free</span>
</div>
<h3 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">Requests</h3>
</div>
<span className="px-space-sm py-0.5 rounded-full font-label-code text-caption bg-amber-100 text-amber-900 font-semibold flex items-center gap-1">
<span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
              {data.requestsActiveLabel}
            </span>
</div>

<div className="divide-y divide-surface-container-high/40">
{(data.requestRows.length ? data.requestRows : [{ id: "empty-req", kind: "request" as const, title: "None yet", subtitle: "—", meta: "—", statusLabel: "None yet" }]).map((card) => (
<div key={card.id} className="p-space-lg hover:bg-surface-container-low/40 transition-colors group">
<div className="flex items-start justify-between gap-space-md">
<div className="space-y-1 min-w-0">
<div className="flex items-center gap-space-sm flex-wrap">
<span className="font-headline-sm text-body-lg font-medium text-on-surface">{card.title}</span>
<span className="text-outline-variant">•</span>
<span className="font-body-sm text-body-sm text-on-surface-variant">{card.subtitle}</span>
<span className="px-2 py-0.5 rounded bg-surface-container-high font-label-plate text-label-plate text-on-surface">{data.plate}</span>
</div>
<div className="flex items-center gap-space-sm text-secondary font-body-sm text-caption">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">schedule</span> {card.meta}
                    </span>
<span>•</span>
<span className="font-label-code text-caption capitalize">{card.statusLabel}</span>
</div>
</div>
<span className="px-2.5 py-1 rounded-full font-label-code text-caption bg-amber-50 text-amber-800 font-medium shrink-0 flex items-center gap-1.5 capitalize">
<span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> {card.statusLabel}
                </span>
</div>
<div className="mt-space-md p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">REF: <strong className="text-on-surface font-semibold">{data.requestRef}</strong></span>
<button type="button" className="font-body-sm text-caption text-primary font-medium hover:underline flex items-center gap-0.5" onClick={actions.onInspect}>
                  Inspect lead <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
</button>
</div>
</div>
))}
</div>
</div>

<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">6 backlog requests resolved this week</span>
<button type="button" className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" onClick={actions.onSeeAllRequests}>
            See all requests <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>
</div>



<div className="lg:col-span-12 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden" id="section-alerts">
<div className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
<span className="material-symbols-outlined text-[18px] text-amber-700" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
</div>
<div>
<h3 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">Repeat-part alerts</h3>
<p className="font-body-sm text-caption text-on-surface-variant">Automated anomaly detection from service telemetry & premature part exhaustion.</p>
</div>
</div>
<span className="px-space-sm py-0.5 rounded-full font-label-code text-caption bg-amber-50 text-amber-800 font-semibold self-start md:self-auto">
            {data.alertsCriticalLabel}
          </span>
</div>
<div className="p-space-lg">

{data.alertRows.length ? (
<div className="p-space-lg rounded-xl bg-amber-50/60 flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg relative overflow-hidden">

<div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
<div className="flex items-start gap-space-md max-w-3xl">
<div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
<span className="material-symbols-outlined text-amber-800 text-[20px]">running_with_errors</span>
</div>
<div className="space-y-1.5">
<div className="flex items-center gap-space-sm flex-wrap">
<span className="font-headline-sm text-body-lg font-semibold text-amber-950">{data.alertTitle}</span>
<span className="text-amber-300">•</span>
<span className="font-body-sm text-body-sm text-amber-900 font-medium">{data.alertVehicleLabel}</span>
<span className="px-2 py-0.5 rounded bg-surface-container-lowest font-label-plate text-label-plate text-on-surface shadow-xs">{data.alertPlate}</span>
</div>
<p className="font-body-sm text-body-sm text-amber-900/90 leading-relaxed">
                  {data.alertDetail}
                </p>
<div className="flex flex-wrap items-center gap-space-md pt-1 font-label-code text-caption text-amber-800">
<span>Cycle 1: {data.alertCyclePrimary}</span>
<span>•</span>
<span>Cycle 2: {data.alertCycleSecondary}</span>
<span>•</span>
<span className="font-semibold text-amber-950">Expected Lifespan: {data.expectedLifespanKm}</span>
</div>
<div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden mt-2">
<div className="bg-amber-600 h-1.5 rounded-full" style={{ width: `${data.wearBarPercent}%` }}></div>
</div>
</div>
</div>

<div className="flex items-center gap-space-sm shrink-0 pl-12 xl:pl-0">
<button type="button" className="h-9 px-space-md rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-body-sm text-body-sm font-medium shadow-sm" onClick={actions.onDismissAlert}>
                Dismiss
              </button>
<button type="button" className="h-9 px-space-lg rounded-lg bg-amber-900 text-on-primary hover:bg-black transition-all font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm" onClick={actions.onInvestigate}>
<span className="material-symbols-outlined text-[17px]">manage_search</span>
<span>Investigate wear history</span>
</button>
</div>
</div>
) : (
<div className="p-space-lg rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">No repeat-part alerts yet.</div>
)}
</div>
<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">Telematics frequency: Real-time OBD-II linked</span>
<button type="button" className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" onClick={actions.onSeeAllAlerts}>
            See all alerts <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>
</div>




</div>

<div className="mt-space-xl p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md">
<div className="flex items-center gap-space-md">
<div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary shrink-0">
<span className="material-symbols-outlined text-[18px]">cell_tower</span>
</div>
<div className="font-body-sm text-body-sm text-on-surface">
<strong className="font-medium">{data.hubLabel} Motor Spares EDI link synchronized.</strong> {data.feedSummary}
        </div>
</div>
<div className="flex items-center gap-space-md shrink-0 font-label-code text-caption text-secondary">
<span>Alert logged: {data.alertDate} · {data.alertKm}</span>
</div>
</div>
</div>
</div>
</div>

    </div>
  );
}
