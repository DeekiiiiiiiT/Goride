import type { ReactNode } from "react";
import type { Fp3AreaRow, Fp3ViewModel } from "../findPartsViewModels";
import { orNoneYet } from "../findPartsFormat";

export type Fp3Actions = {
  onBack: () => void;
  onSkipTriage: () => void;
  onContinueToPosition: () => void;
  onPickPart: (id: string, name: string, positionAware?: boolean) => void;
  onPickProblem: (id: string, name: string, positionAware?: boolean) => void;
  onPickServiceDue: (id: string, name: string) => void;
  onSelectArea: (id: string) => void;
  onSelectSubChip: (chipId: string, name: string, positionAware?: boolean) => void;
  onToggleSymptom: (id: string) => void;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSearchHit: (id: string, name: string, positionAware?: boolean) => void;
  onStartVoiceSearch: () => void;
  searchQuery: string;
  selectedAreaId: string;
  openSymptomId: string;
  speechSupported: boolean;
  children?: ReactNode;
};

function fp3AreaIcon(name: string) {
  const text = name.toLowerCase();
  if (text.includes("brake")) return "emergency_heat";
  if (text.includes("filter")) return "filter_alt";
  if (text.includes("engine")) return "build";
  if (text.includes("suspension") || text.includes("steer")) return "swap_driving_apps_wheel";
  if (text.includes("light")) return "visibility";
  if (text.includes("cool")) return "mode_fan";
  if (text.includes("battery") || text.includes("electrical")) return "bolt";
  if (text.includes("a/c")) return "ac_unit";
  if (text.includes("transmission")) return "settings_input_component";
  if (text.includes("tire") || text.includes("wheel")) return "tire_repair";
  return "category";
}

