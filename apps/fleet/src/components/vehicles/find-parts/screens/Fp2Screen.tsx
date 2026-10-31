import type { ReactNode } from "react";
import type { Fp2ViewModel } from "../findPartsViewModels";

export type Fp2Actions = {
  onBack: () => void;
  onContinue: () => void;
  onPickVersion: (id: string) => void;
  onUniversalMode: () => void;
  onLookupChassis: () => void;
  onChangeCar: () => void;
  onAskRoam: () => void;
  children?: ReactNode;
};

export function Fp2Screen({ actions, data }: { actions: Fp2Actions; data: Fp2ViewModel }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full">

<div className="bg-surface-container-low">
<div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-md">
<div className="flex items-center justify-between flex-wrap gap-y-space-sm">
<ol className="flex items-center gap-space-md sm:gap-space-xl flex-wrap">

<li className="flex items-center gap-space-xs text-on-surface cursor-pointer group">
<span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center font-caption text-[11px]">
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
<span className="font-body-sm text-body-sm font-semibold text-on-surface group-hover:underline">1. Vehicle</span>
<span className="material-symbols-outlined text-outline text-[16px] ml-space-xs">chevron_right</span>
</li>

<li className="flex items-center gap-space-xs text-on-surface">
<span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-[11px] font-bold">2</span>
<span className="font-headline-sm text-body-md font-bold text-on-surface">Version & Trim</span>
<span className="material-symbols-outlined text-outline text-[16px] ml-space-xs">chevron_right</span>
</li>

<li className="flex items-center gap-space-xs text-on-surface-variant opacity-60">
<span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">3</span>
<span className="font-body-sm text-body-sm">Part Category</span>
<span className="material-symbols-outlined text-outline text-[16px] ml-space-xs">chevron_right</span>
</li>

<li className="flex items-center gap-space-xs text-on-surface-variant opacity-60">
<span className="w-5 h-5 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">4</span>
<span className="font-body-sm text-body-sm">Position & Fit</span>
</li>
</ol>
<div className="hidden lg:flex items-center gap-2 font-label-code text-caption text-on-surface-variant">
<span className="material-symbols-outlined text-[16px]">verified</span>
<span>DISAMBIGUATION ENGINE · 100% FIT SPEC</span>
</div>
</div>
</div>
</div>

<div className="sticky top-26 z-40 bg-surface-container-lowest/95 backdrop-blur-md shadow-sm">
<div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-2.5 flex items-center justify-between">
<div className="flex items-center gap-space-md">
<div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary">
<span className="material-symbols-outlined text-[20px]">directions_car</span>
</div>
<div className="flex flex-col sm:flex-row sm:items-center sm:gap-space-md">
<div className="flex items-center gap-2">
<span className="font-headline-sm text-headline-sm text-on-surface">{data.vehicleLabel}</span>
<span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-code text-caption">JDM / GK-GP SERIES</span>
</div>
<span className="hidden sm:inline text-surface-dim font-label-code">/</span>
<span className="font-caption text-caption text-on-surface-variant">Awaiting chassis & drivetrain specification confirmation</span>
</div>
</div>
<button type="button" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-all shadow-sm" onClick={actions.onChangeCar}>
<span className="material-symbols-outlined text-[15px]">edit</span>
<span>Change car</span>
</button>
</div>
</div>

<div className="max-w-[1400px] mx-auto w-full px-margin md:px-margin-desktop py-space-xl">
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

<section className="lg:col-span-8 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest p-space-lg sm:p-space-xl rounded-xl shadow-sm">
<div className="flex flex-col gap-1 mb-space-lg">
<div className="flex items-center justify-between">
<span className="font-label-code text-caption uppercase tracking-wider text-secondary">Step 02 Disambiguation</span>
<span className="font-label-code text-caption text-on-tertiary-container bg-tertiary-fixed/30 px-2 py-0.5 rounded">FITMENT SENSITIVE</span>
</div>
<h1 className="font-headline-lg text-headline-lg text-on-surface">Which {data.vehicleLabel} is it?</h1>
<p className="font-body-md text-body-md text-on-surface-variant mt-1">
              These versions take different filters, brakes, fluids, and suspension mounts. Pick the exact powertrain on your fitness certificate or chassis plate.
            </p>
</div>

<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md" id="trim-selector">
{data.versions.map((version) => (
<label
  key={version.id}
  className={`relative flex flex-col justify-between p-space-lg rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md cursor-pointer transition-all duration-150 ${version.selected ? "ring-2 ring-primary shadow-md" : ""}`}
  onClick={() => (version.id === "any" ? actions.onUniversalMode() : actions.onPickVersion(version.id))}
>
<input checked={version.selected} className="sr-only" name="trim_choice" readOnly type="radio" value={version.id} />
<div>
<div className="flex items-start justify-between gap-2 mb-space-sm">
<div className="flex flex-col">
<span className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-1.5">{version.title}</span>
<span className="font-label-code text-caption text-secondary mt-0.5">{version.subtitle}</span>
</div>
<span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${version.selected ? "bg-primary text-on-primary" : "bg-surface-container-high text-transparent"}`}>
<span className="material-symbols-outlined text-[14px]">check</span>
</span>
</div>
<div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-caption text-caption mb-space-md">
<span>{version.fleetShareLabel}</span>
</div>
</div>
<div className="pt-space-sm bg-surface-container-low -mx-space-lg -mb-space-lg p-space-md rounded-b-xl flex items-center justify-between font-label-code text-caption text-on-surface">
<span className="text-secondary">Chassis match:</span>
<span className="font-bold">{version.chassisHint}</span>
</div>
</label>
))}
</div>

<div className="mt-space-lg p-space-md rounded-lg bg-surface-container flex items-start gap-space-md shadow-sm">
<div className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0 mt-0.5">
<span className="material-symbols-outlined text-[18px]">info</span>
</div>
<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full gap-space-sm">
<p className="font-body-sm text-body-sm text-on-surface">
                It's the <strong className="font-semibold text-primary">Model Code</strong> on your fitness certificate or the aluminum stamped plate riveted to the driver's door B-pillar.
              </p>
<div className="shrink-0 font-label-code text-caption bg-surface-container-lowest px-2.5 py-1 rounded text-primary font-bold shadow-sm">
                e.g. {data.chassisExample}
              </div>
</div>
</div>

<div className="mt-space-lg pt-space-md flex flex-col gap-space-sm bg-surface-container-low p-space-md rounded-lg">
<div className="flex items-center justify-between text-on-surface font-label-code text-caption">
<span className="font-bold">PARTS FIT COMPATIBILITY RADAR</span>
<span className="text-secondary">{data.radarTitle} SELECTION</span>
</div>
<div className="grid grid-cols-3 gap-2">
<div className="p-2 rounded bg-surface-container-lowest">
<span className="font-caption text-caption text-secondary block">Powertrain</span>
<span className="font-label-code text-caption font-semibold text-on-surface">1,496 cc DOHC</span>
</div>
<div className="p-2 rounded bg-surface-container-lowest">
<span className="font-caption text-caption text-secondary block">Transmission</span>
<span className="font-label-code text-caption font-semibold text-on-surface">7-Spd Dual Clutch</span>
</div>
<div className="p-2 rounded bg-surface-container-lowest">
<span className="font-caption text-caption text-secondary block">Front Brake Rotor</span>
<span className="font-label-code text-caption font-semibold text-on-surface">262mm Vented Disc</span>
</div>
</div>
</div>

<div className="mt-space-xl pt-space-lg flex items-center justify-between">
<button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center gap-1.5 transition-all" onClick={actions.onBack}>
<span className="material-symbols-outlined text-[16px]">arrow_back</span>
<span>Back</span>
</button>
<button type="button" className="px-space-xl py-2.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary font-body-md text-body-md font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95" onClick={actions.onContinue}>
<span>Continue to Categories</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
</div>
</div>
</section>

<aside className="lg:col-span-4 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center justify-between mb-space-md">
<span className="font-label-code text-caption text-secondary">ACTIVE VEHICLE CONTEXT</span>
<span className="w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse"></span>
</div>
<div className="relative rounded-lg overflow-hidden mb-space-md bg-surface-container flex items-center justify-center min-h-[9rem]">
{data.vehiclePhotoUrl ? (
<img className="w-full h-36 object-cover object-center" alt="" src={data.vehiclePhotoUrl} />
) : (
<span className="material-symbols-outlined text-[48px] text-on-surface-variant">directions_car</span>
)}
<div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-primary/80 backdrop-blur-md text-on-primary font-label-plate text-[12px]">
              {data.vehicleHeroLabel}
            </div>
</div>
<div className="flex flex-col gap-2 font-body-sm text-body-sm">
<div className="flex items-center justify-between py-1 bg-surface-container-low px-2 rounded">
<span className="text-on-surface-variant font-caption text-caption">Generation:</span>
<span className="font-label-code font-bold text-on-surface">3rd Gen (GK/GP Facelift)</span>
</div>
<div className="flex items-center justify-between py-1 bg-surface-container-low px-2 rounded">
<span className="text-on-surface-variant font-caption text-caption">Drive Layout:</span>
<span className="font-label-code font-bold text-on-surface">FF (Front-Wheel Drive)</span>
</div>
<div className="flex items-center justify-between py-1 bg-surface-container-low px-2 rounded">
<span className="text-on-surface-variant font-caption text-caption">Body Style:</span>
<span className="font-label-code font-bold text-on-surface">5-Door Hatchback</span>
</div>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center gap-2 mb-space-sm text-primary">
<span className="material-symbols-outlined text-[20px]">hub</span>
<h3 className="font-headline-sm text-body-md font-bold text-on-surface">{data.hubLabel} Hub Fleet Telemetry</h3>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
            There are <strong className="font-semibold text-primary">2 fleet units</strong> registered in the local {data.hubLabel} Roam fleet inventory.
          </p>
<div className="flex flex-col gap-space-sm">
{data.fleetUnits.map((unit) => (
<div key={unit.unitCode} className="p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
<div className="flex items-center gap-space-sm">
<span className="w-7 h-7 rounded bg-surface-container-highest flex items-center justify-center font-label-code text-caption font-bold">{unit.unitCode}</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">{unit.plateLabel}</span>
<span className="font-caption text-caption text-secondary">{unit.statusLabel}</span>
</div>
</div>
<span className="font-label-code text-caption font-bold px-2 py-0.5 rounded bg-surface-container-highest">{unit.trimBadge}</span>
</div>
))}
</div>
<div className="mt-space-md p-space-sm rounded bg-surface-container text-on-surface font-caption text-caption flex items-center gap-1.5">
<span className="material-symbols-outlined text-[16px] text-secondary">insights</span>
<span>{data.fitSummaryLine}</span>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center gap-2 mb-space-sm text-primary">
<span className="material-symbols-outlined text-[20px]">description</span>
<h3 className="font-headline-sm text-body-md font-bold text-on-surface">Jamaica MV-99 Paper Guide</h3>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
            Look for these fields on your Tax Administration Jamaica (TAJ) Fitness Certificate or Certificate of Title:
          </p>
<div className="space-y-space-sm">
<div className="p-2 rounded-lg bg-surface-container-low flex items-start gap-2">
<span className="material-symbols-outlined text-secondary text-[16px] mt-0.5">pin</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">CHASSIS / FRAME NO.</span>
<span className="font-caption text-caption text-on-surface-variant">The prefix characters before the hyphen (e.g. <span className="font-bold text-on-surface">{data.trimCode}</span>-3012948) dictate the powertrain.</span>
</div>
</div>
<div className="p-2 rounded-lg bg-surface-container-low flex items-start gap-2">
<span className="material-symbols-outlined text-secondary text-[16px] mt-0.5">speed</span>
<div className="flex flex-col">
<span className="font-label-code text-caption font-semibold">ENGINE NUMBER / CC</span>
<span className="font-caption text-caption text-on-surface-variant"><span className="font-bold text-on-surface">LEB-H1</span> indicates 1.5 Hybrid; <span className="font-bold text-on-surface">L15B</span> indicates 1.5 Petrol non-hybrid.</span>
</div>
</div>
</div>
</div>


<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
<div className="flex items-center justify-between mb-space-sm">
<span className="font-label-code text-caption text-secondary">PARTS DESK HELP</span>
<span className="font-caption text-caption text-on-tertiary-container bg-surface-container px-1.5 py-0.5 rounded">24/7 ROAM LEAD</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
            Unsure of the chassis serial? Send your MV registration plate number or photo to our certified Jamaican parts dispatch team.
          </p>
<button type="button" className="w-full py-2 px-space-md rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 transition-all" onClick={actions.onLookupChassis}>
<span className="material-symbols-outlined text-[18px]">support_agent</span>
<span>Lookup Chassis for Me</span>
</button>
</div>
</aside>
</div>
</div>
</div>
</div>
    </div>
  );
}
