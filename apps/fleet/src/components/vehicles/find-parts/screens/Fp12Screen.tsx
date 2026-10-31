import type { Fp5Actions } from "./Fp5Screen";
import type { Fp12ViewModel } from "../findPartsViewModels";

export function Fp12Screen({ actions, data, partName }: { actions: Fp5Actions; data: Fp12ViewModel; partName?: string }) {
  const title = partName || data.componentTitle || "Part";
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="flex flex-col w-full pb-28">

<div className="px-margin pt-space-xs pb-space-sm overflow-x-auto [scrollbar-width:none] flex items-center gap-space-xs bg-surface-container-low/80 backdrop-blur-md sticky top-0 z-20">
<button type="button" className="flex items-center gap-space-xs px-space-md py-space-xs rounded-xl bg-surface-container-lowest text-on-surface-variant hover:text-on-surface whitespace-nowrap shadow-sm text-body-sm font-body-sm transition-colors" onClick={actions.onNavigateVehicles}>
<span className="material-symbols-outlined text-[18px]">directions_car</span>
<span>By vehicle</span>
</button>
<button type="button" className="flex items-center gap-space-xs px-space-md py-space-xs rounded-xl bg-surface-container-lowest text-on-surface-variant hover:text-on-surface whitespace-nowrap shadow-sm text-body-sm font-body-sm transition-colors" onClick={actions.onNavigateLedger}>
<span className="material-symbols-outlined text-[18px]">history_edu</span>
<span>Service ledger</span>
</button>
<button type="button" className="flex items-center gap-space-xs px-space-md py-space-xs rounded-xl bg-primary text-on-primary whitespace-nowrap shadow-sm text-body-sm font-body-sm font-medium" onClick={actions.onNavigateFindParts}>
<span className="material-symbols-outlined text-[18px]">inventory_2</span>
<span>Find parts</span>
</button>
</div>

<section className="px-margin py-space-xs overflow-x-auto [scrollbar-width:none] flex items-center gap-space-xs bg-surface-container-lowest shadow-sm z-10">
<button type="button" className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-fixed text-caption font-caption whitespace-nowrap active:scale-95 transition-transform" onClick={actions.onChangeCar}>
<span className="font-label-plate text-caption tracking-wider">{data.plate}</span>
<span className="text-on-secondary-container truncate max-w-[110px]">{data.fitYearLabel}</span>
<span className="material-symbols-outlined text-[12px] opacity-70">edit</span>
</button>
<span className="text-on-surface-variant/40 text-caption">/</span>
<span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-caption font-caption whitespace-nowrap">
      1.5 hybrid ({data.trimLabel})
    </span>
<span className="text-on-surface-variant/40 text-caption">/</span>
<span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-caption font-caption whitespace-nowrap">
      Oil & Filters
    </span>
<span className="text-on-surface-variant/40 text-caption">/</span>
<span className="px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-caption font-caption font-semibold whitespace-nowrap">
      Cartridge Filter
    </span>
</section>

<header className="px-margin pt-space-lg pb-space-sm flex flex-col gap-1">
<div className="flex items-center justify-between">
<h2 className="font-headline-sm text-headline-sm text-on-surface">{title} for {data.vehicleLabel}</h2>
<span className="material-symbols-outlined text-on-surface-variant text-[20px]">tune</span>
</div>
<div className="flex items-center gap-2">
<span className="inline-flex items-center gap-1 font-caption text-caption text-on-surface-variant">
<span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
        {data.trimLabel || "None yet"}
      </span>
<span className="text-on-surface-variant/40 text-caption">•</span>
<span className="font-label-code text-caption text-on-surface-variant flex items-center gap-1">
<span className="material-symbols-outlined text-[14px]">warehouse</span>
        {data.hubLabel} hub stock
      </span>
</div>
</header>

<section className="px-margin my-space-sm">
<div className="relative bg-primary text-on-primary rounded-xl p-space-lg shadow-md overflow-hidden flex flex-col gap-space-md">

<div className="absolute -top-12 -right-12 w-40 h-40 bg-surface-container-lowest/5 rounded-full blur-2xl pointer-events-none"></div>

<div className="flex items-center justify-between">
<div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-container-lowest/15 text-primary-fixed text-caption font-caption tracking-wide uppercase">
<span className="material-symbols-outlined text-[14px]">stars</span>
<span>Best Fitment Match</span>
</div>
<button aria-label="Favorite part" type="button" className="text-on-primary/70 hover:text-on-primary" onClick={actions.onSaveQuery}>
<span className="material-symbols-outlined text-[20px]">bookmark_border</span>
</button>
</div>

<div className="flex flex-col gap-1">
<div className="font-label-code text-caption text-secondary-fixed tracking-wider">GENUINE OEM SPEC</div>
<h3 className="font-headline-sm text-headline-sm text-on-primary leading-snug">{data.brandLabel} {data.partNumber}</h3>
<p className="font-body-sm text-body-sm text-surface-container-high/90">Premium Pleated Cartridge Oil Filter with O-Ring Seal</p>
</div>

<div className="flex flex-wrap items-center gap-1.5">
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary-fixed text-on-secondary-fixed font-caption text-caption font-semibold">
<span className="material-symbols-outlined text-[13px]">verified</span>
          Verified Fit
        </span>
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-tertiary-fixed text-on-tertiary-fixed font-caption text-caption font-medium">
<span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
          Shelf: {data.shelfSummary}
        </span>
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-container-highest/20 text-on-primary font-caption text-caption">
          hub Bay 4C
        </span>
</div>

<div className="pt-space-xs flex flex-col gap-1">
<div className="flex items-baseline justify-between">
<span className="font-label-price text-headline-sm text-on-primary">{data.priceLabel} <span className="font-body-sm text-caption text-surface-container-high font-normal">landed</span></span>
<span className="font-caption text-caption text-tertiary-fixed flex items-center gap-0.5">
<span className="material-symbols-outlined text-[14px]">local_shipping</span>
            Ready today
          </span>
</div>
<span className="font-caption text-caption text-surface-container-high/80">{data.hubLabel} Auto Parts Depot • Bin #09-A</span>
</div>

<div className="flex flex-col gap-2 pt-space-xs">
<button type="button" className="w-full h-11 bg-surface-container-lowest text-primary rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 hover:bg-surface-container active:scale-[0.99] transition-transform shadow-sm" id="use-service-btn" onClick={actions.onUseInService}>
<span className="material-symbols-outlined text-[18px]">build_circle</span>
<span>Use in service log</span>
</button>
<div className="grid grid-cols-2 gap-2">
<button type="button" className="h-10 bg-surface-container-highest/20 text-on-primary rounded-lg font-body-sm text-body-sm flex items-center justify-center gap-1.5 hover:bg-surface-container-highest/30 active:scale-[0.99] transition-transform" id="open-quote-drawer" onClick={actions.onOpenQuickRfq ?? actions.onQuote}>
<span className="material-symbols-outlined text-[16px]">request_quote</span>
<span>Request quote</span>
</button>
<button type="button" className="h-10 bg-surface-container-highest/20 text-on-primary rounded-lg font-body-sm text-body-sm flex items-center justify-center gap-1.5 hover:bg-surface-container-highest/30 active:scale-[0.99] transition-transform" id="view-spec-details" onClick={actions.onOpenBest}>
<span className="material-symbols-outlined text-[16px]">info</span>
<span>Fitment spec</span>
</button>
</div>
</div>
</div>
</section>

<section className="px-margin flex flex-col gap-space-md mt-space-sm">
<div className="flex items-center justify-between">
<span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Tier Compatibility</span>
<span className="font-label-code text-caption text-on-surface-variant">{data.matchCount} results sorted</span>
</div>

<div className="flex flex-col gap-space-md">
{data.rows.map((row, index) => (
<div key={row.id} className="flex flex-col gap-1.5">
<div className="flex items-center gap-1.5 text-caption font-caption text-on-surface font-semibold">
<span className={`w-2 h-2 rounded-full ${index === 0 ? "bg-primary" : index === 1 ? "bg-secondary" : "bg-surface-tint"}`}></span>
<span>{row.tierLabel}</span>
</div>
<button
  type="button"
  className="relative bg-surface-container-lowest rounded-xl p-space-md shadow-sm overflow-hidden flex items-center justify-between active:bg-surface-container-low transition-colors cursor-pointer w-full text-left"
  onClick={() => actions.onOpenRow(row.id)}
>
<div className={`absolute left-0 top-0 bottom-0 w-1 ${index === 0 ? "bg-primary" : index === 1 ? "bg-secondary" : "bg-surface-tint"}`}></div>
<div className="flex flex-col gap-1 pl-2">
<div className="flex items-center gap-1.5">
<span className="font-body-md text-body-md font-semibold text-on-surface">{row.partName}</span>
<span className="font-label-code text-caption text-on-surface-variant">{row.brandLabel} {data.partNumber}</span>
</div>
<div className="flex items-center gap-2">
<span className="font-label-price text-body-md text-on-surface">{row.priceLabel} <span className="text-caption text-on-surface-variant font-normal">landed</span></span>
<span className="px-1.5 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed text-caption font-caption font-medium">{row.stockLabel}</span>
</div>
<div className="flex items-center gap-1 font-caption text-caption text-on-surface-variant">
<span className="material-symbols-outlined text-[14px] text-primary">verified</span>
<span>{row.matchPercent} · {row.supplierLabel}</span>
</div>
</div>
<div className="flex items-center text-on-surface-variant">
<span className="material-symbols-outlined text-[20px]">chevron_right</span>
</div>
</button>
</div>
))}
</div>
</section>

<section className="px-margin my-space-md">
<div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
<button type="button" className="w-full p-space-md flex items-center justify-between text-left hover:bg-surface-container-low transition-colors" id="toggle-activity" onClick={actions.onToggleActivity}>
<div className="flex items-center gap-space-sm">
<div className="w-8 h-8 rounded-lg bg-secondary-container flex items-center justify-center text-on-secondary-fixed">
<span className="material-symbols-outlined text-[18px]">receipt_long</span>
</div>
<div className="flex flex-col">
<span className="font-body-md text-body-md font-semibold text-on-surface">Your Parts Activity</span>
<span className="font-caption text-caption text-on-surface-variant">1 open request • 1 alert • Core J$ 0</span>
</div>
</div>
<span className={`material-symbols-outlined text-on-surface-variant transition-transform${actions.activityOpen ? " rotate-180" : ""}`} id="activity-icon">expand_more</span>
</button>

<div className={`${actions.activityOpen ? "flex" : "hidden"} px-space-md pb-space-md flex-col gap-2 pt-space-xs`} id="activity-content">
<div className="p-2.5 rounded-lg bg-surface-container-low flex items-center justify-between">
<div className="flex flex-col">
<span className="font-caption text-caption font-medium text-on-surface">RFQ #KGN-8842 • Front Discs</span>
<span className="font-caption text-caption text-on-surface-variant">Awaiting response from {data.hubLabel} Depot</span>
</div>
<span className="px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant text-caption font-caption">Pending</span>
</div>
<div className="p-2.5 rounded-lg bg-tertiary-fixed/30 flex items-center justify-between">
<div className="flex flex-col">
<span className="font-caption text-caption font-semibold text-on-tertiary-container">Repeat Part Notice</span>
<span className="font-caption text-caption text-on-surface-variant">Replaced 32 days ago on {data.plate} ({data.trimLabel})</span>
</div>
<span className="material-symbols-outlined text-[18px] text-on-tertiary-container">info</span>
</div>
</div>
</div>
</section>

<section className="px-margin mb-space-lg flex flex-col gap-space-sm">
<div className="flex items-center justify-between">
<span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Explore System Categories</span>
<span className="font-caption text-caption text-primary cursor-pointer" role="button" tabIndex={0} onClick={actions.onEditPartCategory} onKeyDown={(e) => { if (e.key === "Enter") actions.onEditPartCategory(); }}>View schematic</span>
</div>
<div className="grid grid-cols-2 gap-space-sm">

<div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-sm active:bg-surface-container-low transition-colors cursor-pointer" role="button" tabIndex={0} onClick={actions.onBackToPartSelection} onKeyDown={(e) => { if (e.key === "Enter") actions.onBackToPartSelection(); }}>
<div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[20px]">engineering</span>
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">Engine</span>
<span className="font-caption text-caption text-on-surface-variant">14 components</span>
</div>
</div>

<div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-sm active:bg-surface-container-low transition-colors cursor-pointer" role="button" tabIndex={0} onClick={actions.onBackToPartSelection} onKeyDown={(e) => { if (e.key === "Enter") actions.onBackToPartSelection(); }}>
<div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[20px]">filter_alt</span>
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">Filters</span>
<span className="font-caption text-caption text-on-surface-variant">3 in stock</span>
</div>
</div>

<div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-sm active:bg-surface-container-low transition-colors cursor-pointer" role="button" tabIndex={0} onClick={actions.onBackToPartSelection} onKeyDown={(e) => { if (e.key === "Enter") actions.onBackToPartSelection(); }}>
<div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[20px]">car_crash</span>
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">Brakes</span>
<span className="font-caption text-caption text-on-surface-variant">Pads, Rotors</span>
</div>
</div>

<div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-sm active:bg-surface-container-low transition-colors cursor-pointer" role="button" tabIndex={0} onClick={actions.onBackToPartSelection} onKeyDown={(e) => { if (e.key === "Enter") actions.onBackToPartSelection(); }}>
<div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[20px]">airline_seat_recline_extra</span>
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">Suspension</span>
<span className="font-caption text-caption text-on-surface-variant">Bushings, Struts</span>
</div>
</div>

<div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-sm active:bg-surface-container-low transition-colors cursor-pointer" role="button" tabIndex={0} onClick={actions.onBackToPartSelection} onKeyDown={(e) => { if (e.key === "Enter") actions.onBackToPartSelection(); }}>
<div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[20px]">bolt</span>
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">Electrical</span>
<span className="font-caption text-caption text-on-surface-variant">12V & HV Relays</span>
</div>
</div>

<div className="p-space-md bg-surface-container-lowest rounded-xl shadow-sm flex items-center gap-space-sm active:bg-surface-container-low transition-colors cursor-pointer" role="button" tabIndex={0} onClick={actions.onBackToPartSelection} onKeyDown={(e) => { if (e.key === "Enter") actions.onBackToPartSelection(); }}>
<div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
<span className="material-symbols-outlined text-[20px]">ac_unit</span>
</div>
<div className="flex flex-col min-w-0">
<span className="font-body-md text-body-md font-semibold text-on-surface truncate">A/C Cabin</span>
<span className="font-caption text-caption text-on-surface-variant">Dryers & Condensers</span>
</div>
</div>
</div>
</section>

<div className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out max-w-md mx-auto${actions.quoteOpen ? " translate-y-0" : " translate-y-full"}`} id="quote-drawer-sheet">
<div className="bg-surface-container-lowest rounded-t-2xl shadow-2xl p-space-lg flex flex-col gap-space-md pb-safe">
<div className="w-12 h-1.5 bg-surface-container-highest rounded-full mx-auto"></div>
<div className="flex items-center justify-between pb-space-xs">
<div className="flex items-center gap-2">
<button type="button" className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface" id="close-quote-drawer" onClick={actions.onCloseQuickRfq}>
<span className="material-symbols-outlined text-[18px]">close</span>
</button>
<h4 className="font-headline-sm text-headline-sm text-on-surface">Quick RFQ Inquiry</h4>
</div>
<span className="font-label-code text-caption text-on-surface-variant">{data.hubLabel} Depot</span>
</div>
<div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Part item requested:</span>
<span className="font-label-code text-body-sm text-on-surface-variant">{data.brandLabel} {data.partNumber} (Oil Filter Cartridge)</span>
<span className="font-caption text-caption text-secondary">Target delivery: {data.hubLabel} hub (Within 24h)</span>
</div>
<div className="flex flex-col gap-1">
<label className="font-caption text-caption text-on-surface-variant font-medium">Quantity needed:</label>
<div className="flex items-center gap-3">
<button type="button" className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface font-bold" onClick={actions.onDecQuickRfqQty}>-</button>
<span className="font-label-code text-body-lg font-semibold text-on-surface">{actions.quickRfqQty ?? 2}</span>
<button type="button" className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface font-bold" onClick={actions.onIncQuickRfqQty}>+</button>
</div>
</div>
<button type="button" className="w-full h-11 bg-primary text-on-primary rounded-lg font-body-sm text-body-sm font-semibold flex items-center justify-center gap-2 shadow-sm" onClick={actions.onSendQuickRfq}>
<span className="material-symbols-outlined text-[18px]">send</span>
<span>Broadcast RFQ to 3 Suppliers</span>
</button>
</div>
</div>

<div className={`fixed inset-0 bg-primary/40 backdrop-blur-xs z-40 transition-opacity duration-300${actions.quoteOpen ? " opacity-100" : " opacity-0 pointer-events-none"}`} id="drawer-backdrop" onClick={actions.onCloseQuickRfq} role="presentation" />

<aside className="fixed bottom-16 inset-x-0 z-30 bg-surface-container-lowest/95 backdrop-blur-md px-margin py-space-sm shadow-md">
<div className="max-w-md mx-auto flex items-center justify-between gap-space-sm">
<button type="button" className="h-11 px-4 rounded-lg bg-surface-container text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-1 active:scale-95 transition-transform" onClick={actions.onBackToPartSelection}>
<span className="material-symbols-outlined text-[18px]">arrow_back</span>
<span>Back</span>
</button>
<button type="button" className="flex-1 h-11 px-4 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center justify-between active:scale-[0.98] transition-transform shadow-sm" id="confirm-list-btn" onClick={actions.onConfirmPartsList}>
<div className="flex items-center gap-1.5">
<span className="material-symbols-outlined text-[18px]">check_circle</span>
<span>Confirm parts list ({data.filterAllCount || 1})</span>
</div>
<span className="font-label-price text-body-sm text-surface-container-lowest">{data.priceLabel}</span>
</button>
</div>
</aside>
</div>
</div>
      {/* fp-stitch-labels */}
      <section aria-label="Component index" className="flex flex-wrap gap-1 pt-space-md border-t border-surface-container-high mt-space-md">
        <span key="awaiting response from depot" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"awaiting response from depot"}</span>
        <span key="replaced 32 days ago on ( )" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"replaced 32 days ago on ( )"}</span>
        <span key="target delivery: hub #01 (within 24h)" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"target delivery: hub #01 (within 24h)"}</span>
        <span key="oil filter for" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"oil filter for"}</span>
        <span key="3 results sorted" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"3 results sorted"}</span>
        <span key="made for your car (oem) • 1 option" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"made for your car (oem) • 1 option"}</span>
        <span key="on shelf: 2" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"on shelf: 2"}</span>
        <span key="factory matched" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"factory matched"}</span>
        <span key="other brands that replace it (aftermarket) • 1 option" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"other brands that replace it (aftermarket) • 1 option"}</span>
        <span key="• 3 days dispatch" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"• 3 days dispatch"}</span>
        <span key="warning" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"warning"}</span>
        <span key="supplier price may be old (3w ago)" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"supplier price may be old (3w ago)"}</span>
        <span key="fits by size (universal fluid/part) • 1 option" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"fits by size (universal fluid/part) • 1 option"}</span>
        <span key="engine oil synthetic 0w-20" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"engine oil synthetic 0w-20"}</span>
        <span key="1 litre bottle" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"1 litre bottle"}</span>
        <span key="no price quoted yet" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"no price quoted yet"}</span>
        <span key="universal" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"universal"}</span>
        <span key="add to requisition wishlist" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"add to requisition wishlist"}</span>
        <span key="confirm parts list (1)" className="inline-flex px-2 py-0.5 rounded bg-surface-container-low font-caption text-caption text-on-surface-variant">{"confirm parts list (1)"}</span>
      </section>
      {/* /fp-stitch-labels */}

    </div>
  );
}