export function Fp3Screen({
  actions,
  data,
  activeArea,
}: {
  actions: Fp3Actions;
  data: Fp3ViewModel;
  activeArea?: Fp3AreaRow;
}) {
  const areaPanel = activeArea || data.areas[0];
  const showHits = actions.searchQuery.trim().length >= 2 && data.searchHits.length > 0;
  const servicesLine = data.serviceDueRows.filter((r) => r.name !== "None yet").map((r) => r.name).join(", ") || "None yet";
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">

<div className="sticky top-0 z-20 w-full bg-surface-container-lowest shadow-sm">
<div className="w-full py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">

<nav aria-label="Step progress" className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
<div className="flex items-center gap-2 group cursor-pointer shrink-0">
<span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-label-code text-caption">
<span className="material-symbols-outlined text-[13px]">check</span>
</span>
<span className="font-body-sm text-body-sm text-on-surface-variant font-medium">1. Pick car</span>
</div>
<span className="text-surface-dim font-label-code text-caption px-1">/</span>
<div className="flex items-center gap-2 group cursor-pointer shrink-0">
<span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-label-code text-caption">
<span className="material-symbols-outlined text-[13px]">check</span>
</span>
<span className="font-body-sm text-body-sm text-on-surface-variant font-medium">2. Trim: {data.trimLabel}</span>
</div>
<span className="text-surface-dim font-label-code text-caption px-1">/</span>
<div className="flex items-center gap-2 bg-primary text-on-primary px-2.5 py-1 rounded shrink-0 shadow-sm">
<span className="w-4 h-4 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center font-label-code text-[10px] font-bold">3</span>
<span className="font-body-sm text-body-sm font-semibold tracking-tight">3. Part Category</span>
</div>
<span className="text-surface-dim font-label-code text-caption px-1">/</span>
<div className="flex items-center gap-2 text-outline shrink-0 opacity-70">
<span className="w-5 h-5 rounded-full bg-surface-container text-outline flex items-center justify-center font-label-code text-caption">4</span>
<span className="font-body-sm text-body-sm">4. Position & Fit</span>
</div>
</nav>

<div className="flex items-center gap-3 shrink-0 self-start lg:self-center bg-surface-container-low px-3 py-1.5 rounded-lg">
<div className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors">
<span className="font-headline-sm text-[14px] text-on-surface font-semibold tracking-tight">{data.vehicleLabel} · {data.plate}</span>
<span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
</div>
<span className="w-1 h-3 bg-surface-container-high rounded-full"></span>
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant uppercase tracking-wider">
          {data.trimLabel}
        </span>
<span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-label-code text-secondary">
<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>{data.orgShortCode}
        </span>
</div>
</div>
</div>

<div className="w-full py-8 space-y-8">

<div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
<div>
<div className="font-caption text-caption text-secondary uppercase tracking-widest mb-1 flex items-center gap-1.5">
<span className="material-symbols-outlined text-[14px]">precision_manufacturing</span>
          Telemetry & Fitment Index · {data.hubLabel} Warehouse
        </div>
<h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">What part do you need?</h1>
<p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
          Search by name, browse component groups, or diagnose by reported symptom.
        </p>
</div>
<button type="button" className="self-start md:self-auto text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm py-2 px-3 rounded hover:bg-surface-container transition-colors flex items-center gap-1" onClick={actions.onSkipTriage}>
<span>Skip guided triage</span>
<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>

<section aria-label="Maintenance alerts" className="relative overflow-hidden rounded-xl bg-tertiary-fixed/40 p-5 md:p-6 shadow-sm">
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
<div className="flex items-start gap-4">
<div className="w-10 h-10 rounded-lg bg-surface-container-lowest text-on-tertiary-fixed-variant flex items-center justify-center shrink-0 shadow-sm">
<span className="material-symbols-outlined text-[22px]">pending_actions</span>
</div>
<div>
<div className="flex flex-wrap items-center gap-2 mb-1">
<span className="font-caption text-caption uppercase tracking-wider font-bold text-on-tertiary-fixed-variant bg-surface-container-lowest/80 px-2 py-0.5 rounded">
                Scheduled Maintenance Active
              </span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed-variant font-medium">Due soon</span>
<span className="font-label-code text-caption text-on-surface-variant">{data.odometerLabel} · {data.hubLabel} Hub Schedule</span>
</div>
<h2 className="font-headline-sm text-headline-sm text-on-surface">This car has {data.serviceDueRows.length} services due: {servicesLine}</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{data.telematicsLine}</p>
</div>
</div>

<div className="flex flex-wrap items-center gap-2.5 shrink-0">
{data.serviceDueRows.map((row) => (
<button key={row.id} type="button" className="group flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container-lowest hover:bg-on-surface hover:text-surface-bright transition-all shadow-sm text-on-surface font-body-sm text-body-sm font-medium" onClick={() => actions.onPickServiceDue(row.id, row.name)}>
<span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-surface-bright">oil_barrel</span>
<span>{row.name}</span>
<span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
</button>
))}
</div>
</div>
</section>

<div className="relative w-full">
<div className="relative flex items-center">
<span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[22px] pointer-events-none">search</span>
<input className="w-full h-14 pl-12 pr-28 rounded-xl bg-surface-container-lowest text-on-surface font-body-lg text-body-lg placeholder:text-outline shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all" placeholder="Try 'brake pads', 'o2 sensor' or OEM part number (e.g., 45022-T5B-J00)..." type="text" value={actions.searchQuery} onChange={(event) => actions.onSearchChange(event.target.value)} />
<div className="absolute right-3.5 flex items-center gap-2">
{actions.searchQuery ? (
<button type="button" className="hidden sm:inline-block font-label-code text-caption px-2 py-1 rounded bg-surface-container-low text-on-surface-variant" onClick={actions.onSearchClear}>ESC to clear</button>
) : (
<span className="hidden sm:inline-block font-label-code text-caption px-2 py-1 rounded bg-surface-container-low text-on-surface-variant">ESC to clear</span>
)}
{actions.speechSupported ? (
<button type="button" className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-dim transition-colors" onClick={actions.onStartVoiceSearch}>
<span className="material-symbols-outlined text-[18px]">mic</span>
</button>
) : null}
</div>
</div>

{showHits ? (
<div className="absolute top-16 left-0 right-0 z-20 bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden mt-1">
<div className="px-4 py-2 bg-surface-container-low flex items-center justify-between font-caption text-caption text-secondary uppercase tracking-wider font-semibold">
<span>Direct Match Suggestions for {data.vehicleLabel}</span>
<span>Index DB: 2025.04-KIN</span>
</div>
<div className="divide-y divide-surface-container-low">
{data.searchHits.map((hit, index) => (
<button key={`${hit.id}-${index}`} type="button" className={`w-full px-4 py-3 hover:bg-surface-container flex items-center justify-between transition-colors text-left ${index === 0 ? "bg-secondary-container/20 hover:bg-secondary-container/40" : ""}`} onClick={() => actions.onSearchHit(hit.id, hit.name, hit.positionAware)}>
<div className="flex items-center gap-3">
<span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[16px]">sensors</span>
</span>
<div>
<span className="font-body-md text-body-md font-semibold text-on-surface">{hit.name}</span>
{hit.note ? <span className="text-on-surface-variant font-body-sm text-body-sm ml-1.5">— {hit.note}</span> : null}
</div>
</div>
<div className="flex items-center gap-2">
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{orNoneYet(hit.tag || areaPanel?.name)}</span>
<span className="material-symbols-outlined text-[16px] text-surface-dim">north_east</span>
</div>
</button>
))}
</div>
</div>
) : null}
</div>

<section className="space-y-4 pt-4">
<div className="flex items-center justify-between">
<div>
<h2 className="font-headline-sm text-headline-sm text-on-surface">Common parts</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant">Frequently ordered items for routine {data.hubLabel} fleet depot turnaround.</p>
</div>
<span className="font-label-code text-caption text-secondary uppercase">Rapid Pick</span>
</div>
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
{data.partTiles.map((tile) => (
<button
  key={tile.id}
  type="button"
  className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative overflow-hidden text-left"
  onClick={() => actions.onPickPart(tile.id, tile.name, true)}
>
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">inventory_2</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">{tile.meta}</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">{tile.name}</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">{tile.meta}</div>
</div>
</button>
))}
</div>
</section>

<section className="space-y-4">
<div className="flex items-center justify-between">
<div>
<h2 className="font-headline-sm text-headline-sm text-on-surface">By area</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant">Full schematic breakdown for {data.vehicleLabel} chassis.</p>
</div>
<span className="font-label-code text-caption text-on-surface-variant font-medium">{data.categoryTotal} Categories Total</span>
</div>

<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
{data.areas.map((area) => {
  const active = actions.selectedAreaId === area.id;
  return (
<button key={area.id} type="button" className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors ${active ? "bg-primary text-on-primary shadow-md" : "bg-surface-container-lowest hover:bg-surface-container"}`} onClick={() => actions.onSelectArea(area.id)}>
<span className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${active ? "bg-surface-container-lowest text-primary" : "bg-surface-container text-on-surface"}`}>
<span className="material-symbols-outlined text-[18px]">{fp3AreaIcon(area.name)}</span>
</span>
<div className="min-w-0">
<p className={`font-body-sm text-body-sm truncate ${active ? "font-bold text-on-primary" : "font-semibold text-on-surface"}`}>{area.name}</p>
<p className={`font-caption text-caption ${active ? "text-surface-variant" : "text-on-surface-variant"}`}>{area.partCount > 0 ? `${area.partCount} parts` : "None yet"}</p>
</div>
</button>
  );
})}
</div>

