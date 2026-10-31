import type { ReactNode } from "react";
import type { Fp6ViewModel } from "../findPartsViewModels";

export type Fp6Actions = {
  onClose: () => void;
  onPingRfq: () => void;
  onAddToOrder: () => void;
  onAddToStock: () => void;
  onUseInService: () => void;
  onCopyCrossRef: (partNumber: string) => void;
  children?: ReactNode;
};

export function Fp6Screen({ actions, data }: { actions: Fp6Actions; data: Fp6ViewModel }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="max-w-[1440px] mx-auto px-margin-desktop py-space-xl"><div className="flex flex-col w-full relative">

<div className="w-full flex flex-col gap-space-xl opacity-45 pointer-events-none select-none filter blur-[0.5px]">

<div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
<div className="flex flex-col gap-space-xs">
<div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
<span>FLEET INVENTORY</span>
<span>/</span>
<span>VEHICLE TELEMETRY</span>
<span>/</span>
<span className="text-on-surface font-semibold">{data.plate} (TOYOTA PROBOX HYBRID)</span>
</div>
<div className="flex items-center gap-space-md">
<h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Parts Compatibility Index</h1>
<span className="px-space-sm py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">REG: KGN-1505-LM</span>
<span className="px-space-sm py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">VIN: {data.vinLabel}</span>
</div>
</div>
<div className="flex items-center gap-space-sm">
<div className="px-space-md py-1.5 rounded-lg bg-surface-container-lowest shadow-sm flex items-center gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-secondary">tune</span>
<span className="font-body-sm text-body-sm font-medium">Filter Engine: 1NZ-FXE 1.5L</span>
</div>
<div className="px-space-md py-1.5 rounded-lg bg-surface-container-lowest shadow-sm flex items-center gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-secondary">warehouse</span>
<span className="font-body-sm text-body-sm font-medium">{data.hubLabel} Central Bin A-14</span>
</div>
</div>
</div>

<div className="grid grid-cols-1 md:grid-cols-4 gap-space-md">
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
<span className="font-caption text-caption text-secondary uppercase tracking-wider">Assigned Chassis</span>
<span className="font-label-plate text-label-plate text-on-surface">1505 LM · PROBOX</span>
<span className="font-caption text-caption text-secondary">Odometer: {data.odometerLabel}</span>
</div>
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
<span className="font-caption text-caption text-secondary uppercase tracking-wider">Maintenance Due</span>
<div className="flex items-center gap-space-xs">
<span className="w-2 h-2 rounded-full bg-on-tertiary-container"></span>
<span className="font-body-md text-body-md font-semibold text-on-surface">Oil &amp; Filter Exchange</span>
</div>
<span className="font-caption text-caption text-secondary font-label-code">Remaining: -340 km (Overdue)</span>
</div>
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
<span className="font-caption text-caption text-secondary uppercase tracking-wider">Local Hub Stock</span>
<span className="font-headline-sm text-headline-sm text-on-surface">14 Items Verified</span>
<span className="font-caption text-caption text-secondary">{data.hubLabel} hub Priority Rack</span>
</div>
<div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-xs">
<span className="font-caption text-caption text-secondary uppercase tracking-wider">Supplier Coverage</span>
<span className="font-headline-sm text-headline-sm text-on-surface">4 Approved Vendors</span>
<span className="font-caption text-caption text-secondary">Avg. Dispatch: 3.2 hrs</span>
</div>
</div>

<div className="rounded-xl bg-surface-container-lowest shadow-sm p-space-lg flex flex-col gap-space-lg">
<div className="flex items-center justify-between">
<div className="flex items-center gap-space-md">
<span className="font-headline-sm text-headline-sm text-on-surface">Recommended Service Parts</span>
<span className="px-2 py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">Tier 1 OEM Preferred</span>
</div>
<div className="flex items-center gap-space-sm text-secondary font-caption text-caption">
<span className="material-symbols-outlined text-[16px]">verified</span>
<span>Cross-checked against Jamaica Fleet Registry {data.vinLabel} Specs</span>
</div>
</div>

<div className="space-y-space-sm">
{data.recommendedShelfCounts.map((row, index) => (
<div key={`${row.partNumber}-${index}`} className={`p-space-md rounded-lg flex items-center justify-between ${index === 0 ? "bg-surface-container-high/40" : "bg-surface-container-lowest"}`}>
<div className="flex items-center gap-space-md">
<div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center">
<span className="material-symbols-outlined text-secondary">filter_alt</span>
</div>
<div>
<div className="font-label-code text-label-code font-bold text-on-surface">{row.partNumber}</div>
<div className="font-body-sm text-body-sm text-secondary">{row.description}</div>
</div>
</div>
<div className="flex items-center gap-space-lg">
<span className="font-label-price text-label-price text-on-surface font-semibold">{row.priceLabel}</span>
<span className="px-2 py-1 rounded bg-surface-container font-caption text-caption font-semibold text-secondary">{row.shelfCountLabel}</span>
</div>
</div>
))}
</div>
</div>
</div>

<button type="button" aria-label="Close drawer backdrop" className="fixed inset-0 z-40 bg-primary/45 backdrop-blur-[1px] transition-opacity duration-300" id="drawer-backdrop" onClick={actions.onClose}></button>

<aside aria-labelledby="drawer-part-title" aria-modal="true" className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[520px] bg-surface-container-lowest shadow-2xl flex flex-col justify-between overflow-hidden transform translate-x-0 transition-transform duration-300 ease-out" id="part-detail-drawer" role="dialog">

<header className="p-space-xl bg-surface-container-lowest shrink-0 shadow-sm z-10 flex flex-col gap-space-sm">

<div className="flex items-center justify-between">
<div className="flex items-center gap-space-xs font-label-code text-caption uppercase tracking-wider text-secondary">
<span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
<span>Parts Inventory / Oil Filter</span>
</div>
<button type="button" aria-label="Close drawer" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container flex items-center justify-center text-on-surface transition-colors" onClick={actions.onClose}>
<span className="material-symbols-outlined text-[20px]">close</span>
</button>
</div>

<div className="flex flex-col gap-0.5">
<h2 className="font-label-code text-headline-lg font-bold text-on-surface tracking-tight" id="drawer-part-title">{data.brandLabel} {data.partNumber}</h2>
<p className="font-body-sm text-body-sm text-secondary">{data.descriptionLine}</p>
</div>

<div className="flex flex-wrap items-center gap-space-xs pt-1">
<span className="inline-flex items-center gap-1 px-space-sm py-1 rounded bg-secondary-fixed text-on-secondary-fixed font-caption text-caption font-semibold">
<span className="material-symbols-outlined text-[13px]">directions_car</span>
<span>Made for your car · OEM</span>
</span>
<span className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded bg-surface-container text-on-surface font-caption text-caption font-semibold">
<span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
<span>Verified</span>
</span>
<span className="inline-flex items-center gap-1 px-space-sm py-1 rounded bg-primary-container text-on-primary font-label-code text-caption font-semibold">
<span className="material-symbols-outlined text-[13px] text-primary-fixed">inventory_2</span>
<span>On your shelf — 2 ({data.hubLabel} hub)</span>
</span>
</div>
</header>

<div className="flex-1 overflow-y-auto px-5 py-space-xl flex flex-col gap-space-xl bg-surface-container-lowest">

<div className="w-full rounded-xl bg-surface-container-low p-space-md flex items-center gap-space-md">
<div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-surface-container">
<img className="w-full h-full object-cover" data-alt="High precision studio product macro photo of an authentic OEM oil filter cartridge with pleated yellow-brown cellulose media, black rubber O-ring seal, and plastic bypass seating valve cleanly lit in technical commercial lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCcKdlTSrUud9a36Z0uHxAU610jD_I9V1UE_1kSW9B9kZaDUrzJ_pbYjYr5rgrHjqNshuKxO3fC002mpxc_ncgwV9gzOHUtAFQeY8uWBakENt0aYi7jkqgqVzHqQx4Npqr4rVFW1gN88VKN6W_NWf29saue51yIJtbPjFPjHhIU1oxVo3t-O4VavP0OpDSY5eQa96MmFTUhfuGYAG9SKyt48dwNAfWM5vNgvYyY97I" />
</div>
<div className="flex flex-col gap-0.5 min-w-0">
<div className="flex items-center gap-space-xs font-label-code text-caption text-secondary">
<span>MEDIA: PLEATED MICRO-FIBER</span>
<span>·</span>
<span>SPEC: 60MM OD</span>
</div>
<div className="font-body-sm text-body-sm font-semibold text-on-surface">Factory Cartridge + Nitrile Gasket Pack</div>
<div className="font-caption text-caption text-secondary">Pre-inspected batch #JA-9921 for high-efficiency hybrid cycle engines.</div>
</div>
</div>

<section className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">Why it fits this chassis</h3>
<span className="font-label-code text-caption text-on-tertiary-container font-semibold">{data.specMatchLabel}</span>
</div>
<div className="flex flex-col gap-space-xs">
<div className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">check_circle</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-medium text-on-surface">The factory part listed for this car.</span>
<span className="font-caption text-caption text-secondary">Direct cross-matched from EPC catalog for {data.vinLabel} hybrid drive.</span>
</div>
</div>
<div className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">task_alt</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-medium text-on-surface">Confirmed on 4 installs across {data.hubLabel} Roam Fleet.</span>
<span className="font-caption text-caption text-secondary">Serviced on units 1502LM, 1503LM, 1508LM, and 1511LM with optimal flow rates.</span>
</div>
</div>
<div className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm">
<span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">verified_user</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-medium text-on-surface">Zero fitment discrepancy reported since Nov 2023.</span>
<span className="font-caption text-caption text-secondary">Consistent oil pressure telemetry logged during past 18 service cycles.</span>
</div>
</div>
</div>
</section>

<section className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">Prices from suppliers</h3>
<span className="font-caption text-caption text-secondary">Updated 14:00 EST</span>
</div>
<div className="w-full rounded-xl bg-surface-container-low overflow-hidden">
<div className="grid grid-cols-12 px-space-md py-2 text-secondary font-caption text-caption uppercase tracking-wider bg-surface-container">
<span className="col-span-4">Supplier</span>
<span className="col-span-2 text-right">Raw</span>
<span className="col-span-3 text-right">Landed (J$)</span>
<span className="col-span-3 text-right">Lead / Wty</span>
</div>

{data.offers.map((offer, index) => (
<div key={offer.id}>
{index > 0 ? <div className="w-full h-px bg-surface-container"></div> : null}
<div className={`grid grid-cols-12 px-space-md py-3 items-center hover:bg-surface-container-high/50 transition-colors ${offer.selected ? "" : "opacity-75 bg-surface-container-low"}`}>
<div className="col-span-4 flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight">{offer.supplierLabel}</span>
<div className="flex items-center gap-1 mt-0.5">
<span className={`w-1.5 h-1.5 rounded-full ${offer.selected ? "bg-on-surface" : "bg-secondary"}`}></span>
<span className="font-caption text-caption text-on-surface font-medium">{offer.selected ? "In stock" : "Overseas order"}</span>
</div>
</div>
<div className="col-span-2 text-right font-label-code text-caption text-secondary">
              {offer.priceLabel}
            </div>
<div className="col-span-3 text-right font-label-price text-label-price text-on-surface font-bold">
              {offer.priceLabel}
            </div>
<div className="col-span-3 text-right flex flex-col">
<span className="font-body-sm text-body-sm font-medium text-on-surface">{offer.leadLabel}</span>
<span className="font-caption text-caption text-secondary">{offer.selected ? "3 months" : "—"}</span>
</div>
{!offer.selected ? (
<div className="col-span-12 mt-2 pt-2 bg-surface-container-high/40 rounded p-space-sm flex items-center justify-between text-secondary">
<div className="flex items-center gap-1 font-caption text-caption">
<span className="material-symbols-outlined text-[14px] text-secondary">schedule</span>
<span>Price may be old</span>
</div>
<button type="button" className="font-label-code text-caption font-semibold cursor-pointer hover:underline text-on-surface" onClick={actions.onPingRfq}>Ping RFQ</button>
</div>
) : null}
</div>
</div>
))}
</div>
</section>

<section className="flex flex-col gap-space-sm">
<h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">Fits these engine variants</h3>
<div className="flex flex-wrap items-center gap-space-xs">
{data.variantChips.map((chip, index) => (
<div key={`${chip.label}-${index}`} className={`px-space-md py-1.5 rounded-lg flex items-center gap-space-xs ${chip.excluded ? "bg-surface-container-low/60 text-secondary opacity-60" : chip.active ? "bg-surface-container text-on-surface shadow-sm" : "bg-surface-container-low text-on-surface"}`}>
<span className="material-symbols-outlined text-[16px] font-bold">{chip.excluded ? "remove" : "check"}</span>
<span className="font-label-code text-body-sm font-semibold">{chip.label}</span>
{chip.active ? <span className="text-[10px] uppercase font-bold tracking-wider px-1 rounded bg-secondary-fixed text-on-secondary-fixed">Target</span> : null}
</div>
))}
</div>
</section>

<section className="flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">Same part, other numbers</h3>
<span className="font-caption text-caption text-secondary">Cross-reference table</span>
</div>
<div className="grid grid-cols-1 sm:grid-cols-3 gap-space-xs">

{data.crossRefRows.map((row, index) => (
<button key={`${row.partNumber}-${index}`} type="button" className="p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container flex flex-col gap-0.5 text-left transition-colors relative group" onClick={() => actions.onCopyCrossRef(row.partNumber)}>
<div className="flex items-center justify-between w-full">
<span className="font-caption text-caption text-secondary">{row.brand}</span>
<span className="material-symbols-outlined text-[14px] text-secondary group-hover:text-on-surface">content_copy</span>
</div>
<span className="font-label-code text-caption font-bold text-on-surface">{row.partNumber}</span>
<span className="text-[10px] text-secondary">{row.note}</span>
</button>
))}
</div>
</section>

<section className="flex flex-col gap-space-sm pb-space-sm">
<h3 className="font-caption text-caption font-bold uppercase tracking-wider text-secondary">You may also need for this service</h3>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">

<div className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between gap-space-sm hover:shadow-sm transition-shadow">
<div className="flex items-start gap-space-sm">
<div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-container">
<img className="w-full h-full object-cover" data-alt="High quality studio photo of genuine motor oil silver 4-liter tin can container with red accents and Japanese engineering labels on clean backdrop." src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7cZpI3Ri4h4oocGcMRK4GL4DBw1ll69GCpCK04it2S-FXWbw-dyl0koRHDSg89UPlyBs6k5SSUF3f4oCemW8-66b61Rk0AVnCHz60Vi7T0VNY7On6JqTbP8EoHM9FtLb4fcufqIEgVDigX88PCtpdI4UU-PNX0qVFdXiDrVn1gOPcWy3DTxLoOIvOkpK8tvxaKowzqTD2e5v9ZAPne580Q6u4WV7xt1uLIhMjDYo" />
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-sm text-body-sm font-semibold text-on-surface truncate">Engine oil 0W-20</span>
<span className="font-caption text-caption text-secondary truncate">Synth · 3.4 L Req.</span>
<span className="font-label-price text-caption font-bold text-on-surface mt-1">No price yet</span>
</div>
</div>
<button type="button" className="w-full py-1.5 px-space-sm rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-caption font-semibold flex items-center justify-center gap-1 shadow-sm transition-colors" onClick={actions.onAddToOrder}>
<span className="material-symbols-outlined text-[15px]">add</span>
<span>Add to order</span>
</button>
</div>

<div className="p-space-md rounded-xl bg-surface-container-low flex flex-col justify-between gap-space-sm hover:shadow-sm transition-shadow">
<div className="flex items-start gap-space-sm">
<div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-surface-container">
<img className="w-full h-full object-cover" data-alt="Close-up macro photo of a pack of metallic aluminum and fiber oil drain plug crush washers for oil pan sumps on clean surface." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBVa89_kVs9TeQLzEK8OMe3VE55mwWkupLvW08wg-5WnAv0xHGe90Jepztfj_Wt1fb0xtKQFzfRPlstXOjmRrAJ13a2jJnRY6I4la-41QXcGdNmftQI08PigE5qNiF_rq_ICZ776o-6w5zp6zw_IlGU59I7dizt9XdXPmMs_RJD-cYQrsKEd_zUuk5cQ59193-C_UC7COnHGF9e7X6ntQlVYXL7wYeRrXUYp0shz00" />
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-sm text-body-sm font-semibold text-on-surface truncate">Drain plug washer</span>
<span className="font-caption text-caption text-secondary truncate">14mm OEM crush gasket</span>
<span className="font-label-price text-caption font-bold text-on-surface mt-1">No price yet</span>
</div>
</div>
<button type="button" className="w-full py-1.5 px-space-sm rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-caption font-semibold flex items-center justify-center gap-1 shadow-sm transition-colors" onClick={actions.onAddToOrder}>
<span className="material-symbols-outlined text-[15px]">add</span>
<span>Add to order</span>
</button>
</div>
</div>
</section>
</div>

<footer className="p-space-lg bg-surface-container-lowest shadow-[0_-4px_16px_rgba(0,0,0,0.06)] shrink-0 flex flex-col gap-space-sm z-20">

<div className="flex items-center gap-space-sm">

<div className="flex items-center bg-surface-container-low rounded-lg p-0.5">
<button aria-label="Decrease quantity" className="w-8 h-8 rounded-md bg-surface-container-lowest hover:bg-surface-container flex items-center justify-center text-on-surface text-body-sm font-bold shadow-sm transition-colors">
            -
          </button>
<span className="w-10 text-center font-label-code text-body-sm font-bold text-on-surface" id="qty-val">1</span>
<button aria-label="Increase quantity" className="w-8 h-8 rounded-md bg-surface-container-lowest hover:bg-surface-container flex items-center justify-center text-on-surface text-body-sm font-bold shadow-sm transition-colors">
            +
          </button>
</div>

<button type="button" className="flex-1 py-2 px-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-1 transition-colors" onClick={actions.onAddToStock}>
<span className="material-symbols-outlined text-[18px]">add_business</span>
<span className="whitespace-nowrap">Add to stock</span>
</button>

<button type="button" className="flex-1 py-2 px-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-1 transition-colors" onClick={actions.onPingRfq}>
<span className="material-symbols-outlined text-[18px]">request_quote</span>
<span className="whitespace-nowrap">Request quote</span>
</button>
</div>

<button type="button" className="w-full py-3 px-space-lg rounded-xl bg-primary hover:bg-primary/90 text-on-primary font-body-md text-body-md font-semibold flex items-center justify-center gap-space-sm shadow-md transition-all active:scale-[0.99]" onClick={actions.onUseInService}>
<span>Use in a service log</span>
<span className="font-label-plate text-caption px-1.5 py-0.5 rounded bg-surface-container-highest/20 text-on-primary">{data.plate} PRE-FILLED</span>
<span className="material-symbols-outlined text-[18px]">arrow_forward</span>
</button>

<div className="flex items-center justify-between text-[11px] font-caption text-secondary px-1 pt-0.5">
<span className="flex items-center gap-1">
<span className="w-1.5 h-1.5 rounded-full bg-on-surface"></span>
<span>{data.hubLabel} hub Automated Allocation</span>
</span>
<span className="font-label-code">ROAM-FLT-LOG-V6</span>
</div>
</footer>
</aside>

<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-space-lg py-2.5 rounded-lg bg-inverse-surface text-inverse-on-surface font-body-sm text-body-sm shadow-xl flex items-center gap-space-sm opacity-0 pointer-events-none transition-opacity duration-200" id="toast-notify">
<span className="material-symbols-outlined text-[18px] text-on-tertiary">check_circle</span>
<span id="toast-text">Action recorded in telemetry stream</span>
</div>
</div>
</div></div>
    </div>
  );
}
