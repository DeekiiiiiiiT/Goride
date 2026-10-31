/** Auto-generated from Stitch HTML — edit port script, not by hand. */
// @ts-nocheck
import type { ReactNode } from "react";

export type MarkupHandlers = {
  onFpClick?: (detail: { label?: string; card?: boolean; vehicleId?: string }, event: Event) => void;
  children?: ReactNode;
};

export function Fp8Markup({ onFpClick }: MarkupHandlers) {
  return (
    <div className="find-parts-markup-root">
<main className="w-full pt-[92px] bg-surface min-h-[calc(100vh-80px)]"><div className="flex flex-col w-full">
<div className="w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
<div className="flex flex-col gap-space-xs">
<div className="flex items-center gap-space-sm">
<div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center">
<span className="material-symbols-outlined text-[18px] text-[#f97316]">build</span>
</div>
<h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">Fleet maintenance</h1>
</div>
<p className="font-body-md text-body-md text-on-surface-variant">
          By vehicle status, the service ledger, and parts for your cars.
        </p>
</div>
<div className="flex flex-wrap items-center gap-space-sm">
<button className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors font-body-sm text-body-sm text-on-surface" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[16px]">sync</span>
<span>Refresh</span>
</button>
<button className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors font-body-sm text-body-sm text-on-surface" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[16px]">tune</span>
<span>Bootstrap schedules</span>
</button>
<button className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container-high font-body-sm text-body-sm text-on-surface font-semibold" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[16px]">verified</span>
<span>Compatible parts</span>
</button>
<button className="inline-flex items-center gap-space-xs px-space-lg py-1.5 rounded-lg bg-primary hover:bg-inverse-surface transition-all text-on-primary font-body-sm text-body-sm shadow-sm active:scale-[0.98]" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[18px]">add</span>
<span>Log new service</span>
</button>
</div>
</div>

<div className="flex items-center justify-between">
<div className="inline-flex items-center p-1 rounded-xl bg-surface-container">
<button className="px-space-lg py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
          By vehicle
        </button>
<button className="px-space-lg py-1.5 rounded-lg font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
          Service ledger
        </button>
<button className="inline-flex items-center gap-space-xs px-space-lg py-1.5 rounded-lg bg-surface-container-lowest text-on-surface font-semibold shadow-sm transition-all" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[16px]">inventory_2</span>
<span>Find parts</span>
</button>
</div>
<div className="hidden md:flex items-center gap-space-sm font-label-code text-caption text-on-surface-variant">
<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
<span>PARTS RUNNER ONLINE (KMTR-DISPATCH)</span>
</div>
</div>

<div className="w-full bg-surface-container-low rounded-xl px-space-lg py-space-sm flex flex-wrap items-center gap-space-sm">
<span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Search Scope:</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-sm">
<span>Honda Fit 2018</span>
<span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-surface cursor-pointer">edit</span>
</div>
<span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-sm">
<span>1.5 hybrid (GP5)</span>
<span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-surface cursor-pointer">edit</span>
</div>
<span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-sm">
<span>Brake pads</span>
<span className="material-symbols-outlined text-[14px] text-on-surface-variant hover:text-on-surface cursor-pointer">edit</span>
</div>
<span className="material-symbols-outlined text-outline text-[16px]">chevron_right</span>
<div className="inline-flex items-center gap-1.5 px-space-md py-1 rounded-lg bg-surface-container-highest text-on-surface font-label-code text-caption">
<span className="font-semibold">Front</span>
<span className="material-symbols-outlined text-[14px] text-on-surface cursor-pointer">close</span>
</div>
<button className="ml-auto font-caption text-caption text-on-surface-variant hover:text-on-surface underline underline-offset-2" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
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
                We don't have front brake pads for this car on file yet.
              </h2>
<p className="font-body-md text-body-md text-on-surface-variant">
                Send a request and the Roam parts team will find the right part and an exact landed price.
              </p>
</div>
</div>

<div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs">
<span className="font-caption text-caption uppercase text-on-surface-variant tracking-wider font-semibold">Matched Vehicle Specs</span>
<div className="flex flex-wrap items-center gap-space-xs">
<span className="px-space-md py-1 rounded-md bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-xs">Honda Fit 2018 (GP5, 1.5 hybrid)</span>
<span className="px-space-md py-1 rounded-md bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-xs">Brake pads</span>
<span className="px-space-md py-1 rounded-md bg-surface-container-lowest text-on-surface font-label-code text-caption shadow-xs">Front Axle</span>
<span className="px-space-md py-1 rounded-md bg-surface-container-highest text-on-surface font-label-plate text-caption">1505LM</span>
<span className="px-space-md py-1 rounded-md bg-surface-container text-on-secondary-container font-label-code text-caption">Chassis: GP5-3401928</span>
</div>
</div>

<form className="flex flex-col gap-space-lg" id="sourcing-form">
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-lg">

<div className="flex flex-col gap-space-xs">
<label className="font-caption text-caption text-on-surface uppercase tracking-wider font-semibold" htmlFor="quantity-counter">Quantity needed (axle sets)</label>
<div className="flex items-center h-10 w-fit rounded-lg bg-surface-container-low p-1">
<button className="w-8 h-8 rounded-md bg-surface-container-lowest text-on-surface font-bold flex items-center justify-center hover:bg-surface-container transition-colors shadow-xs" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[16px]">remove</span>
</button>
<span className="w-12 text-center font-label-code text-body-md text-on-surface" id="qty">1</span>
<button className="w-8 h-8 rounded-md bg-surface-container-lowest text-on-surface font-bold flex items-center justify-center hover:bg-surface-container transition-colors shadow-xs" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span className="material-symbols-outlined text-[16px]">add</span>
</button>
</div>
</div>

<div className="flex flex-col gap-space-xs">
<span className="font-caption text-caption text-on-surface uppercase tracking-wider font-semibold">Fulfillment urgency</span>
<div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-surface-container-low h-10">
<button className="urgency-btn rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors py-1 text-center" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
                    Low
                  </button>
<button className="urgency-btn rounded-md font-body-sm text-body-sm bg-surface-container-lowest text-on-surface font-semibold shadow-xs py-1 text-center" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
                    Normal
                  </button>
<button className="urgency-btn rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors py-1 text-center flex items-center justify-center gap-1" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
<span>Urgent</span>
<span className="text-[10px] px-1 py-0.5 rounded bg-error-container text-on-error-container font-label-code font-bold leading-none">24h</span>
</button>
</div>
</div>
</div>

<div className="flex flex-col gap-space-xs">
<label className="font-caption text-caption text-on-surface uppercase tracking-wider font-semibold" htmlFor="sourcing-notes">Specification or mechanic note (optional)</label>
<textarea className="w-full rounded-lg bg-surface-container-low px-space-md py-space-sm font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest shadow-inner transition-colors" id="sourcing-notes" placeholder="e.g., Need OEM or equivalent, vehicle has minor squeal on deceleration. Prefer Akebono or Nissin compound." rows="3"></textarea>
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
<input accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" type="file" />
</div>
</div>

<div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-sm">
<button className="w-full sm:w-auto font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors py-2" type="button" onClick={(e) => onFpClick?.({ label: (e.currentTarget.textContent || "").replace(/\s+/g, " ").trim() }, e.nativeEvent)}>
                ← Search a different part or return to categories
              </button>
<button className="w-full sm:w-auto inline-flex items-center justify-center gap-space-sm px-space-xl py-2.5 rounded-lg bg-primary hover:bg-inverse-surface text-on-primary font-body-md text-body-md font-semibold transition-all shadow-md active:scale-[0.98]" type="submit">
<span>Ask Roam to find it</span>
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
<span className="font-body-md text-body-md font-semibold text-emerald-900">Request dispatched to Kingston Sourcing Desk.</span>
<span className="font-caption text-caption text-emerald-700">Ticket #REQ-8849 logged. Average quote time is currently 18 minutes.</span>
</div>
</div>
<a className="font-body-sm text-body-sm text-emerald-900 font-semibold underline underline-offset-4 hover:text-emerald-700 whitespace-nowrap" href="#">
            View in activity ledger →
          </a>
</div>
</div>

<div className="lg:col-span-4 flex flex-col gap-space-lg">

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
<div className="flex items-center justify-between">
<span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Active Fleet Target</span>
<span className="font-label-plate text-label-plate px-2 py-0.5 rounded bg-surface-container text-on-surface">1505LM</span>
</div>
<div className="flex items-center gap-space-md">
<div className="w-16 h-12 rounded-lg bg-surface-container overflow-hidden shrink-0">
<img className="w-full h-full object-cover" data-alt="Compact white Japanese hatchback Honda Fit GP5 2018 model parked neatly in a modern clean fleet maintenance depot with professional daylight balanced lighting and crisp shadow detail." src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJxJOy9SusfkJckQrtXIcAKAL54B2I27bgGHFgz1-ooVThzao_g3ZAqYH4l68xSeeY1Qj6CwlZAavSZHYrQTrJmjmWhVD2YycnpKQKlvVrEgcgO0Y1m2KbQ3EIhtm4rs9rMQAf5p9Itjacemz-KTeE4AEh7lszoj1n4Ralx8mqo9ICmi4J4gb_8tM3jk1PZFp1o5HtjNuCK8Lh1eZtrhxKiz1p8eAeSPB33qzeE24" />
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">Honda Fit 2018 Hybrid</span>
<span className="font-caption text-caption text-on-surface-variant">Kingston Route Cluster 03</span>
</div>
</div>
<div className="grid grid-cols-2 gap-space-sm pt-space-xs font-label-code text-caption">
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
<span className="text-on-surface-variant">Odometer</span>
<span className="text-on-surface font-semibold">92,410 km</span>
</div>
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
<span className="text-on-surface-variant">Brake wear est.</span>
<span className="text-error font-semibold">12% left (Front)</span>
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
<span><strong>Cross-brand fitment lookup:</strong> Roam scans local bonded warehouses and Japan import manifestos for GP5 calipers.</span>
</li>
<li className="flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">payments</span>
<span><strong>Landed Price Quotes:</strong> You receive 2–3 options (OEM Honda Genuine, Nissin Heavy-Duty, and Reputable Aftermarket).</span>
</li>
<li className="flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">local_shipping</span>
<span><strong>Hub Delivery:</strong> Once approved, courier dispatches directly to Kingston Hub #01 or your dispatch garage.</span>
</li>
</ul>
<div className="p-space-md rounded-xl bg-surface-container-low flex items-center justify-between font-label-code text-caption">
<div className="flex items-center gap-2">
<span className="material-symbols-outlined text-[16px] text-on-surface">verified_user</span>
<span className="text-on-surface">Zero Fitment Error Guarantee</span>
</div>
<span className="text-on-surface-variant">100% matched</span>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Recent Sourcing Wins</span>
<span className="font-caption text-caption text-on-surface-variant">Last 48 hrs</span>
</div>
<div className="flex items-center justify-between py-1">
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Axle Bushing Kit</span>
<span className="font-caption text-caption text-on-surface-variant">Nissan AD Van 2017</span>
</div>
<span className="font-label-price text-label-price text-on-surface">J$ 6,850</span>
</div>
<div className="flex items-center justify-between py-1">
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Front Shock Absorber (L/R)</span>
<span className="font-caption text-caption text-on-surface-variant">Toyota Probox NCP160</span>
</div>
<span className="font-label-price text-label-price text-on-surface">J$ 18,200</span>
</div>
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
<span className="text-on-surface font-semibold">Jamaican Fleet Hub #01</span>
</div>
</div>
</div>

</div></main>
    </div>
  );
}