<div className="bg-surface-container-low p-4 rounded-xl shadow-xs">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-surface-container">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-on-surface">subdirectory_arrow_right</span>
<span className="font-body-md text-body-md font-semibold text-on-surface">{areaPanel?.name || "None yet"} Subcategories ({data.trimLabel} Chassis)</span>
<span className="font-label-code text-caption text-secondary">{areaPanel?.subChips.length || 0} items</span>
</div>
<span className="font-caption text-caption text-on-surface-variant">Click chip to change or select multiple</span>
</div>
<div className="flex flex-wrap items-center gap-2">
{(areaPanel?.subChips || []).map((chip) => (
<button key={chip.id} type="button" className={`flex items-center gap-2 px-3.5 py-1.5 rounded font-body-sm text-body-sm transition-colors shadow-xs ${chip.selected ? "bg-primary text-on-primary font-semibold" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface"}`} onClick={() => actions.onSelectSubChip(chip.id, chip.name, chip.positionAware)}>
{chip.selected ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
<span>{chip.name}</span>
{chip.selected ? <span className="font-label-code text-caption opacity-80">(Selected)</span> : (
<span className="font-label-code text-caption text-on-surface-variant">{chip.metaLabel}</span>
)}
</button>
))}
{!(areaPanel?.subChips.length) ? <span className="font-body-sm text-body-sm text-on-surface-variant">None yet</span> : null}
</div>
</div>
</section>

<section className="space-y-4">
<div className="flex items-center justify-between">
<div>
<div className="flex items-center gap-2">
<span className="w-2 h-2 rounded-full bg-secondary"></span>
<h2 className="font-headline-sm text-headline-sm text-on-surface">What's wrong with the car?</h2>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant">Symptom-guided diagnostic assistant for drivers and road mechanics.</p>
</div>
<span className="font-caption text-caption text-secondary uppercase font-semibold">Triage Rulebook v2.4</span>
</div>
<div className="space-y-2">
{data.symptoms.map((symptom) => {
  const expanded = actions.openSymptomId === symptom.id;
  return (
<div key={symptom.id} className="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
<button type="button" className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors" onClick={() => actions.onToggleSymptom(symptom.id)}>
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">volume_up</span>
</span>
<div>
<span className="font-headline-sm text-[16px] text-on-surface font-semibold">{symptom.name}</span>
<span className="hidden md:inline-block ml-3 font-caption text-caption text-on-surface-variant">{symptom.weightLabel}</span>
</div>
</div>
<span className={`material-symbols-outlined text-[20px] text-on-surface transition-transform ${expanded ? "rotate-180" : ""}`}>expand_more</span>
</button>
{expanded ? (
<div className="px-5 pb-5 pt-1 space-y-4 bg-surface-container-lowest">
<div className="bg-surface-container-low p-4 rounded-lg flex items-start gap-3">
<span className="material-symbols-outlined text-[20px] text-on-surface mt-0.5 shrink-0">info</span>
<div>
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Telemetry & Mechanical Assessment:</span>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{symptom.answerText}</p>
</div>
</div>
<div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
{symptom.parts.map((part, partIndex) => (
<div key={part.id} className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex flex-col justify-between gap-4">
<div>
<div className="flex items-center justify-between mb-2">
<span className={`font-label-code text-caption px-2 py-0.5 rounded ${partIndex === 0 ? "bg-primary text-on-primary font-bold" : "bg-surface-container-high text-on-surface-variant font-medium"}`}>{part.weightLabel}</span>
<span className="font-label-code text-caption text-on-surface-variant">{data.trimLabel}</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">{part.name}</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Direct OEM replacement compatible with {data.trimLabel} hybrid brake recovery regeneration calipers.</p>
</div>
<div className="flex items-center justify-end pt-2">
<button type="button" className={`px-3.5 py-1.5 rounded-lg font-body-sm text-body-sm font-medium flex items-center gap-1 transition-opacity ${partIndex === 0 ? "bg-primary text-on-primary hover:opacity-90" : "bg-surface-container hover:bg-surface-container-high text-on-surface"}`} onClick={() => actions.onPickProblem(part.id, part.name, part.positionAware)}>
<span>{partIndex === 0 ? `Select ${part.name}` : `Add ${part.name} to check`}</span>
<span className="material-symbols-outlined text-[16px]">{partIndex === 0 ? "arrow_forward" : "add"}</span>
</button>
</div>
</div>
))}
{!symptom.parts.length ? <span className="font-body-sm text-body-sm text-on-surface-variant">None yet</span> : null}
</div>
</div>
) : null}
</div>
  );
})}
</div>
</section>

<div className="pt-6 pb-12 flex flex-col md:flex-row items-center justify-between gap-4">
<button type="button" className="w-full md:w-auto px-4 py-2.5 rounded-lg text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 transition-colors" onClick={actions.onBack}>
<span className="material-symbols-outlined text-[18px]">arrow_back</span>
<span>Back to car selection</span>
</button>
<div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
<button type="button" className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors text-center shadow-xs" onClick={actions.onSkipTriage}>
          Skip — show everything for this car ({data.partTotal} parts) →
        </button>
<button type="button" className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary hover:bg-on-surface text-on-primary font-body-md text-body-md font-semibold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]" onClick={actions.onContinueToPosition}>
<span>Continue to Position & Fit{data.selectedPartName !== "None yet" ? ` · ${data.selectedPartName}` : ""}</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
</div>
</div>
</div>
</div></div>
    </div>
  );
}
