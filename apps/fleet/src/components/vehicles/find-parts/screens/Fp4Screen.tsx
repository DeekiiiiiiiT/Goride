import type { ReactNode } from "react";
import type { Fp4ViewModel } from "../findPartsViewModels";

export type Fp4Actions = {
  onBack: () => void;
  onPickFront: () => void;
  onPickRear: () => void;
  onPickBoth: () => void;
  onShowParts: (side: string) => void;
  onEditPartCategory: () => void;
  children?: ReactNode;
};

function pickPositionOption(actions: Fp4Actions, id: string) {
  if (id === "rear") actions.onPickRear();
  else if (id === "both") actions.onPickBoth();
  else actions.onPickFront();
}

export function Fp4Screen({ actions, data }: { actions: Fp4Actions; data: Fp4ViewModel }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">



<section className="w-full bg-surface-container-lowest shadow-sm z-30">
<div className="w-full py-space-md flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md">

<nav aria-label="Step progress" className="flex items-center gap-space-xs overflow-x-auto text-body-sm font-body-sm">
<button type="button" className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface whitespace-nowrap group" onClick={actions.onBack}>
<span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-caption text-caption">
<span className="material-symbols-outlined text-[13px]">check</span>
</span>
<span className="font-medium">1. Pick vehicle</span>
</button>
<span className="text-surface-dim font-label-code text-label-code">/</span>
<button type="button" className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface whitespace-nowrap group" onClick={actions.onBack}>
<span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-caption text-caption">
<span className="material-symbols-outlined text-[13px]">check</span>
</span>
<span className="font-medium">2. Trim & Year</span>
</button>
<span className="text-surface-dim font-label-code text-label-code">/</span>
<button type="button" className="flex items-center gap-1.5 text-on-surface-variant hover:text-on-surface whitespace-nowrap group" onClick={actions.onEditPartCategory}>
<span className="w-5 h-5 rounded-full bg-surface-container-highest text-on-surface flex items-center justify-center font-caption text-caption">
<span className="material-symbols-outlined text-[13px]">check</span>
</span>
<span className="font-medium">3. Category</span>
</button>
<span className="text-surface-dim font-label-code text-label-code">/</span>
<div className="flex items-center gap-1.5 text-on-surface whitespace-nowrap font-semibold">
<span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center font-caption text-caption">4</span>
<span className="bg-surface-container px-space-xs py-0.5 rounded">4. Position & Fit</span>
</div>
</nav>

<div className="flex items-center flex-wrap gap-space-sm bg-surface-container-low px-space-md py-1.5 rounded-lg shadow-sm">
<div className="flex items-center gap-1.5 font-label-code text-label-code text-on-surface">
<span className="font-bold">{data.vehicleLabel}</span>
<span className="text-outline">›</span>
<button type="button" className="flex items-center gap-0.5 text-primary hover:underline group" onClick={actions.onEditPartCategory}>
<span className="font-medium">Brake pads</span>
<span className="material-symbols-outlined text-[14px]">edit</span>
</button>
</div>
<span className="text-surface-dim">|</span>

<div className="flex items-center gap-space-xs">
<span className="font-label-plate text-label-plate bg-primary text-on-primary px-space-xs py-0.5 rounded shadow-sm">{data.plate}</span>
<span className="font-caption text-caption bg-surface-container-highest text-on-surface-variant px-space-sm py-0.5 rounded">1.5 Hybrid · {data.trimLabel}</span>
<span className="font-caption text-caption bg-secondary-fixed text-on-secondary-fixed px-space-sm py-0.5 rounded hidden sm:inline-block">{data.hubLabel} Fleet Unit</span>
</div>
</div>
</div>
</section>

<div className="w-full py-space-xl flex flex-col gap-space-xl">

<div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
<div className="space-y-1">
<span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Axle Position Disambiguation</span>
<h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Which brakes?</h1>
<p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
          Front and back {data.partLabel} are different parts on the {data.trimLabel} chassis. Select the axle needing replacement to load correct caliper fitments.
        </p>
</div>

<div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center gap-space-lg">
<div className="flex flex-col">
<span className="font-caption text-caption text-on-surface-variant uppercase">Current ODO</span>
<span className="font-label-code text-label-code font-bold text-on-surface">{data.odometerLabel}</span>
</div>
<div className="w-px h-8 bg-surface-container"></div>
<div className="flex flex-col">
<span className="font-caption text-caption text-on-surface-variant uppercase">Last Brake Service</span>
<span className="font-label-code text-label-code text-on-surface">{data.lastServiceLabel} ago</span>
</div>
</div>
</div>

<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

<div className="lg:col-span-5 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<div className="flex items-center gap-space-xs font-label-code text-label-code font-bold text-on-surface">
<span className="material-symbols-outlined text-[18px]">build_circle</span>
<span>CHASSIS VISUAL INSPECTION</span>
</div>
<span className="font-caption text-caption bg-surface-container-high text-on-surface-variant px-space-sm py-0.5 rounded">{data.trimLabel} · FWD</span>
</div>

<div className="flex items-center justify-center gap-1.5 py-1 bg-surface-container-low rounded text-on-surface-variant font-caption text-caption uppercase font-semibold tracking-wider">
<span className="material-symbols-outlined text-[14px]">arrow_upward</span>
<span>▲ Front of vehicle (Direction of Travel)</span>
</div>

<div className="relative w-full h-[460px] bg-surface-container-low rounded-xl flex items-center justify-center p-space-md overflow-hidden">

<div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle, #78767d 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>

<svg className="w-full h-full max-w-[280px]" fill="none" viewBox="0 0 260 420" xmlns="http://www.w3.org/2000/svg">

<line stroke="#c9c5cd" stroke-dasharray="4 4" stroke-width="1" x1="130" x2="130" y1="20" y2="400"></line>

<path d="M 60 70 C 60 40, 80 25, 130 25 C 180 25, 200 40, 200 70 L 205 110 C 210 160, 210 280, 204 350 C 202 385, 175 395, 130 395 C 85 395, 58 385, 56 350 C 50 280, 50 160, 55 110 Z" fill="#eceef0"></path>
<path d="M 68 85 C 80 50, 180 50, 192 85 L 188 140 C 180 144, 80 144, 72 140 Z" fill="#ffffff" opacity="0.8"></path>

<path d="M 75 320 L 185 320 C 180 345, 160 360, 130 360 C 100 360, 80 345, 75 320 Z" fill="#ffffff" opacity="0.8"></path>

<rect fill="#e0e3e5" height="155" rx="8" width="112" x="74" y="152"></rect>

<g className="cursor-pointer transition-opacity duration-300" id="diagram-front-axle" onClick={actions.onPickFront} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") actions.onPickFront(); }} role="button" tabIndex={0}>

<line stroke="#191c1e" stroke-linecap="round" stroke-width="4" x1="32" x2="228" y1="112" y2="112"></line>

<rect fill="#191c1e" height="52" rx="4" width="22" x="22" y="86"></rect>
<rect fill="#5d5d6d" height="32" rx="2" width="6" x="42" y="96"></rect>

<rect fill="#191c1e" height="52" rx="4" width="22" x="216" y="86"></rect>
<rect fill="#5d5d6d" height="32" rx="2" width="6" x="212" y="96"></rect>

<circle cx="45" cy="112" fill="#000000" fill-opacity="0.1" r="14"></circle>
<circle cx="215" cy="112" fill="#000000" fill-opacity="0.1" r="14"></circle>

<circle cx="45" cy="112" fill="#000000" r="5"></circle>
<circle cx="215" cy="112" fill="#000000" r="5"></circle>
</g>

<g className="cursor-pointer transition-opacity duration-300 opacity-25" id="diagram-rear-axle" onClick={actions.onPickRear} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") actions.onPickRear(); }} role="button" tabIndex={0}>

<line stroke="#191c1e" stroke-linecap="round" stroke-width="4" x1="32" x2="228" y1="324" y2="324"></line>

<rect fill="#191c1e" height="48" rx="4" width="22" x="22" y="300"></rect>
<rect fill="#5d5d6d" height="32" rx="2" width="5" x="42" y="308"></rect>

<rect fill="#191c1e" height="48" rx="4" width="22" x="216" y="300"></rect>
<rect fill="#5d5d6d" height="32" rx="2" width="5" x="213" y="308"></rect>

<circle cx="44" cy="324" fill="#000000" r="4"></circle>
<circle cx="216" cy="324" fill="#000000" r="4"></circle>
</g>
</svg>

<div className="absolute top-20 left-4">
<button type="button" className="px-space-sm py-0.5 rounded font-caption text-caption uppercase tracking-wider bg-primary text-on-primary shadow-sm flex items-center gap-1 transition-all" id="diagram-front-pill" onClick={actions.onPickFront}>
<span className="w-1.5 h-1.5 rounded-full bg-tertiary-fixed"></span>
<span>Front Axle (Selected)</span>
</button>
</div>
<div className="absolute bottom-24 left-4">
<button type="button" className="px-space-sm py-0.5 rounded font-caption text-caption uppercase tracking-wider bg-surface-container-highest text-on-surface-variant flex items-center gap-1 transition-all" id="diagram-rear-pill" onClick={actions.onPickRear}>
<span>Rear Axle</span>
</button>
</div>
</div>

<div className="grid grid-cols-2 gap-space-sm">
<div className="p-space-sm bg-surface-container-low rounded-lg flex flex-col gap-0.5">
<span className="font-caption text-caption uppercase text-on-surface-variant font-bold">Front Rotor Spec</span>
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Disc (Vented, 262mm)</span>
<span className="font-caption text-caption text-on-surface-variant">Floating single-piston</span>
</div>
<div className="p-space-sm bg-surface-container-low rounded-lg flex flex-col gap-0.5">
<span className="font-caption text-caption uppercase text-on-surface-variant font-bold">Rear Rotor Spec</span>
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Disc (Solid, 239mm)</span>
<span className="font-caption text-caption text-on-surface-variant">Mechanical handbrake integrated</span>
</div>
</div>
</div>

<div className="lg:col-span-7 flex flex-col gap-space-md">

{data.options.map((option, index) => {
  const selected = index === 0;
  return (
<button
  key={option.id}
  type="button"
  id={`card-${option.id}`}
  className={`cursor-pointer rounded-xl p-space-lg shadow-sm transition-all flex flex-col gap-space-md text-left w-full ${selected ? "bg-surface-container-high" : "bg-surface-container-lowest hover:bg-surface-container-low"}`}
  onClick={() => pickPositionOption(actions, option.id)}
>
<div className="flex items-start justify-between gap-space-md">
<div className="flex items-start gap-space-md">
<div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm ${selected ? "bg-primary text-on-primary" : "bg-surface-container-high text-transparent"}`}>
<span className="material-symbols-outlined text-[16px]">{selected ? "check" : ""}</span>
</div>
<div className="space-y-1">
<div className="flex items-center gap-space-sm flex-wrap">
<h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">{option.heading}</h3>
{option.id === "rear" ? (
<span className="font-caption text-caption bg-surface-container-high text-on-surface-variant px-space-xs py-0.5 rounded">Secondary Wear</span>
) : null}
{option.offerLabel ? (
<span className="font-caption text-caption uppercase bg-primary text-on-primary px-space-xs py-0.5 rounded font-semibold tracking-wider">{option.offerLabel}</span>
) : null}
</div>
<p className="font-body-md text-body-md text-on-surface font-medium">{option.title}</p>
{option.subtitle && option.subtitle !== "None yet" ? <p className="font-body-sm text-body-sm text-on-surface-variant">{option.subtitle}</p> : null}
</div>
</div>
<div className="text-right flex-shrink-0">
<span className="font-caption text-caption uppercase text-on-surface-variant block">Est. Replacement Time</span>
<span className="font-label-code text-label-code font-bold text-on-surface">{option.replacementTimeLabel}</span>
</div>
</div>
<div className="bg-surface-container-lowest p-space-sm rounded-lg flex items-center gap-space-sm text-on-surface-variant font-body-sm text-body-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface">info</span>
<span>{option.infoLine}</span>
</div>
<div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
<div className="flex items-center gap-2">
<span className={`w-2.5 h-2.5 rounded-full ${selected ? "bg-primary animate-pulse" : "bg-secondary"}`}></span>
<span className="font-label-code text-label-code font-bold text-on-surface">{option.replacementTimeLabel} typical install</span>
</div>
</div>
</button>
  );
})}

<div className="bg-surface-container-low rounded-xl p-space-md shadow-sm flex items-start gap-space-md">
<div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center flex-shrink-0 text-on-surface">
<span className="material-symbols-outlined text-[18px]">lightbulb</span>
</div>
<div className="space-y-1">
<h4 className="font-body-md text-body-md font-bold text-on-surface">Fleet Maintenance Tip</h4>
<p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              If the driver reported squealing while applying normal pedal pressure on Red Hills Road routes, inspect the Front pads first. {data.hubLabel} city driving causes front wear at roughly twice the rate of rear solid discs.
            </p>
</div>
</div>
</div>
</div>

<div className="w-full bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-center justify-between gap-space-md">
<button type="button" className="px-space-lg py-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md text-body-md font-medium transition-colors flex items-center gap-space-xs" onClick={actions.onEditPartCategory}>
<span className="material-symbols-outlined text-[18px]">arrow_back</span>
<span>Back to Categories</span>
</button>
<div className="flex items-center gap-space-md">
<div className="hidden sm:flex flex-col text-right">
<span className="font-caption text-caption text-on-surface-variant uppercase">Filtered Catalog</span>
<span className="font-label-code text-label-code text-on-surface font-bold">Front Fitment Verified</span>
</div>
<button type="button" className="px-space-xl py-2.5 rounded-lg bg-primary text-on-primary hover:bg-inverse-surface font-body-md text-body-md font-semibold transition-transform active:scale-95 flex items-center gap-space-sm shadow-md" onClick={() => actions.onShowParts(data.options[0]?.id || "front")}>
<span>Show parts</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
<span className="font-caption text-caption bg-surface-container-highest/30 px-space-xs py-0.5 rounded text-on-primary font-normal" id="parts-available-count">
            (6 matching parts available)
          </span>
</button>
</div>
</div>
</div>
</div></div>

    </div>
  );
}
