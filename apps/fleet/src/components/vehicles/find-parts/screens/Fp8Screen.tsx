import type { ReactNode } from "react";
import type { Fp8ViewModel } from "../findPartsViewModels";

export type Fp8FormState = { note: string };

export type Fp8Actions = {
  onBack: () => void;
  onViewActivity: () => void;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
  onPhotoSelected: (file: File) => void;
  children?: ReactNode;
};

export function Fp8Screen({ actions, data, form }: { actions: Fp8Actions; data: Fp8ViewModel; form: Fp8FormState }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">
<div className="w-full py-space-xl flex flex-col gap-space-xl">

<div className="w-full bg-surface-container-low rounded-xl px-space-lg py-space-sm flex flex-wrap items-center gap-space-sm">
<span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Search Scope:</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-sm">
<span>{data.vehicleLabel}</span>
<span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-surface cursor-pointer">edit</span>
</div>
<span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-sm">
<span>{data.trimLabel}</span>
<span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-surface cursor-pointer">edit</span>
</div>
<span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-sm">
<span>{data.partName}</span>
<span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-surface cursor-pointer">edit</span>
</div>
<span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-highest text-on-surface font-label-code text-caption">
<span className="font-semibold">{data.positionLabel}</span>
<span className="material-symbols-outlined text-[14px] text-on-surface cursor-pointer">close</span>
</div>
<button className="ml-auto font-caption text-caption text-on-surface-variant hover:text-on-surface underline underline-offset-2" type="button" onClick={actions.onBack}>
        Reset filters
      </button>
</div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

<div className="lg:col-span-8 flex flex-col gap-space-lg">
<div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-xl">

<div className="flex flex-col sm:flex-row items-start sm:items-center gap-space-lg">
<div className="w-14 h-14 shrink-0 rounded-2xl bg-surface-container flex items-center justify-center">
<span className="material-symbols-outlined text-[28px] text-on-surface-variant">travel_explore</span>
</div>
<div className="flex flex-col gap-0.5">
<h2 className="font-headline-sm text-headline-sm text-on-surface">
                {data.headlineLine}
              </h2>
<p className="font-body-md text-body-md text-on-surface-variant">
                Tell us what you need and Roam will add the correct part number to Find parts.
              </p>
</div>
</div>

<div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
<span className="font-caption text-caption uppercase text-on-surface-variant tracking-wider font-semibold">Matched Vehicle Specs</span>
<div className="flex flex-wrap items-center gap-space-xs">
<span className="px-space-md py-1 rounded-md bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-xs">{data.vehicleLabel}{data.trimLabel !== "None yet" ? ` (${data.trimLabel})` : ""}</span>
<span className="px-space-md py-1 rounded-md bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-xs">{data.partName}</span>
<span className="px-space-md py-1 rounded-md bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-xs">{data.positionLabel}</span>
<span className="px-space-md py-1 rounded-md bg-surface-container-highest text-on-surface font-label-plate text-caption">{data.plate}</span>
{data.chassisLabel !== "—" ? (
<span className="px-space-md py-1 rounded-md bg-surface-container text-on-secondary-container font-label-code text-caption">Chassis: {data.chassisLabel}</span>
) : null}
</div>
</div>

<form className="flex flex-col gap-space-lg" id="sourcing-form" onSubmit={(e) => { e.preventDefault(); actions.onSubmit(); }}>
<div className="flex flex-col gap-space-xs">
<label className="font-caption text-caption text-on-surface uppercase tracking-wider font-semibold" htmlFor="sourcing-notes">Specification or mechanic note (optional)</label>
<textarea className="w-full rounded-lg bg-surface-container-low px-space-md py-space-sm font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner transition-colors" id="sourcing-notes" placeholder="e.g., Need OEM or equivalent, vehicle has minor squeal on deceleration. Prefer Akebono or Nissin compound." rows={3} value={form.note} onChange={(e) => actions.onNoteChange(e.target.value)} />
</div>

<div className="flex flex-col gap-space-xs">
<span className="font-caption text-caption text-on-surface uppercase tracking-wider font-semibold">Reference caliper or old part photo</span>
<div className="group relative flex flex-col items-center justify-center p-space-xl rounded-xl bg-surface-container-low hover:bg-surface-container transition-all cursor-pointer text-center">
<div className="w-12 h-12 rounded-full bg-surface-container-lowest flex items-center justify-center mb-space-sm text-on-surface shadow-xs group-hover:scale-105 transition-transform">
<span className="material-symbols-outlined text-[24px]">add_a_photo</span>
</div>
<div className="font-body-sm text-body-sm font-semibold text-on-surface">
                  Drop part photo here or <span className="underline">browse local files</span>
</div>
<p className="font-caption text-caption text-on-surface-variant mt-1 max-w-md">
                  A photo of the old part helps our sourcing team match caliper and pad backing plate dimensions exactly.
                </p>
<input accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" type="file" onChange={(e) => { const file = e.target.files?.[0]; if (file) actions.onPhotoSelected(file); }} />
</div>
</div>

<div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-sm">
<button className="w-full sm:w-auto font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors py-2" type="button" onClick={actions.onBack}>
                ← Search a different part or return to categories
              </button>
<button className="w-full sm:w-auto inline-flex items-center justify-center gap-space-sm px-space-xl py-2.5 rounded-lg bg-primary hover:bg-inverse-surface text-on-primary font-body-md text-body-md font-semibold transition-all shadow-md active:scale-[0.98]" type="submit">
<span>Ask Roam to add this part</span>
<span className="material-symbols-outlined text-[18px]">send</span>
</button>
</div>
</form>
</div>

<div className="hidden rounded-xl bg-emerald-50 text-emerald-950 p-space-lg shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md" id="success-banner">
<div className="flex items-center gap-space-md">
<div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">check</span>
</div>
<div className="flex flex-col">
<span className="font-body-md text-body-md font-semibold text-emerald-900">Request dispatched to {data.hubLabel} Sourcing Desk.</span>
<span className="font-caption text-caption text-emerald-700">Ticket #REQ-8849 logged. Average quote time is currently 18 minutes.</span>
</div>
</div>
<button type="button" className="font-body-sm text-body-sm text-emerald-900 font-semibold underline underline-offset-4 hover:text-emerald-700 whitespace-nowrap" onClick={actions.onViewActivity}>
            View in activity ledger →
          </button>
</div>
</div>

<div className="lg:col-span-4 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Active Fleet Target</span>
<span className="font-label-plate text-label-plate px-2 py-0.5 rounded bg-surface-container text-on-surface">{data.plate}</span>
</div>
<div className="flex items-center gap-space-md">
<div className="w-16 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0 flex items-center justify-center">
{data.vehiclePhotoUrl ? (
<img className="w-full h-full object-cover" alt="" src={data.vehiclePhotoUrl} />
) : (
<span className="material-symbols-outlined text-on-surface-variant">directions_car</span>
)}
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">{data.vehicleLabel} Hybrid</span>
<span className="font-caption text-caption text-on-surface-variant">{data.hubLabel} Route Cluster 03</span>
</div>
</div>
<div className="grid grid-cols-2 gap-space-sm pt-space-xs font-label-code text-caption">
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
<span className="text-on-surface-variant">Odometer</span>
<span className="text-on-surface font-semibold">{data.targetKmLabel}</span>
</div>
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
<span className="text-on-surface-variant">Brake wear est.</span>
<span className="text-error font-semibold">{data.healthLeftLabel}</span>
</div>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
<div className="flex items-center gap-space-sm">
<span className="material-symbols-outlined text-[20px] text-on-surface">storefront</span>
<h3 className="font-headline-sm text-body-lg font-semibold text-on-surface">What happens next?</h3>
</div>
<ul className="flex flex-col gap-space-md font-body-sm text-body-sm text-on-surface-variant">
<li className="flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">manage_search</span>
<span><strong>Roam finds the right part number</strong> for your car, trim, and position.</span>
</li>
<li className="flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">inventory_2</span>
<span><strong>It shows in Find parts</strong> once the catalog entry is added for your fleet.</span>
</li>
</ul>
</div>
</div>
</div>

<div className="w-full bg-surface-container-lowest rounded-xl px-space-lg py-space-md shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-sm font-label-code text-caption text-on-surface-variant">
<div className="flex items-center gap-space-lg">
<span className="flex items-center gap-1.5 text-on-surface font-semibold">
<span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          SYS LATENCY: 24ms (KIN)
        </span>
<span className="hidden sm:inline text-outline-variant">|</span>
<span>STATUS: ALL SYSTEMS NOMINAL</span>
</div>
<div className="flex items-center gap-space-lg">
<span>INVENTORY PROTOCOL: KIN-V2-ROAM</span>
<span className="hidden sm:inline text-outline-variant">|</span>
<span className="text-on-surface font-semibold">Jamaican Fleet hub</span>
</div>
</div>
</div>

</div></div>

    </div>
  );
}
