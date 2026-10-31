import type { ReactNode } from "react";
import type { FindPartsScreenData } from "../findPartsScreenData";

export type Fp10Actions = {
  onButton: (label: string) => void;
  onVehicleCard?: (vehicleId: string) => void;
  children?: ReactNode;
};

export function Fp10Screen({ actions, data }: { actions: Fp10Actions; data: FindPartsScreenData }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">

<div className="bg-surface-container-lowest shadow-sm">
<div className="max-w-[1440px] mx-auto px-margin md:px-margin-desktop pt-space-lg pb-space-md">

<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
<div className="flex items-start gap-space-md">
<div className="w-10 h-10 rounded-xl bg-tertiary-container flex items-center justify-center shrink-0 shadow-sm">
<span className="material-symbols-outlined text-[#f97316] text-[22px]" style="font-variation-settings: 'FILL' 1;">build</span>
</div>
<div>
<div className="flex items-center gap-space-sm">
<h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Fleet maintenance</h1>
<span className="px-space-xs py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">HUB-KIN-01</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">By vehicle status, the service ledger, and parts for your cars.</p>
</div>
</div>
<div className="flex flex-wrap items-center gap-space-sm">
<button className="h-9 px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-xs font-body-sm text-body-sm">
<span className="material-symbols-outlined text-[18px] text-secondary">refresh</span>
<span>Refresh</span>
</button>
<button className="h-9 px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-xs font-body-sm text-body-sm">
<span className="material-symbols-outlined text-[18px] text-secondary">auto_schedule</span>
<span>Bootstrap schedules</span>
</button>
<button className="h-9 px-space-md rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-xs font-body-sm text-body-sm">
<span className="material-symbols-outlined text-[18px] text-secondary">hub</span>
<span>Compatible parts</span>
</button>
<button className="h-9 px-space-lg rounded-lg bg-primary text-on-primary hover:bg-inverse-surface transition-all flex items-center gap-space-xs font-body-sm text-body-sm font-medium shadow-sm">
<span className="material-symbols-outlined text-[18px]">add</span>
<span>Log new service</span>
</button>
</div>
</div>

<div className="flex items-center gap-space-xl mt-space-lg overflow-x-auto">
<a className="pb-space-sm font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap" href="#">By vehicle</a>
<a className="pb-space-sm font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors whitespace-nowrap" href="#">Service ledger</a>
<a className="pb-space-sm font-body-sm text-body-sm text-primary font-semibold relative whitespace-nowrap" href="#">
          Find parts
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full"></div>
</a>
</div>
</div>
</div>

<div className="bg-surface-container-low">
<div className="max-w-[1440px] mx-auto px-margin md:px-margin-desktop py-space-xs flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<a className="px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container transition-colors flex items-center gap-space-xs" href="#">
<span className="material-symbols-outlined text-[17px]">manage_search</span>
<span>Catalog Search</span>
</a>
<a className="px-space-md py-1.5 rounded-lg font-body-sm text-body-sm bg-surface-container-lowest text-on-surface font-medium shadow-sm flex items-center gap-space-xs" href="#">
<span className="material-symbols-outlined text-[17px] text-[#f97316]">history_edu</span>
<span>Your parts activity</span>
<span className="w-1.5 h-1.5 rounded-full bg-[#f97316]"></span>
</a>
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
          Active sourcing requests, supplier quotes, wear anomalies, and core return credits across {data.hubLabel} Hub #01.
        </p>
</div>

<div className="flex items-center gap-space-sm bg-surface-container-lowest p-1.5 rounded-xl shadow-sm shrink-0">
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">Open RFQs</span>
<span className="font-label-code text-headline-sm font-semibold text-on-surface">3</span>
</div>
<div className="w-px h-6 bg-surface-container-high"></div>
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">SLA Target</span>
<span className="font-label-code text-headline-sm font-semibold text-emerald-600">99.2%</span>
</div>
<div className="w-px h-6 bg-surface-container-high"></div>
<div className="px-space-md py-1 text-center">
<span className="font-caption text-caption text-secondary uppercase block">Core Bal</span>
<span className="font-label-code text-headline-sm font-semibold text-on-surface">J$ 0.00</span>
</div>
</div>
</div>

<div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm mb-space-xl flex flex-col md:flex-row items-center justify-between gap-space-md">

<div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0" id="filter-tabs">
<button className="filter-btn active px-space-md py-1.5 rounded-lg font-body-sm text-body-sm bg-primary text-on-primary font-medium transition-all shadow-sm" data-filter="all">
          All activity <span className="ml-1 opacity-80 font-label-code text-caption">(7)</span>
</button>
<button className="filter-btn px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" data-filter="requests">
          Requests <span className="ml-1 font-label-code text-caption text-secondary">2</span>
</button>
<button className="filter-btn px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" data-filter="quotes">
          Quotes <span className="ml-1 font-label-code text-caption text-secondary">1</span>
</button>
<button className="filter-btn px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" data-filter="alerts">
          Alerts <span className="ml-1 font-label-code text-caption text-on-error-container">1</span>
</button>
<button className="filter-btn px-space-md py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors" data-filter="core-returns">
          Core returns
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
              2 active
            </span>
</div>

<div className="divide-y divide-surface-container-high/40">

<div className="p-space-lg hover:bg-surface-container-low/40 transition-colors group">
<div className="flex items-start justify-between gap-space-md">
<div className="space-y-1 min-w-0">
<div className="flex items-center gap-space-sm flex-wrap">
<span className="font-headline-sm text-body-lg font-medium text-on-surface">Front brake pads</span>
<span className="text-outline-variant">•</span>
<span className="font-body-sm text-body-sm text-on-surface-variant">{data.vehicleLabel}</span>
<span className="px-2 py-0.5 rounded bg-surface-container-high font-label-plate text-label-plate text-on-surface">{data.plate}</span>
</div>
<div className="flex items-center gap-space-sm text-secondary font-body-sm text-caption">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">schedule</span> Submitted 2h ago
                    </span>
<span>•</span>
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">local_shipping</span> Sourcing from Mandeville / {data.hubLabel}
                    </span>
</div>
</div>
<span className="px-2.5 py-1 rounded-full font-label-code text-caption bg-amber-50 text-amber-800 font-medium shrink-0 flex items-center gap-1.5">
<span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Looking
                </span>
</div>

<div className="mt-space-md p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
<div className="flex items-center gap-space-md font-label-code text-caption text-secondary">
<span>REF: <strong className="text-on-surface font-semibold">{data.requestRef}</strong></span>
<span>TARGET OEM: <strong className="text-on-surface font-semibold">45022-T5B-J00</strong></span>
</div>
<button className="font-body-sm text-caption text-primary font-medium hover:underline flex items-center gap-0.5">
                  Inspect lead <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
</button>
</div>
</div>

<div className="p-space-lg hover:bg-surface-container-low/40 transition-colors group">
<div className="flex items-start justify-between gap-space-md">
<div className="space-y-1 min-w-0">
<div className="flex items-center gap-space-sm flex-wrap">
<span className="font-headline-sm text-body-lg font-medium text-on-surface">Oil filter</span>
<span className="text-outline-variant">•</span>
<span className="font-body-sm text-body-sm text-on-surface-variant">{data.vehicleLabelSecondary}</span>
<span className="px-2 py-0.5 rounded bg-surface-container-high font-label-plate text-label-plate text-on-surface">{data.plateSecondary}</span>
</div>
<div className="flex items-center gap-space-sm text-secondary font-body-sm text-caption">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">storefront</span> Supplier: {data.hubLabel} Auto Parts
                    </span>
<span>•</span>
<span className="text-emerald-700 font-medium">Ready for review</span>
</div>
</div>
<span className="px-2.5 py-1 rounded-full font-label-code text-caption bg-emerald-50 text-emerald-800 font-medium shrink-0 flex items-center gap-1.5">
<span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Found
                </span>
</div>
<div className="mt-space-md flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">PO Pre-alloc: <strong className="text-on-surface">PO-3301-KIN</strong></span>
<div className="flex items-center gap-space-sm">
<button className="px-space-md py-1 rounded bg-primary text-on-primary font-body-sm text-caption font-medium hover:bg-inverse-surface transition-all">Review offer</button>
</div>
</div>
</div>
</div>
</div>

<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">6 backlog requests resolved this week</span>
<a className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" href="#">
            See all 8 requests <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</a>
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
              1 pending
            </span>
</div>

<div className="p-space-lg space-y-space-md">
<div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-md hover:shadow-sm transition-all">
<div className="flex items-start justify-between gap-space-sm">
<div>
<div className="flex items-center gap-space-sm">
<span className="font-label-code text-body-lg font-semibold text-on-surface">Toyota {data.partNumber} × 2</span>
<span className="text-caption text-secondary font-body-sm">(Oil filter)</span>
</div>
<p className="font-body-sm text-caption text-on-surface-variant mt-0.5">
                    RFQ sent to {data.hubLabel} Auto Parts &amp; Mandeville Motor Spares
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
<span className="font-medium text-amber-700">4h remaining on reply SLA</span>
</div>
<div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden">
<div className="bg-amber-500 h-1.5 rounded-full" style="width: 65%;"></div>
</div>
</div>

<div className="grid grid-cols-2 gap-space-sm pt-space-xs font-label-code text-caption">
<div className="bg-surface-container-lowest p-2 rounded-lg">
<span className="text-secondary text-[11px] block">Target Landed Limit</span>
<span className="font-label-price text-on-surface font-semibold">J$ 3,800 / unit</span>
</div>
<div className="bg-surface-container-lowest p-2 rounded-lg">
<span className="text-secondary text-[11px] block">Bidding Suppliers</span>
<span className="text-on-surface font-semibold">2 Vendors Notified</span>
</div>
</div>
</div>

<div className="p-space-sm rounded-lg bg-surface-container flex items-center justify-between font-body-sm text-caption text-on-surface-variant">
<span className="flex items-center gap-1">
<span className="material-symbols-outlined text-[15px] text-secondary">info</span>
                Prior batch PO-2908 landed at J$ 3,450 from Portmore Spares.
              </span>
<span className="font-label-code font-semibold text-on-surface">30d ago</span>
</div>
</div>
</div>

<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">Last price catalog synced 09:15 AM</span>
<a className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" href="#">
            See all quotes <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</a>
</div>
</div>

<div className="lg:col-span-12 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden" id="section-alerts">
<div className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
<span className="material-symbols-outlined text-[18px] text-amber-700" style="font-variation-settings: 'FILL' 1;">warning</span>
</div>
<div>
<h3 className="font-headline-sm text-headline-sm tracking-tight text-on-surface">Repeat-part alerts</h3>
<p className="font-body-sm text-caption text-on-surface-variant">Automated anomaly detection from service telemetry &amp; premature part exhaustion.</p>
</div>
</div>
<span className="px-space-sm py-0.5 rounded-full font-label-code text-caption bg-amber-50 text-amber-800 font-semibold self-start md:self-auto">
            1 critical review required
          </span>
</div>
<div className="p-space-lg">

<div className="p-space-lg rounded-xl bg-amber-50/60 flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg relative overflow-hidden">

<div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
<div className="flex items-start gap-space-md max-w-3xl">
<div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
<span className="material-symbols-outlined text-amber-800 text-[20px]">running_with_errors</span>
</div>
<div className="space-y-1.5">
<div className="flex items-center gap-space-sm flex-wrap">
<span className="font-headline-sm text-body-lg font-semibold text-amber-950">Same brake pads replaced twice in 60 days</span>
<span className="text-amber-300">•</span>
<span className="font-body-sm text-body-sm text-amber-900 font-medium">{data.vehicleLabelSecondary}</span>
<span className="px-2 py-0.5 rounded bg-surface-container-lowest font-label-plate text-label-plate text-on-surface shadow-xs">{data.plateSecondary}</span>
</div>
<p className="font-body-sm text-body-sm text-amber-900/90 leading-relaxed">
                  Caliper inspection telemetry flag triggered on Rear-Right assembly. Sensor logs indicate sticking piston causing 3.4× premature friction wear relative to fleet median.
                </p>
<div className="flex flex-wrap items-center gap-space-md pt-1 font-label-code text-caption text-amber-800">
<span>Cycle 1: May 14 (34,120 km)</span>
<span>•</span>
<span>Cycle 2: July 02 (37,840 km)</span>
<span>•</span>
<span className="font-semibold text-amber-950">Expected Lifespan: 25,000 km</span>
</div>
</div>
</div>

<div className="flex items-center gap-space-sm shrink-0 pl-12 xl:pl-0">
<button className="h-9 px-space-md rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container transition-colors font-body-sm text-body-sm font-medium shadow-sm">
                Dismiss
              </button>
<button className="h-9 px-space-lg rounded-lg bg-amber-900 text-on-primary hover:bg-black transition-all font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm">
<span className="material-symbols-outlined text-[17px]">manage_search</span>
<span>Investigate wear history</span>
</button>
</div>
</div>
</div>
<div className="p-space-md bg-surface-container-low flex items-center justify-between">
<span className="font-label-code text-caption text-secondary">Telematics frequency: Real-time OBD-II linked</span>
<a className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" href="#">
            See all 2 alerts <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</a>
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
              0 active claims
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
<a className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" href="#">
            Review warranty terms <span className="material-symbols-outlined text-[16px]">north_east</span>
</a>
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
<span className="font-label-code text-caption text-secondary">Historical returns audited: 24 units</span>
<a className="font-body-sm text-body-sm text-primary font-medium hover:underline flex items-center gap-1" href="#">
            View return ledger <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</a>
</div>
</div>
</div>

<div className="mt-space-xl p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md">
<div className="flex items-center gap-space-md">
<div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-secondary shrink-0">
<span className="material-symbols-outlined text-[18px]">cell_tower</span>
</div>
<div className="font-body-sm text-body-sm text-on-surface">
<strong className="font-medium">Mandeville Motor Spares EDI link synchronized.</strong> 12 live vendor inventory feeds currently connected for St. Andrew, {data.hubLabel}, and St. Catherine hubs.
        </div>
</div>
<div className="flex items-center gap-space-md shrink-0 font-label-code text-caption text-secondary">
<span>NEXT SYNC IN 08:42</span>
<button className="px-space-md py-1 rounded bg-surface-container-high text-on-surface hover:bg-surface-dim transition-colors font-medium">Force Sync</button>
</div>
</div>
</div>
</div>
</div>
    </div>
  );
}
