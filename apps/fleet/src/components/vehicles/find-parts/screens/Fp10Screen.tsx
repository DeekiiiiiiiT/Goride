import type { ReactNode } from "react";
import type { Fp10ActivityFilter, Fp10ViewModel } from "../findPartsViewModels";

export type Fp10Actions = {
  onBack: () => void;
  onForceSync: () => void;
  onDismissAlert: () => void;
  onInspect: () => void;
  onReviewOffer: () => void;
  onInvestigate: () => void;
  onOpenCatalogSearch: () => void;
  onFilterTab: (tab: Fp10ActivityFilter) => void;
  onSeeAllRequests: () => void;
  onSeeAllQuotes: () => void;
  onSeeAllAlerts: () => void;
  onReviewWarrantyTerms: () => void;
  onViewReturnLedger: () => void;
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
<div className="max-w-[1440px] mx-auto px-margin md:px-margin-desktop py-space-xs flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors flex items-center gap-space-xs" onClick={actions.onOpenCatalogSearch}>
<span className="material-symbols-outlined text-[17px]">manage_search</span>
<span>Catalog Search</span>
</button>
<button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-body-sm bg-surface-container-lowest text-on-surface font-medium shadow-sm flex items-center gap-space-xs">
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

<div className="max-w-[1440px] w-full mx-auto px-margin md:px-margin-desktop py-space-xl">

<div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md mb-space-lg">
<div>
<div className="flex items-center gap-space-sm">
<span className="font-label-code text-caption text-on-tertiary-container uppercase tracking-wider font-semibold">Procurement Pipeline</span>
<span className="text-outline-variant">•</span>
<span className="font-label-code text-caption text-secondary">St. Andrew &amp; Corporate Area Fleet</span>
</div>
<h2 className="font-headline-xl text-headline-xl tracking-tight text-on-surface mt-0.5">Your parts activity</h2>
<p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-3xl">
          Active sourcing requests, supplier quotes, wear anomalies, and core return credits across {data.hubLabel} hub.
        </p>
</div>

<div className="flex items-center gap-space-sm bg-surface-container-lowest p-1.5 rounded-xl shadow-sm shrink-0">
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">Open RFQs</span>
<span className="font-label-code text-headline-sm font-semibold text-on-surface">{data.openRfqLabel}</span>
</div>
<div className="w-px h-6 bg-surface-container-high"></div>
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">SLA Target</span>
<span className="font-label-code text-headline-sm font-semibold text-emerald-600">{data.kpiPercent}</span>
</div>
<div className="w-px h-6 bg-surface-container-high"></div>
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">Core Bal</span>
<span className="font-label-code text-headline-sm font-semibold text-on-surface">{data.coreBalanceLabel}</span>
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
<button type="button" className={filterTabClass(data.activeActivityFilter === "quotes")} onClick={() => actions.onFilterTab("quotes")}>
          Quotes <span className="ml-1 font-label-code text-caption text-secondary">{data.filterCounts.quotes}</span>
</button>
<button type="button" className={filterTabClass(data.activeActivityFilter === "alerts")} onClick={() => actions.onFilterTab("alerts")}>
          Alerts <span className="ml-1 font-label-code text-caption text-on-error-container">{data.filterCounts.alerts}</span>
</button>
<button type="button" className={filterTabClass(data.activeActivityFilter === "cores")} onClick={() => actions.onFilterTab("cores")}>
          Core returns <span className="ml-1 font-label-code text-caption text-secondary">{data.filterCounts.cores}</span>
        </button>
</div>

<div className="w-full md:w-80 relative">
<span className="material-symbols-outlined text-[18px] text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
<input className="w-full h-9 pl-9 pr-8 bg-surface-container-low rounded-lg text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner transition-all font-body-sm" id="parts-search-input" placeholder="Filter by plate, OEM SKU, or supplier..." type="text" />
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
{(data.requestRows.length ? data.requestRows : [{ id: "empty-req", kind: "request" as const, title: "None yet", subtitle: "—", meta: "—", priceLabel: "No price yet" }]).map((card) => (
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
<span className="font-label-code text-caption">{card.priceLabel}</span>
</div>
</div>
<span className="px-2.5 py-1 rounded-full font-label-code text-caption bg-amber-50 text-amber-800 font-medium shrink-0 flex items-center gap-1.5 capitalize">
<span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> {card.kind}
                </span>
</div>
<div className="mt-space-md p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">REF: <strong className="text-on-surface font-semibold">{data.requestRef}</strong></span>
<button type="button" className="font-body-sm text-caption text-primary font-medium hover:underline flex items-center gap-0.5" onClick={card.kind === "quote" ? actions.onReviewOffer : actions.onInspect}>
                  {card.kind === "quote" ? "Review offer" : "Inspect lead"} <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
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

<div className="lg:col-span-6 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col justify-between" id="section-quotes">
<div>

<div className="p-space-lg bg-surface-container-lowest flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-secondary-fixed flex items-center justify-center">
<span className="material-symbols-outlined text-[17px] text-on-secondary-fixed">request_quote</span>
</div>
<h3 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">Quotes</h3>
</div>
<span className="px-space-sm py-0.5 rounded-full font-label-code text-caption bg-blue-100 text-blue-900 font-semibold flex items-center gap-1">
<span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              {data.quotesPendingLabel}
            </span>
</div>

<div className="p-space-lg space-y-space-md">
{data.quoteRows.length ? data.quoteRows.map((quote) => (
<div key={quote.id} className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-md hover:shadow-sm transition-all">
<div className="flex items-start justify-between gap-space-sm">
<div>
<div className="flex items-center gap-space-sm">
<span className="font-label-code text-body-lg font-semibold text-on-surface">{quote.title}</span>
<span className="text-caption text-secondary font-body-sm">(Oil filter)</span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant mt-0.5">
                    RFQ sent to {data.hubLabel} Auto Parts &amp; {data.hubLabel} Motor Spares
                  </p>
</div>
<span className="px-2.5 py-1 rounded-full font-label-code text-caption bg-blue-50 text-blue-800 font-medium shrink-0 flex items-center gap-1.5">
<span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  Waiting for price
                </span>
</div>

<div className="space-y-1.5">
<div className="flex items-center justify-between font-label-code text-caption text-secondary">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[15px] text-amber-600">hourglass_top</span>
                    Vendor SLA Response Window
                  </span>
<span className="font-medium text-amber-700">{data.slaRemainingLabel}</span>
</div>
<div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
<div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${data.slaBarPercent}%` }}></div>
</div>
</div>

<div className="grid grid-cols-2 gap-space-sm pt-space-xs font-label-code text-caption">
<div className="bg-surface-container-lowest p-2 rounded-lg">
<span className="text-secondary text-[11px] block">Target Landed Limit</span>
<span className="font-label-price text-on-surface font-semibold">{quote.priceLabel} / unit</span>
</div>
<div className="bg-surface-container-lowest p-2 rounded-lg">
<span className="text-secondary text-[11px] block">Bidding Suppliers</span>
<span className="text-on-surface font-semibold">{data.vendorsNotified}</span>
</div>
</div>
</div>
)) : (
<div className="p-space-md rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">None yet</div>
)}
</div>

<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">Last price catalog synced 09:15 AM</span>
<button type="button" className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" onClick={actions.onSeeAllQuotes}>
            See all quotes <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>
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
<p className="font-body-sm text-caption text-on-surface-variant">Automated anomaly detection from service telemetry &amp; premature part exhaustion.</p>
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

<div className="lg:col-span-6 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col justify-between" id="section-warranty">
<div>

<div className="p-space-lg bg-surface-container-lowest flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-secondary-fixed flex items-center justify-center">
<span className="material-symbols-outlined text-[17px] text-on-secondary-fixed">verified_user</span>
</div>
<h3 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">Warranty claims</h3>
</div>
<span className="px-space-sm py-0.5 rounded-full font-label-code text-caption bg-surface-container text-secondary">
              {data.warrantyActiveLabel}
            </span>
</div>

<div className="p-space-xl flex flex-col items-center text-center">
<div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-secondary mb-space-md">
<span className="material-symbols-outlined text-[24px]">verified</span>
</div>
<h4 className="font-headline-sm text-body-lg font-semibold text-on-surface">None open. Crediting a claim is done by Roam.</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant max-w-md mt-1.5">
              Parts installed via verified Roam POs are covered by zero-defect vendor replacement. Replacements are logged directly against supplier credit notes.
            </p>
<div className="mt-space-lg flex items-center gap-space-sm">
<span className="px-2.5 py-1 rounded-md bg-surface-container-low font-label-code text-caption text-secondary">
                Protected by SLA Guarantee v2.4
              </span>
</div>
</div>
</div>
<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">Coverage: 100% Roam Approved Stock</span>
<button type="button" className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" onClick={actions.onReviewWarrantyTerms}>
            Review warranty terms <span className="material-symbols-outlined text-[16px]">north_east</span>
</button>
</div>
</div>

<div className="lg:col-span-6 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col justify-between" id="section-core">
<div>

<div className="p-space-lg bg-surface-container-lowest flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-secondary-fixed flex items-center justify-center">
<span className="material-symbols-outlined text-[17px] text-on-secondary-fixed">change_circle</span>
</div>
<h3 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">Core returns</h3>
</div>
<span className="px-space-sm py-0.5 rounded-full font-label-code text-caption bg-emerald-50 text-emerald-800 font-semibold">
              All cleared
            </span>
</div>

<div className="p-space-lg space-y-space-md">

<div className="p-space-lg rounded-xl bg-surface-container-low flex items-center justify-between">
<div>
<span className="font-caption text-caption text-secondary uppercase font-semibold tracking-wider">Depot Core Balance</span>
<div className="font-label-price text-headline-lg font-bold text-on-surface mt-0.5">
                  J$ 0 pending <span className="text-secondary font-normal font-body-sm">· 0 overdue</span>
</div>
</div>
<div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800">
<span className="material-symbols-outlined text-[22px]">check_circle</span>
</div>
</div>

<div className="p-space-md rounded-lg bg-surface-container flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-secondary shrink-0 mt-0.5">inventory</span>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Alternator and hybrid battery cores inspected and fully credited for {data.hubLabel} depot. No salvage parts awaiting shipment to remanufacturing partners.
              </p>
</div>

<div className="flex items-center justify-between font-label-code text-caption text-secondary px-1">
<span>Last hub audit: Yesterday, 18:00 EST</span>
<span>Inspector: Tech-Lead #04</span>
</div>
</div>
</div>
<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">Historical returns audited: {data.coreUnitsAudited}</span>
<button type="button" className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" onClick={actions.onViewReturnLedger}>
            View return ledger <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
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
<button type="button" className="px-space-md py-1 rounded bg-surface-container-high text-on-surface hover:bg-surface-dim transition-colors font-medium" onClick={actions.onForceSync}>Force Sync</button>
</div>
</div>
</div>
</div>
</div>
    </div>
  );
}
