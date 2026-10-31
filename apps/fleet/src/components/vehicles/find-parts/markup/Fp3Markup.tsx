/** Auto-generated from Stitch HTML — edit port script, not by hand. */
// @ts-nocheck
import type { ReactNode } from "react";

export type MarkupHandlers = {
  onFpClick?: (detail: { label?: string; card?: boolean; vehicleId?: string }, event: Event) => void;
  children?: ReactNode;
};

export function Fp3Markup({ onFpClick }: MarkupHandlers) {
  return (
    <div className="find-parts-markup-root">
<main className="w-full pt-26 bg-surface min-h-[calc(100vh-80px)]"><div className="flex flex-col w-full">

<div className="sticky top-26 z-30 w-full bg-surface-container-lowest shadow-sm">
<div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-4">

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
<span className="font-body-sm text-body-sm text-on-surface-variant font-medium">2. Trim: 1.5 GP5</span>
</div>
<span className="text-surface-dim font-label-code text-caption px-1">/</span>
<div className="flex items-center gap-2 bg-primary text-on-primary px-2.5 py-1 rounded shrink-0 shadow-sm">
<span className="w-4 h-4 rounded-full bg-surface-container-lowest text-primary flex items-center justify-center font-label-code text-[10px] font-bold">3</span>
<span className="font-body-sm text-body-sm font-semibold tracking-tight">3. Part Category</span>
</div>
<span className="text-surface-dim font-label-code text-caption px-1">/</span>
<div className="flex items-center gap-2 text-outline shrink-0 opacity-70">
<span className="w-5 h-5 rounded-full bg-surface-container text-outline flex items-center justify-center font-label-code text-caption">4</span>
<span className="font-body-sm text-body-sm">4. Position &amp; Fit</span>
</div>
</nav>

<div className="flex items-center gap-3 shrink-0 self-start lg:self-center bg-surface-container-low px-3 py-1.5 rounded-lg">
<div className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors">
<span className="font-headline-sm text-[14px] text-on-surface font-semibold tracking-tight">Honda Fit 2018 · 1505LM</span>
<span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
</div>
<span className="w-1 h-3 bg-surface-container-high rounded-full"></span>
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant uppercase tracking-wider">
          1.5 hybrid · GP5
        </span>
<span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-label-code text-secondary">
<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>KIN-FLEET
        </span>
</div>
</div>
</div>

<div className="max-w-[1440px] mx-auto w-full px-4 md:px-8 py-8 space-y-8">

<div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
<div>
<div className="font-caption text-caption text-secondary uppercase tracking-widest mb-1 flex items-center gap-1.5">
<span className="material-symbols-outlined text-[14px]">precision_manufacturing</span>
          Telemetry &amp; Fitment Index · Kingston Warehouse
        </div>
<h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">What part do you need?</h1>
<p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
          Search by name, browse component groups, or diagnose by reported symptom.
        </p>
</div>
<button className="self-start md:self-auto text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm py-2 px-3 rounded hover:bg-surface-container transition-colors flex items-center gap-1">
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
<span className="font-label-code text-caption text-on-surface-variant">48,210 km · Kingston Hub Schedule</span>
</div>
<h2 className="font-headline-sm text-headline-sm text-on-surface">This car has 2 services due: Engine oil &amp; filter, Air filter</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Automated telematics flag from Kingston Depot Diagnostic bay #3 (Logged yesterday at 17:40 EST).</p>
</div>
</div>

<div className="flex flex-wrap items-center gap-2.5 shrink-0">
<button className="group flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container-lowest hover:bg-on-surface hover:text-surface-bright transition-all shadow-sm text-on-surface font-body-sm text-body-sm font-medium">
<span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-surface-bright">oil_barrel</span>
<span>Engine oil &amp; filter</span>
<span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
</button>
<button className="group flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container-lowest hover:bg-on-surface hover:text-surface-bright transition-all shadow-sm text-on-surface font-body-sm text-body-sm font-medium">
<span className="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-surface-bright">air</span>
<span>Air filter</span>
<span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
</button>
</div>
</div>
</section>

<div className="relative w-full">
<div className="relative flex items-center">
<span className="material-symbols-outlined absolute left-4 text-on-surface-variant text-[22px] pointer-events-none">search</span>
<input className="w-full h-14 pl-12 pr-28 rounded-xl bg-surface-container-lowest text-on-surface font-body-lg text-body-lg placeholder:text-outline shadow-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all" placeholder="Try 'brake pads', 'o2 sensor' or OEM part number (e.g., 45022-T5B-J00)..." type="text" />
<div className="absolute right-3.5 flex items-center gap-2">
<span className="hidden sm:inline-block font-label-code text-caption px-2 py-1 rounded bg-surface-container-low text-on-surface-variant">ESC to clear</span>
<button className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface hover:bg-surface-dim transition-colors">
<span className="material-symbols-outlined text-[18px]">mic</span>
</button>
</div>
</div>

<div className="absolute top-16 left-0 right-0 z-20 bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden mt-1">
<div className="px-4 py-2 bg-surface-container-low flex items-center justify-between font-caption text-caption text-secondary uppercase tracking-wider font-semibold">
<span>Direct Match Suggestions for Honda Fit GP5</span>
<span>Index DB: 2025.04-KIN</span>
</div>
<div className="divide-y divide-surface-container-low">
<div className="px-4 py-3 hover:bg-surface-container cursor-pointer flex items-center justify-between transition-colors">
<div className="flex items-center gap-3">
<span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[16px]">sensors</span>
</span>
<div>
<span className="font-body-md text-body-md font-semibold text-on-surface">Oxygen sensor</span>
<span className="text-on-surface-variant font-body-sm text-body-sm ml-1.5">— also called O2 sensor / Lambda probe</span>
</div>
</div>
<div className="flex items-center gap-2">
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">Exhaust / Emissions</span>
<span className="material-symbols-outlined text-[16px] text-surface-dim">north_east</span>
</div>
</div>
<div className="px-4 py-3 bg-secondary-container/20 hover:bg-secondary-container/40 cursor-pointer flex items-center justify-between transition-colors">
<div className="flex items-center gap-3">
<span className="w-7 h-7 rounded bg-surface-container-lowest flex items-center justify-center text-primary shadow-xs">
<span className="material-symbols-outlined text-[16px]">emergency_heat</span>
</span>
<div>
<span className="font-body-md text-body-md font-semibold text-on-surface">Brake pads</span>
<span className="text-on-surface-variant font-body-sm text-body-sm ml-1.5">— Disc brake friction set (Front/Rear)</span>
</div>
</div>
<div className="flex items-center gap-2">
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-lowest text-primary font-bold shadow-xs">Front &amp; Rear available · 2 in stock</span>
<span className="material-symbols-outlined text-[16px] text-primary">north_east</span>
</div>
</div>
<div className="px-4 py-3 hover:bg-surface-container cursor-pointer flex items-center justify-between transition-colors">
<div className="flex items-center gap-3">
<span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[16px]">album</span>
</span>
<div>
<span className="font-body-md text-body-md font-semibold text-on-surface">Brake rotor</span>
<span className="text-on-surface-variant font-body-sm text-body-sm ml-1.5">— also called brake disc</span>
</div>
</div>
<div className="flex items-center gap-2">
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">Braking System</span>
<span className="material-symbols-outlined text-[16px] text-surface-dim">north_east</span>
</div>
</div>
</div>
</div>
</div>

<section className="space-y-4 pt-4">
<div className="flex items-center justify-between">
<div>
<h2 className="font-headline-sm text-headline-sm text-on-surface">Common parts</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant">Frequently ordered items for routine Kingston fleet depot turnaround.</p>
</div>
<span className="font-label-code text-caption text-secondary uppercase">Rapid Pick</span>
</div>
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative overflow-hidden">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">oil_barrel</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">2 in stock</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Oil filter</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">Spin-on cartridge</div>
</div>
</div>

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">air</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed-variant font-medium">Due soon</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Air filter</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">Engine intake panel</div>
</div>
</div>

<div className="group bg-primary text-on-primary p-4 rounded-xl cursor-pointer shadow-md transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-surface-bright">emergency_heat</span>
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-lowest text-primary font-bold">Selected</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-bold text-on-primary leading-snug">Brake pads</div>
<div className="font-caption text-caption text-surface-variant mt-0.5">Ceramic / Semi-metallic</div>
</div>
</div>

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">cleaning_services</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">Front 26"+14"</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Wiper blades</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">All-weather aero beam</div>
</div>
</div>

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">battery_charging_full</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">34B19L AGM</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Battery (12V Aux)</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">Starter / hybrid control</div>
</div>
</div>

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">electric_bolt</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">4 req.</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Spark plugs</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">Iridium long life (100k)</div>
</div>
</div>

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">hvac</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">Carbon</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Cabin A/C filter</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">Glovebox HVAC element</div>
</div>
</div>

<div className="group bg-surface-container-lowest hover:bg-surface-container p-4 rounded-xl cursor-pointer shadow-sm transition-all flex flex-col justify-between h-28 relative">
<div className="flex items-start justify-between">
<span className="material-symbols-outlined text-[24px] text-on-surface-variant group-hover:text-primary transition-colors">lightbulb</span>
<span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant">LED / H4</span>
</div>
<div>
<div className="font-headline-sm text-[15px] font-semibold text-on-surface group-hover:text-primary leading-snug">Headlight bulb</div>
<div className="font-caption text-caption text-on-surface-variant mt-0.5">High/low beam capsule</div>
</div>
</div>
</div>
</section>

<section className="space-y-4">
<div className="flex items-center justify-between">
<div>
<h2 className="font-headline-sm text-headline-sm text-on-surface">By area</h2>
<p className="font-body-sm text-body-sm text-on-surface-variant">Full schematic breakdown for Honda Fit chassis GP5.</p>
</div>
<span className="font-label-code text-caption text-on-surface-variant font-medium">10 Categories Total</span>
</div>

<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">build</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Engine</p>
<p className="font-caption text-caption text-on-surface-variant">32 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">filter_alt</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Filters</p>
<p className="font-caption text-caption text-on-surface-variant">6 parts</p>
</div>
</div>

<div className="bg-primary text-on-primary p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-md transition-colors">
<span className="w-8 h-8 rounded bg-surface-container-lowest text-primary flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">emergency_heat</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-bold truncate text-on-primary">Brakes</p>
<p className="font-caption text-caption text-surface-variant">Active group (18)</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">swap_driving_apps_wheel</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Suspension &amp; steering</p>
<p className="font-caption text-caption text-on-surface-variant">14 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">visibility</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Lights &amp; visibility</p>
<p className="font-caption text-caption text-on-surface-variant">12 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">mode_fan</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Cooling</p>
<p className="font-caption text-caption text-on-surface-variant">8 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">bolt</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Battery &amp; electrical</p>
<p className="font-caption text-caption text-on-surface-variant">22 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">ac_unit</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">A/C</p>
<p className="font-caption text-caption text-on-surface-variant">9 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">settings_input_component</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Transmission</p>
<p className="font-caption text-caption text-on-surface-variant">7 parts</p>
</div>
</div>

<div className="bg-surface-container-lowest hover:bg-surface-container p-3 rounded-lg cursor-pointer flex items-center gap-3 shadow-xs transition-colors">
<span className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface shrink-0">
<span className="material-symbols-outlined text-[18px]">tire_repair</span>
</span>
<div className="min-w-0">
<p className="font-body-sm text-body-sm font-semibold truncate text-on-surface">Tyres &amp; wheels</p>
<p className="font-caption text-caption text-on-surface-variant">11 parts</p>
</div>
</div>
</div>

<div className="bg-surface-container-low p-4 rounded-xl shadow-xs">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-surface-container">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-[18px] text-on-surface">subdirectory_arrow_right</span>
<span className="font-body-md text-body-md font-semibold text-on-surface">Braking Subcategories (GP5 Chassis)</span>
<span className="font-label-code text-caption text-secondary">5 items</span>
</div>
<span className="font-caption text-caption text-on-surface-variant">Click chip to change or select multiple</span>
</div>
<div className="flex flex-wrap items-center gap-2">

<button className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold shadow-xs">
<span className="material-symbols-outlined text-[16px]">check</span>
<span>Brake pads</span>
<span className="font-label-code text-caption opacity-80">(Selected)</span>
</button>

<button className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm transition-colors shadow-xs">
<span>Brake rotor</span>
<span className="font-label-code text-caption text-on-surface-variant">J$ 6,800</span>
</button>

<button className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm transition-colors shadow-xs">
<span>Brake fluid</span>
<span className="font-label-code text-caption text-on-surface-variant">DOT 4</span>
</button>

<button className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm transition-colors shadow-xs">
<span>Brake caliper</span>
<span className="font-label-code text-caption text-on-surface-variant">L/R</span>
</button>

<button className="flex items-center gap-2 px-3.5 py-1.5 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm transition-colors shadow-xs">
<span>Brake shoes / drums</span>
<span className="font-label-code text-caption text-on-surface-variant">Rear</span>
</button>
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

<div className="rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden">
<button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors">
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">volume_up</span>
</span>
<div>
<span className="font-headline-sm text-[16px] text-on-surface font-semibold">Squeaks or grinds when I brake</span>
<span className="hidden md:inline-block ml-3 font-caption text-caption text-on-surface-variant">Audible indicator flag · Front wheels typical</span>
</div>
</div>
<span className="material-symbols-outlined text-[20px] text-on-surface rotate-180 transition-transform">expand_more</span>
</button>

<div className="px-5 pb-5 pt-1 space-y-4 bg-surface-container-lowest">

<div className="bg-surface-container-low p-4 rounded-lg flex items-start gap-3">
<span className="material-symbols-outlined text-[20px] text-on-surface mt-0.5 shrink-0">info</span>
<div>
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Telemetry &amp; Mechanical Assessment:</span>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Usually worn brake pads. Metal-on-metal squealing indicates pads have reached the built-in acoustic wear indicator strip. Continued friction without pad material will groove and ruin the brake rotor disc.
                </p>
</div>
</div>

<div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">

<div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex flex-col justify-between gap-4">
<div>
<div className="flex items-center justify-between mb-2">
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-primary text-on-primary font-bold">High probability (94%)</span>
<span className="font-label-code text-caption text-on-surface-variant">Front Set</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">Brake pads — most likely</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Direct OEM replacement friction pads compatible with GP5 hybrid brake recovery regeneration calipers.
                  </p>
</div>
<div className="flex items-center justify-between pt-2">
<div className="font-label-price text-label-price text-on-surface">J$ 4,850 <span className="font-body-sm text-caption text-on-surface-variant font-normal">landed</span></div>
<button className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary hover:opacity-90 font-body-sm text-body-sm font-medium flex items-center gap-1 transition-opacity">
<span>Select Brake pads</span>
<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>
</div>

<div className="bg-surface-container-lowest p-4 rounded-xl shadow-xs flex flex-col justify-between gap-4">
<div>
<div className="flex items-center justify-between mb-2">
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-medium">Inspect for scoring</span>
<span className="font-label-code text-caption text-on-surface-variant">Pair disc</span>
</div>
<h3 className="font-headline-sm text-headline-sm text-on-surface">Brake rotor</h3>
<p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Vented front rotor disk (262mm diameter). Required if pulsation occurs or metal backing scored the contact face.
                  </p>
</div>
<div className="flex items-center justify-between pt-2">
<div className="font-label-price text-label-price text-on-surface">J$ 6,800 <span className="font-body-sm text-caption text-on-surface-variant font-normal">pair</span></div>
<button className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-1 transition-colors">
<span>Add Rotor to check</span>
<span className="material-symbols-outlined text-[16px]">add</span>
</button>
</div>
</div>
</div>
</div>
</div>

<div className="rounded-xl bg-surface-container-lowest shadow-xs overflow-hidden">
<button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors">
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">power_off</span>
</span>
<span className="font-headline-sm text-[15px] text-on-surface font-semibold">Car won't start, or clicks</span>
</div>
<span className="material-symbols-outlined text-[20px] text-on-surface-variant">expand_more</span>
</button>
</div>

<div className="rounded-xl bg-surface-container-lowest shadow-xs overflow-hidden">
<button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors">
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">warning</span>
</span>
<span className="font-headline-sm text-[15px] text-on-surface font-semibold">Engine light is on</span>
</div>
<span className="material-symbols-outlined text-[20px] text-on-surface-variant">expand_more</span>
</button>
</div>

<div className="rounded-xl bg-surface-container-lowest shadow-xs overflow-hidden">
<button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors">
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">device_thermostat</span>
</span>
<span className="font-headline-sm text-[15px] text-on-surface font-semibold">Engine running hot</span>
</div>
<span className="material-symbols-outlined text-[20px] text-on-surface-variant">expand_more</span>
</button>
</div>

<div className="rounded-xl bg-surface-container-lowest shadow-xs overflow-hidden">
<button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors">
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">airwave</span>
</span>
<span className="font-headline-sm text-[15px] text-on-surface font-semibold">A/C smells or blows weak</span>
</div>
<span className="material-symbols-outlined text-[20px] text-on-surface-variant">expand_more</span>
</button>
</div>

<div className="rounded-xl bg-surface-container-lowest shadow-xs overflow-hidden">
<button className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors">
<div className="flex items-center gap-3">
<span className="w-8 h-8 rounded-full bg-surface-container text-on-surface flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-[18px]">light_group</span>
</span>
<span className="font-headline-sm text-[15px] text-on-surface font-semibold">A light is out</span>
</div>
<span className="material-symbols-outlined text-[20px] text-on-surface-variant">expand_more</span>
</button>
</div>
</div>
</section>

<div className="pt-6 pb-12 flex flex-col md:flex-row items-center justify-between gap-4">
<button className="w-full md:w-auto px-4 py-2.5 rounded-lg text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 transition-colors">
<span className="material-symbols-outlined text-[18px]">arrow_back</span>
<span>Back to car selection</span>
</button>
<div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
<button className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors text-center shadow-xs">
          Skip — show everything for this car (142 parts) →
        </button>
<button className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-primary hover:bg-on-surface text-on-primary font-body-md text-body-md font-semibold flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]">
<span>Continue to Position &amp; Fit</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>
</div>
</div>
</div>
</div></main>
    </div>
  );
}
