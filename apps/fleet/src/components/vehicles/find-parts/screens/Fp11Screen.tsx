import type { ReactNode } from "react";
import type { Fp11PreviewTab, Fp11ViewModel } from "../findPartsViewModels";

export type Fp11Actions = {
  onRetry: () => void;
  onAskRoam: () => void;
  onRequestAccess: () => void;
  onBack: () => void;
  onCheckConnection: () => void;
  onPreviewTab: (tab: Fp11PreviewTab) => void;
  onSelectVehicle: () => void;
  children?: ReactNode;
};

function previewTabClass(active: boolean) {
  return active
    ? "state-tab-btn flex items-center gap-1.5 px-space-md py-1.5 rounded font-label-code text-caption bg-surface-container-lowest text-primary shadow-sm font-semibold transition-all"
    : "state-tab-btn flex items-center gap-1.5 px-space-md py-1.5 rounded font-label-code text-caption text-on-surface-variant hover:text-on-surface transition-all";
}

function showPreviewSection(active: Fp11PreviewTab, section: Fp11PreviewTab) {
  return active === "all" || active === section;
}

export function Fp11Screen({ actions, data }: { actions: Fp11Actions; data: Fp11ViewModel }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">

<div className="w-full bg-surface-container-low py-space-sm px-margin-desktop">
<div className="max-w-[1440px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-space-sm">
<div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
<span>FLEET OPS</span>
<span>/</span>
<span>MAINTENANCE</span>
<span>/</span>
<span className="text-on-surface font-semibold">FIND PARTS SYSTEM STATES</span>
<span className="ml-space-sm px-1.5 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">DEV PREVIEW // NODE KIN-01</span>
</div>
<div className="flex items-center gap-space-md text-on-surface-variant font-label-code text-caption">
<span className="flex items-center gap-1.5">
<span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse"></span>
<span>TELEMETRY SYNC: ACTIVE</span>
</span>
<span className="text-outline-variant">|</span>
<span>{data.hubStatusLabel}</span>
</div>
</div>
</div>

<div className="w-full bg-surface-container-lowest shadow-sm py-space-xl px-margin-desktop">
<div className="max-w-[1440px] mx-auto flex flex-col gap-space-lg">
<div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
<div>
<div className="font-label-code text-caption uppercase text-on-surface-variant tracking-wider">Exception &amp; Lifecycle Framework</div>
<h1 className="font-headline-xl text-headline-xl text-on-surface mt-1 tracking-tight">Parts Catalog State Diagnostics</h1>
<p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-1">
            Simulated edge-states for parts requisitioning, chassis cross-referencing, and permission gates across {data.hubLabel} hub depot terminals.
          </p>
</div>
<div className="flex items-center gap-space-sm bg-surface-container-low p-1 rounded-lg self-start lg:self-auto overflow-x-auto max-w-full">
<button type="button" className={previewTabClass(data.activePreviewTab === "all")} id="btn-tab-all" onClick={() => actions.onPreviewTab("all")}>
<span className="material-symbols-outlined text-[15px]">grid_view</span>
<span>All States Overview</span>
</button>
<button type="button" className={previewTabClass(data.activePreviewTab === "loading")} id="btn-tab-loading" onClick={() => actions.onPreviewTab("loading")}>
<span className="material-symbols-outlined text-[15px]">hourglass_top</span>
<span>Skeleton &amp; Loading</span>
</button>
<button type="button" className={previewTabClass(data.activePreviewTab === "error")} id="btn-tab-error" onClick={() => actions.onPreviewTab("error")}>
<span className="material-symbols-outlined text-[15px]">cloud_off</span>
<span>Network / Error</span>
</button>
<button type="button" className={previewTabClass(data.activePreviewTab === "unlisted")} id="btn-tab-unlisted" onClick={() => actions.onPreviewTab("unlisted")}>
<span className="material-symbols-outlined text-[15px]">directions_car</span>
<span>Missing Model</span>
</button>
<button type="button" className={previewTabClass(data.activePreviewTab === "noperm")} id="btn-tab-noperm" onClick={() => actions.onPreviewTab("noperm")}>
<span className="material-symbols-outlined text-[15px]">lock</span>
<span>No Permission</span>
</button>
</div>
</div>
</div>
</div>

<div className="w-full px-margin-desktop py-space-xl">
<div className="max-w-[1440px] mx-auto flex flex-col gap-space-xl">

{showPreviewSection(data.activePreviewTab, "loading") ? (
<section className="state-section flex flex-col gap-space-md" id="state-section-loading">
<div className="flex items-center justify-between pb-space-xs">
<div className="flex items-center gap-space-sm">
<span className="px-2 py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface font-semibold">STATE 01</span>
<h2 className="font-headline-sm text-headline-sm text-on-surface">Skeleton &amp; Fitment Matching Stream</h2>
</div>
<div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
<span className="w-2 h-2 rounded-full bg-primary-fixed-dim animate-ping"></span>
<span>DISPATCH RESOLVER: RUNNING</span>
</div>
</div>

<div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col gap-space-lg">

<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md pb-space-md">
<div className="flex items-center gap-space-sm flex-wrap">
<div className="h-6 w-28 bg-surface-container rounded animate-pulse"></div>
<span className="text-outline-variant font-label-code text-caption">/</span>
<div className="h-6 w-36 bg-surface-container rounded animate-pulse"></div>
<span className="text-outline-variant font-label-code text-caption">/</span>
<div className="h-6 w-44 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="flex items-center gap-2 px-space-md py-1.5 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface-variant">
<span className="material-symbols-outlined text-[16px] text-on-tertiary-container animate-spin">sync</span>
<span>Matching fitment against 14,200 {data.hubLabel} Hub catalog items...</span>
</div>
</div>

<div className="relative overflow-hidden bg-surface-container-low rounded-xl p-space-lg flex flex-col lg:flex-row items-stretch justify-between gap-space-lg">

<div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
<div className="flex flex-col gap-space-md pl-space-sm flex-1">
<div className="flex items-center gap-space-sm">
<div className="h-5 w-24 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-5 w-32 bg-surface-container rounded animate-pulse"></div>
</div>
<div>
<div className="h-7 w-3/4 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-1/2 bg-surface-container mt-2 rounded animate-pulse"></div>
</div>
<div className="flex items-center gap-space-md pt-space-xs">
<div className="h-4 w-28 bg-surface-container rounded animate-pulse"></div>
<div className="h-4 w-32 bg-surface-container rounded animate-pulse"></div>
<div className="h-4 w-20 bg-surface-container rounded animate-pulse"></div>
</div>
</div>

<div className="lg:w-72 bg-surface-container-lowest p-space-md rounded-lg flex flex-col justify-between gap-space-md">
<div>
<div className="h-3 w-20 bg-surface-container rounded animate-pulse"></div>
<div className="h-8 w-36 bg-surface-container-high rounded mt-1.5 animate-pulse"></div>
<div className="h-3 w-28 bg-surface-container rounded mt-1.5 animate-pulse"></div>
</div>
<div className="flex items-center gap-space-sm pt-space-xs">
<div className="h-9 flex-1 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-9 w-10 bg-surface-container rounded animate-pulse"></div>
</div>
</div>
</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

<div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-1.5">
<span className="w-2 h-2 rounded-full bg-primary"></span>
<div className="h-4 w-24 bg-surface-container-highest rounded animate-pulse"></div>
</div>
<div className="h-4 w-12 bg-surface-container rounded animate-pulse"></div>
</div>

<div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<div className="h-4 w-36 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-16 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="h-3 w-48 bg-surface-container rounded animate-pulse"></div>
<div className="flex items-center justify-between pt-1">
<div className="h-3 w-20 bg-surface-container rounded animate-pulse"></div>
<div className="h-6 w-14 bg-surface-container-highest rounded animate-pulse"></div>
</div>
</div>

<div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<div className="h-4 w-40 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-14 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="h-3 w-32 bg-surface-container rounded animate-pulse"></div>
<div className="flex items-center justify-between pt-1">
<div className="h-3 w-20 bg-surface-container rounded animate-pulse"></div>
<div className="h-6 w-14 bg-surface-container-highest rounded animate-pulse"></div>
</div>
</div>
</div>

<div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-1.5">
<span className="w-2 h-2 rounded-full bg-secondary"></span>
<div className="h-4 w-28 bg-surface-container-highest rounded animate-pulse"></div>
</div>
<div className="h-4 w-12 bg-surface-container rounded animate-pulse"></div>
</div>
<div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<div className="h-4 w-32 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-16 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="h-3 w-40 bg-surface-container rounded animate-pulse"></div>
<div className="flex items-center justify-between pt-1">
<div className="h-3 w-24 bg-surface-container rounded animate-pulse"></div>
<div className="h-6 w-14 bg-surface-container-highest rounded animate-pulse"></div>
</div>
</div>
<div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<div className="h-4 w-28 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-16 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="h-3 w-36 bg-surface-container rounded animate-pulse"></div>
<div className="flex items-center justify-between pt-1">
<div className="h-3 w-20 bg-surface-container rounded animate-pulse"></div>
<div className="h-6 w-14 bg-surface-container-highest rounded animate-pulse"></div>
</div>
</div>
</div>

<div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-1.5">
<span className="w-2 h-2 rounded-full bg-outline"></span>
<div className="h-4 w-32 bg-surface-container-highest rounded animate-pulse"></div>
</div>
<div className="h-4 w-12 bg-surface-container rounded animate-pulse"></div>
</div>
<div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<div className="h-4 w-36 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-14 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="h-3 w-44 bg-surface-container rounded animate-pulse"></div>
<div className="flex items-center justify-between pt-1">
<div className="h-3 w-16 bg-surface-container rounded animate-pulse"></div>
<div className="h-6 w-14 bg-surface-container-highest rounded animate-pulse"></div>
</div>
</div>
<div className="bg-surface-container-lowest p-space-sm rounded-lg flex flex-col gap-space-xs">
<div className="flex items-center justify-between">
<div className="h-4 w-30 bg-surface-container-highest rounded animate-pulse"></div>
<div className="h-4 w-16 bg-surface-container-high rounded animate-pulse"></div>
</div>
<div className="h-3 w-32 bg-surface-container rounded animate-pulse"></div>
<div className="flex items-center justify-between pt-1">
<div className="h-3 w-24 bg-surface-container rounded animate-pulse"></div>
<div className="h-6 w-14 bg-surface-container-highest rounded animate-pulse"></div>
</div>
</div>
</div>
</div>
</div>
</section>
) : null}

{showPreviewSection(data.activePreviewTab, "error") ? (
<section className="state-section flex flex-col gap-space-md" id="state-section-error">
<div className="flex items-center justify-between pb-space-xs">
<div className="flex items-center gap-space-sm">
<span className="px-2 py-0.5 rounded bg-error-container font-label-code text-caption text-on-error-container font-semibold">STATE 02</span>
<h2 className="font-headline-sm text-headline-sm text-on-surface">Network / Service Disruption</h2>
</div>
<span className="font-label-code text-caption text-error font-medium">HTTP 504 GATEWAY_TIMEOUT</span>
</div>

<div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
<div className="bg-error-container/40 p-space-xl flex flex-col lg:flex-row items-start justify-between gap-space-lg">
<div className="flex items-start gap-space-md">
<div className="w-12 h-12 rounded-xl bg-error-container flex items-center justify-center text-error shrink-0">
<span className="material-symbols-outlined text-[28px]">error</span>
</div>
<div className="flex flex-col gap-1 max-w-2xl">
<div className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                  Could not load parts. Nothing was changed.
                </div>
<p className="font-body-md text-body-md text-on-surface-variant">
                  The parts database or {data.hubLabel} Hub inventory feed did not respond in time. Your vehicle selection and entered notes are preserved.
                </p>

<div className="mt-space-md flex flex-wrap items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
<span className="px-2 py-1 bg-surface-container rounded text-on-surface">VEHICLE: 2017 Nissan NV200 [JM-KGN-4819]</span>
<span className="px-2 py-1 bg-surface-container rounded text-on-surface">SECTION: Front Brake Assembly</span>
<span className="px-2 py-1 bg-surface-container rounded text-on-surface">REQUISITION ID: #RQ-8841-TEMP</span>
</div>
</div>
</div>

<div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end gap-space-sm shrink-0 w-full sm:w-auto">
<button type="button" className="bg-primary text-on-primary hover:bg-surface-tint active:scale-[0.98] transition-all px-space-xl py-2 rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2" onClick={actions.onRetry}>
<span className="material-symbols-outlined text-[18px]">refresh</span>
<span>Retry</span>
</button>
<button type="button" className="font-label-code text-caption text-on-surface-variant hover:text-on-surface text-center lg:text-right underline flex items-center justify-center lg:justify-end gap-1 pt-1" onClick={actions.onCheckConnection}>
<span>Check connection status (24ms KIN)</span>
<span className="material-symbols-outlined text-[14px]">open_in_new</span>
</button>
</div>
</div>

<div className="bg-surface-container-low px-space-xl py-space-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-xs font-label-code text-caption text-on-surface-variant">
<div className="flex items-center gap-2">
<span className="w-1.5 h-1.5 rounded-full bg-error"></span>
<span>FEED NODE: kin-parts-sync-cluster.internal:9080</span>
</div>
<div className="flex items-center gap-space-md">
<span>LOCAL CACHE: PRESERVED</span>
<span>{data.attemptLabel}</span>
</div>
</div>
</div>
</section>
) : null}

{showPreviewSection(data.activePreviewTab, "unlisted") ? (
<section className="state-section flex flex-col gap-space-md" id="state-section-unlisted">
<div className="flex items-center justify-between pb-space-xs">
<div className="flex items-center gap-space-sm">
<span className="px-2 py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface font-semibold">STATE 03</span>
<h2 className="font-headline-sm text-headline-sm text-on-surface">Unlisted Vehicle / Model Missing</h2>
</div>
<span className="font-label-code text-caption text-on-tertiary-container font-medium">JDM MANUAL FITMENT TIER</span>
</div>
<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col lg:flex-row items-center justify-between gap-space-xl">
<div className="flex flex-col sm:flex-row items-start gap-space-lg max-w-3xl">

<div className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center relative shrink-0">
<span className="material-symbols-outlined text-[36px] text-on-surface-variant">directions_car</span>
<div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold">
                ?
              </div>
</div>
<div className="flex flex-col gap-space-xs">
<div className="flex items-center gap-space-sm flex-wrap">
<h3 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                  We don't have the 1998 {data.vehicleLabel} in our car list yet.
                </h3>
</div>
<p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Pre-2002 Japanese domestic market models require custom manual cataloging for chassis fitment (NCP50 series).
              </p>

<div className="mt-space-md self-start inline-flex items-center gap-2 px-space-md py-1.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-caption text-caption">
<span className="material-symbols-outlined text-[16px]">schedule</span>
<span className="font-semibold">Takes 2–4 hours for Jamaican parts desk verification</span>
</div>
</div>
</div>

<div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end gap-space-sm w-full lg:w-auto shrink-0">
<button type="button" className="bg-primary text-on-primary hover:bg-surface-tint active:scale-[0.98] transition-all px-space-xl py-2.5 rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2" onClick={actions.onAskRoam}>
<span className="material-symbols-outlined text-[18px]">add_circle</span>
<span>Ask Roam to add it</span>
</button>
<button type="button" className="bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-all px-space-lg py-2 rounded-lg font-body-sm text-body-sm text-center" onClick={actions.onSelectVehicle}>
              Select another vehicle
            </button>
<span className="font-label-code text-[11px] text-on-surface-variant text-center lg:text-right mt-1">
              Pre-fills: Year 1998 · Make · Model {data.vehicleLabel}
            </span>
</div>
</div>
</section>
) : null}

{showPreviewSection(data.activePreviewTab, "noperm") ? (
<section className="state-section flex flex-col gap-space-md" id="state-section-noperm">
<div className="flex items-center justify-between pb-space-xs">
<div className="flex items-center gap-space-sm">
<span className="px-2 py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface font-semibold">STATE 04</span>
<h2 className="font-headline-sm text-headline-sm text-on-surface">Role Authorization Gate</h2>
</div>
<span className="font-label-code text-caption text-on-surface-variant">POLICY: RBAC-MAINT-403</span>
</div>
<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-xl">
<div className="flex flex-col lg:flex-row items-start justify-between gap-space-xl">

<div className="flex flex-col sm:flex-row items-start gap-space-lg max-w-3xl">
<div className="w-16 h-16 rounded-2xl bg-secondary-container flex items-center justify-center relative shrink-0">
<span className="material-symbols-outlined text-[34px] text-primary">lock</span>
<div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center">
<span className="material-symbols-outlined text-[14px]">shield</span>
</div>
</div>
<div className="flex flex-col gap-space-xs">
<h3 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
                  You don't have access to vehicle parts. Ask your fleet admin.
                </h3>
<p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Your role (<strong className="text-on-surface font-semibold">{data.roleLabel}</strong>) allows viewing schedules and reporting issues, but parts requisitioning and quoting require <strong className="text-on-surface font-semibold">'Fleet Manager'</strong> or <strong className="text-on-surface font-semibold">'Purchasing'</strong> permissions.
                </p>
<div className="mt-space-md flex flex-wrap items-center gap-space-md text-body-sm text-on-surface-variant">
<div className="flex items-center gap-1.5 font-label-code text-caption">
<span className="material-symbols-outlined text-[16px] text-primary">verified_user</span>
<span>ACTIVE PROFILE: {data.userEmail}</span>
</div>
<div className="flex items-center gap-1.5 font-label-code text-caption">
<span className="material-symbols-outlined text-[16px] text-outline">location_on</span>
<span>DEPOT: {data.hubLabel} hub</span>
</div>
</div>
</div>
</div>

<div className="flex flex-col sm:flex-row lg:flex-col items-stretch lg:items-end gap-space-sm w-full lg:w-auto shrink-0">
<button type="button" className="bg-primary text-on-primary hover:bg-surface-tint active:scale-[0.98] transition-all px-space-xl py-2.5 rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2" onClick={actions.onRequestAccess}>
<span className="material-symbols-outlined text-[18px]">key</span>
<span>Request access from {data.adminLabel}</span>
</button>
<button type="button" className="bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-all px-space-lg py-2 rounded-lg font-body-sm text-body-sm text-center" onClick={actions.onBack}>
                Back to Fleet maintenance
              </button>
</div>
</div>

<div className="bg-surface-container-low rounded-lg p-space-md flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md font-body-sm text-body-sm">
<div className="flex items-center gap-space-md">
<div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center font-label-code text-caption font-bold text-on-surface shrink-0">
                JD
              </div>
<div>
<span className="font-semibold text-on-surface">{data.hubLabel} hub Administrator:</span>
<span className="text-on-surface-variant"> None yet Douglas (Lead Dispatcher) · Extension #401 · Desk 3B</span>
</div>
</div>
<div className="flex items-center gap-2 text-on-surface-variant font-label-code text-caption">
<span className="material-symbols-outlined text-[16px]">schedule</span>
<span>Avg. authorization response: ~12 minutes</span>
</div>
</div>
</div>
</section>
) : null}

<div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg">
<div className="flex items-center justify-between pb-space-md">
<div>
<h4 className="font-headline-sm text-headline-sm text-on-surface">Design System Matrix &amp; Implementation Tokens</h4>
<p className="font-caption text-caption text-on-surface-variant">Validation checklist for Roam Fleet technical guidelines.</p>
</div>
<span className="px-2 py-0.5 rounded bg-surface-container font-label-code text-caption text-on-surface">ROAM-DS-v4</span>
</div>
<div className="overflow-x-auto">
<table className="w-full text-left font-body-sm text-body-sm">
<thead>
<tr className="text-on-surface-variant font-caption text-caption uppercase bg-surface-container-low">
<th className="py-space-sm px-space-md font-semibold">State Key</th>
<th className="py-space-sm px-space-md font-semibold">Primary Trigger</th>
<th className="py-space-sm px-space-md font-semibold">Fallback Mechanism</th>
<th className="py-space-sm px-space-md font-semibold">Allowed Action</th>
<th className="py-space-sm px-space-md font-semibold">Recovery SLA</th>
</tr>
</thead>
<tbody className="divide-none font-label-code text-caption">
<tr className="hover:bg-surface-container-low/60 transition-colors">
<td className="py-space-sm px-space-md font-semibold text-on-surface">01_LOADING</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Async chassis fitment resolution</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Tier-by-tier lazy hydration</td>
<td className="py-space-sm px-space-md text-on-surface">Abort / Breadcrumb back</td>
<td className="py-space-sm px-space-md text-on-surface-variant">&lt; 1,400ms</td>
</tr>
<tr className="hover:bg-surface-container-low/60 transition-colors bg-surface-container-low/30">
<td className="py-space-sm px-space-md font-semibold text-error">02_TIMEOUT_ERR</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Hub network packet drop / timeout</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Local storage draft snapshot preservation</td>
<td className="py-space-sm px-space-md text-on-surface">Retry idempotent sync</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Instant local resume</td>
</tr>
<tr className="hover:bg-surface-container-low/60 transition-colors">
<td className="py-space-sm px-space-md font-semibold text-on-surface">03_MODEL_MISSING</td>
<td className="py-space-sm px-space-md text-on-surface-variant">VIN uncatalogued / pre-2002 JDM vehicle</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Desk manual verification ticket</td>
<td className="py-space-sm px-space-md text-on-surface">Submit custom vehicle form</td>
<td className="py-space-sm px-space-md text-on-surface-variant">2–4 hours (Desk KIN)</td>
</tr>
<tr className="hover:bg-surface-container-low/60 transition-colors bg-surface-container-low/30">
<td className="py-space-sm px-space-md font-semibold text-primary">04_AUTH_403</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Driver / Dispatch RBAC mismatch</td>
<td className="py-space-sm px-space-md text-on-surface-variant">Elevated manager ping via webhook</td>
<td className="py-space-sm px-space-md text-on-surface">Request Hub lead grant</td>
<td className="py-space-sm px-space-md text-on-surface-variant">~12 minutes SLA</td>
</tr>
</tbody>
</table>
</div>
</div>
</div>
</div>


</div></div>
    </div>
  );
}
