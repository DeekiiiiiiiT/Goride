import type { ReactNode } from "react";
import type { Fp5ViewModel } from "../findPartsViewModels";
import type { ResultsFilterTab, TrimScopeTab } from "../findPartsActions";

export type Fp5Actions = {
  onAskRoam: () => void;
  onDownloadReport: () => void;
  onSaveQuery: () => void;
  onQuote: () => void;
  onUseInService: () => void;
  onOpenRow: (id: string) => void;
  onOpenBest: () => void;
  onConfirmPartsList: () => void;
  onAddToList: () => void;
  onFreshQuote: () => void;
  onBulkConsumable: () => void;
  onAllocate: () => void;
  onFilterTab: (tab: ResultsFilterTab) => void;
  onTrimScope: (scope: TrimScopeTab) => void;
  onBackToPartSelection: () => void;
  onChangeCar: () => void;
  onEditPartCategory: () => void;
  onNavigateVehicles: () => void;
  onNavigateLedger: () => void;
  onNavigateFindParts: () => void;
  onSendQuickRfq: () => void;
  expandedRowId: string | null;
  children?: ReactNode;
};

export function Fp5Screen({ actions, data, partName }: { actions: Fp5Actions; data: Fp5ViewModel; partName?: string }) {
  return (
    <div className="find-parts-screen-root">
<div className="fp-screen-root"><div className="max-w-[1440px] mx-auto px-margin-desktop py-space-xl"><div className="flex flex-col w-full">

<div className="sticky top-[92px] z-40 bg-surface-container-lowest shadow-sm rounded-lg mb-space-lg px-space-lg py-space-sm flex flex-wrap items-center justify-between gap-space-md">
<div className="flex items-center flex-wrap gap-space-sm font-label-code text-caption text-on-surface-variant">
<span className="text-secondary flex items-center gap-1">
<span className="material-symbols-outlined text-[15px]">inventory_2</span>
        Fleet Spares
      </span>
<span className="text-outline-variant">/</span>

<div className="inline-flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1 rounded text-on-surface font-label-plate text-body-sm shadow-sm group cursor-pointer hover:bg-surface-container transition-colors">
<span className="material-symbols-outlined text-secondary text-[16px]">directions_car</span>
<span>{data.vehicleLabel} · {data.plate}</span>
<span className="material-symbols-outlined text-outline text-[14px] group-hover:text-primary transition-colors ml-0.5">edit</span>
</div>
<span className="text-outline-variant">›</span>

<div className="inline-flex items-center gap-space-xs bg-secondary-container/40 px-space-sm py-1 rounded text-on-secondary-fixed font-body-sm shadow-sm group cursor-pointer hover:bg-secondary-container transition-colors">
<span className="material-symbols-outlined text-[16px]">filter_alt</span>
<span className="font-semibold">Oil filter</span>
<span className="material-symbols-outlined text-outline text-[14px] group-hover:text-primary transition-colors ml-0.5">tune</span>
</div>
<span className="hidden md:inline-flex text-outline-variant">·</span>
<span className="hidden md:inline-flex items-center gap-1 bg-surface-container-highest px-2 py-0.5 rounded font-label-code text-[11px] text-on-surface-variant">
        CHASSIS {data.chassisLabel}-300
      </span>
</div>

<div className="flex items-center gap-space-md">
<div className="flex items-center gap-1.5 font-label-code text-caption text-on-surface-variant">
<span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
<span>{data.hubLabel} Depot hub Linked</span>
</div>
<button type="button" className="flex items-center gap-1 text-on-surface-variant hover:text-primary font-body-sm text-caption px-space-sm py-1 rounded bg-surface-container transition-colors" onClick={actions.onSaveQuery}>
<span className="material-symbols-outlined text-[15px]">bookmark_border</span>
<span className="hidden sm:inline">Save query</span>
</button>
</div>
</div>

<div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-lg mb-space-xl">
<div className="flex flex-col gap-1 max-w-3xl">
<div className="flex items-center gap-2 mb-1">
<span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-label-code text-caption font-semibold">{data.chassisLabel} HYBRID SPEC</span>
<span className="text-on-surface-variant font-caption text-caption">Catalog Synced 09m ago</span>
</div>
<h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight leading-tight">
        Oil filter for your {data.vehicleLabel} ({data.trimLabel || data.trimBadge})
      </h1>
<p className="font-body-md text-body-md text-on-surface-variant">
        Viewing verified compatible parts cataloged for chassis {data.chassisLabel}. Prices include Jamaican landed import duties, GCT, and bonded port handling charges.
      </p>
</div>

<div className="flex items-center gap-space-sm bg-surface-container-lowest p-space-md rounded-xl shadow-sm self-start lg:self-auto">
<div className="flex flex-col pr-space-md">
<span className="font-caption text-caption text-on-surface-variant uppercase">Compatible Match Pool</span>
<span className="font-label-price text-headline-sm text-on-surface">{data.matchCount} Catalog Items</span>
</div>
<div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
<span className="material-symbols-outlined text-[22px]">verified</span>
</div>
</div>
</div>

<div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-md mb-space-xl p-space-xs bg-surface-container-lowest rounded-xl shadow-sm">

<div className="flex items-center gap-1 overflow-x-auto p-1 bg-surface-container-low rounded-lg" id="view-tabs" role="tablist">
<button type="button" className={`px-space-md py-1.5 rounded-lg font-body-sm text-body-sm font-semibold transition-all whitespace-nowrap ${data.activeFilterTab === "all" ? "bg-surface-container-lowest text-primary shadow-sm active-tab-pill" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onFilterTab("all")}>
        All matches ({data.filterAllCount})
      </button>
<button type="button" className={`px-space-md py-1.5 rounded-lg font-body-sm text-body-sm transition-all whitespace-nowrap ${data.activeFilterTab === "stock" ? "bg-surface-container-lowest text-primary shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onFilterTab("stock")}>
        In stock locally ({data.filterStockCount})
      </button>
<button type="button" className={`px-space-md py-1.5 rounded-lg font-body-sm text-body-sm transition-all whitespace-nowrap ${data.activeFilterTab === "oem" ? "bg-surface-container-lowest text-primary shadow-sm font-semibold" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onFilterTab("oem")}>
        Direct OEM only ({data.filterOemCount})
      </button>
</div>

<div className="flex items-center gap-space-md px-space-md py-1.5">
<span className="font-caption text-caption text-on-surface-variant uppercase font-semibold flex items-center gap-1">
<span className="material-symbols-outlined text-[15px]">model_training</span>
        Trim Scope:
      </span>
<div className="inline-flex p-0.5 rounded-lg bg-surface-container-low text-caption font-body-sm">
<button type="button" className={`px-space-sm py-1 rounded transition-colors ${data.activeTrimScope === "all" ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onTrimScope("all")}>
          Fits all 3 trims
        </button>
<button type="button" className={`px-space-sm py-1 rounded transition-colors ${data.activeTrimScope === "specific" ? "bg-surface-container-lowest text-primary font-semibold shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`} onClick={() => actions.onTrimScope("specific")}>
          Only {data.trimLabel || data.trimBadge || "this trim"}
        </button>
</div>
</div>
</div>

<div className="relative bg-surface-container-lowest rounded-xl shadow-md p-space-lg md:p-space-xl mb-space-xl overflow-hidden">

<div className="absolute left-0 top-0 bottom-0 w-2 bg-primary"></div>

<div className="flex flex-col xl:flex-row xl:items-start justify-between gap-space-xl pl-space-xs">

<div className="flex flex-col gap-space-md flex-1">

<div className="flex flex-wrap items-center gap-space-sm">
<span className="inline-flex items-center gap-1 bg-surface-container-highest text-primary font-label-code text-caption font-semibold px-2.5 py-1 rounded">
<span className="material-symbols-outlined text-[14px]">star</span>
            TOP RECOMMENDED
          </span>
<span className="inline-flex items-center gap-1 bg-primary text-on-primary font-label-code text-caption font-semibold px-2.5 py-1 rounded">
            Made for your car
          </span>
<span className="inline-flex items-center bg-surface-container-low text-on-surface-variant font-label-code text-caption px-2 py-1 rounded">
            OEM
          </span>
<span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 font-body-sm text-caption px-2.5 py-1 rounded font-semibold">
<span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Verified {data.chassisLabel}
          </span>
<span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-950 font-label-code text-caption px-2.5 py-1 rounded font-semibold shadow-sm">
<span className="material-symbols-outlined text-[14px] text-emerald-800">shelves</span>
            On your shelf — 2 in {data.hubLabel} Hub
          </span>
</div>

<div>
<div className="font-label-code text-headline-sm md:text-headline-lg font-bold text-on-surface tracking-tight">
            {data.rows[0]?.brandLabel || "—"} {data.partNumber} — Oil filter
          </div>
<div className="font-caption text-caption text-secondary font-label-code mt-0.5">
            {data.gtinLine}
          </div>
</div>

<div className="p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
<div className="flex flex-col gap-0.5">
<span className="font-caption text-caption uppercase text-on-surface-variant">Landed Commercial Matrix</span>
<span className="font-label-price text-body-lg font-bold text-on-surface">
              {data.priceLabel} landed <span className="text-on-surface-variant font-normal text-body-sm">· {data.hubLabel} Auto Parts · Ready today</span>
</span>
</div>
<div className="flex items-center gap-1 text-emerald-800 font-body-sm text-caption bg-surface-container-lowest px-2.5 py-1.5 rounded shadow-sm self-start sm:self-center">
<span className="material-symbols-outlined text-[16px]">local_shipping</span>
<span>Local depot dispatch within 2 hrs</span>
</div>
</div>
<p className="font-body-md text-body-md text-on-surface-variant">
          Local depot dispatch within 2 hrs. Genuine {data.rows[0]?.brandLabel || "—"} / OEM factory factory filter cartridge. Includes certified nitrile replacement O-rings and crush washer for aluminum sump pan.
        </p>
</div>

<div className="flex flex-col sm:flex-row xl:flex-col gap-space-md xl:w-72 xl:items-stretch justify-between shrink-0">

<div className="relative h-32 rounded-lg bg-surface-container-low overflow-hidden flex items-center justify-center p-2">
<img className="object-contain w-full h-full max-h-28 mix-blend-multiply" data-alt="High precision studio product photo of a genuine automotive cartridge oil filter with pleated paper media, synthetic rubber seals, and metal end caps on clean neutral industrial background with soft lighting." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCZSptvJZhr-QvJTlO0IgrNKv7fZtjFf6TnRAYSCITadsjerWW2Ce06n1GRWQQKg-XpSo1FMyX0c4NMZAJsEBGs3JW7PcgnrsxB5olBwLXVkoC-Os3U-WIMxyFcNtZ_2BQt-7rhslgICgvMVX4ViEjPiHwc5YbPXiTx0bSuGBKbHYMS5RPzll248uU-n5KyUGBryvozch08ba5BW6Vqs3AK16FGp2SNTCCziAFvq3I" />
<span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-inverse-surface/80 text-inverse-on-surface font-label-code text-[10px] rounded">
            {data.photoMatchLabel}
          </span>
</div>

<div className="flex flex-col gap-space-xs flex-1">
<button type="button" className="w-full h-10 px-space-md rounded-lg bg-primary text-on-primary font-body-sm font-semibold hover:bg-inverse-surface transition-all flex items-center justify-center gap-2 shadow-sm" onClick={actions.onUseInService}>
<span className="material-symbols-outlined text-[18px]">build</span>
<span>Use in a service log</span>
</button>
<div className="grid grid-cols-2 gap-space-xs">
<button type="button" className="h-9 px-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors flex items-center justify-center" onClick={actions.onQuote}>
              Quote PO
            </button>
<button type="button" className="h-9 px-space-sm rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors flex items-center justify-center gap-1 group" onClick={actions.onOpenBest}>
<span>Details</span>
<span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
</button>
</div>
</div>
</div>
</div>
</div>

<div className="flex items-center justify-between mb-space-md">
<div className="flex items-center gap-space-sm">
<span className="font-headline-sm text-headline-sm text-on-surface">Structured Match Categories</span>
<span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{data.matchCount} MATCHES FOUND</span>
</div>
<span className="font-caption text-caption text-on-surface-variant hidden sm:inline">Click any row to reveal fitment specs &amp; depot storage bins</span>
</div>

<div className="flex flex-col gap-space-lg mb-space-xl">

<div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm p-space-md bg-surface-container-low/60 pl-space-lg relative">
<div className="absolute left-0 top-0 bottom-0 w-1 bg-[#2563eb]"></div>
<div className="flex items-center flex-wrap gap-space-sm">
<span className="font-headline-sm text-headline-sm font-bold text-on-surface">Made for your car</span>
<span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded-full bg-[#2563eb]/10 text-[#2563eb]">1</span>
<span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface">OEM</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">
          The exact factory component designed and installed by the vehicle manufacturer.
        </p>
</div>

{data.rows.map((row) => (
<button
  key={row.id}
  type="button"
  className="p-space-lg flex flex-col lg:flex-row lg:items-center justify-between gap-space-md hover:bg-surface-container-low/30 transition-colors cursor-pointer group w-full text-left"
  onClick={() => actions.onOpenRow(row.id)}
>
<div className="flex items-start gap-space-md flex-1">
<div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-secondary text-[24px]">oil_barrel</span>
</div>
<div className="flex flex-col gap-1 min-w-0">
<div className="flex items-center flex-wrap gap-space-sm">
<span className="font-headline-sm text-body-lg font-bold text-on-surface">{row.partName}</span>
<span className="font-label-code text-body-md font-semibold text-primary">{row.brandLabel} {data.partNumber}</span>
{row.isBest ? (
<span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-caption text-caption font-semibold">
<span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Verified
              </span>
) : null}
<span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                {row.matchPercent} match
              </span>
</div>
<div className="font-caption text-caption text-secondary flex items-center gap-2">
<span>{row.tierLabel}</span>
<span>·</span>
<span>{row.supplierLabel}</span>
</div>
</div>
</div>

<div className="flex items-center justify-between lg:justify-end gap-space-lg shrink-0">
<div className="flex flex-col lg:text-right">
<span className="font-label-price text-body-lg font-bold text-on-surface">{row.priceLabel} landed</span>
<span className="font-caption text-caption text-on-surface-variant">{data.hubLabel} · {row.stockLabel}</span>
</div>
<div className="flex items-center gap-space-md">
<span className="inline-flex items-center gap-1 font-label-code text-caption font-semibold px-2.5 py-1 rounded bg-emerald-100 text-emerald-950">
<span className="material-symbols-outlined text-[15px]">inventory</span>
              {row.stockLabel}
            </span>
<div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span className="material-symbols-outlined text-[18px]">chevron_right</span>
</div>
</div>
</div>
</button>
))}

<div className="hidden px-space-lg pb-space-lg pt-space-xs bg-surface-container-low/20" id="oem-details">
<div className="p-space-md bg-surface-container-lowest rounded-lg flex flex-col sm:flex-row items-start justify-between gap-space-md">
<div className="flex flex-col gap-1 text-caption font-body-sm text-on-surface-variant">
<div><strong className="text-on-surface font-semibold">Inner Core Diameter:</strong> 28.2 mm · <strong className="text-on-surface font-semibold">Height:</strong> 56.5 mm</div>
<div><strong className="text-on-surface font-semibold">Material:</strong> Synthetic resin micro-fiber with high dirt retention capacity (OEM factory Grade A)</div>
<div><strong className="text-on-surface font-semibold">Service Schedule:</strong> {data.scheduleLine}</div>
</div>
<button type="button" className="px-space-md py-1.5 rounded bg-primary text-on-primary font-body-sm text-caption shrink-0" onClick={actions.onAllocate}>
            Allocate to Work Order
          </button>
</div>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm p-space-md bg-surface-container-low/60 pl-space-lg relative">
<div className="absolute left-0 top-0 bottom-0 w-2 bg-[#7c3aed]"></div>
<div className="flex items-center flex-wrap gap-space-sm">
<span className="font-headline-sm text-headline-sm font-bold text-on-surface">Other brands that replace it</span>
<span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded-full bg-[#7c3aed]/10 text-[#7c3aed]">1</span>
<span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface">Aftermarket</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">
          Direct replacement parts made by certified OEM tier-1 parts manufacturers.
        </p>
</div>

<div className="p-space-lg flex flex-col lg:flex-row lg:items-center justify-between gap-space-md hover:bg-surface-container-low/30 transition-colors cursor-pointer group">
<div className="flex items-start gap-space-md flex-1">
<div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-secondary text-[24px]">swap_horiz</span>
</div>
<div className="flex flex-col gap-1 min-w-0">
<div className="flex items-center flex-wrap gap-space-sm">
<span className="font-headline-sm text-body-lg font-bold text-on-surface">Oil filter</span>
<span className="font-label-code text-body-md font-semibold text-primary">{data.partBrand} {data.partNumberAlt} z</span>
<span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-caption text-caption font-semibold">
<span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                Verified
              </span>
<span className="inline-flex items-center gap-1 text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-caption text-caption font-semibold">
<span className="material-symbols-outlined text-[13px]">history</span>
                Price may be old
              </span>
<span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                Fits all 3
              </span>
</div>
<p className="font-body-sm text-body-sm text-secondary">
              {data.partBrand} {data.partNumberAlt} z replaces the factory part {data.partNumber}.
            </p>
</div>
</div>

<div className="flex items-center justify-between lg:justify-end gap-space-lg shrink-0">
<div className="flex flex-col lg:text-right">
<span className="font-label-price text-body-lg font-bold text-on-surface">{data.rows[0]?.priceLabel || "No price yet"} landed</span>
<span className="font-caption text-caption text-on-surface-variant">3 days (verified supplier)</span>
</div>
<div className="flex items-center gap-space-md">
<span className="inline-flex items-center gap-1 font-label-code text-caption px-2.5 py-1 rounded bg-surface-container-high text-on-surface-variant font-medium">
<span className="material-symbols-outlined text-[15px]">schedule</span>
              Supplier delivery: 3 days
            </span>
<div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span className="material-symbols-outlined text-[18px]">chevron_right</span>
</div>
</div>
</div>
</div>

<div className="hidden px-space-lg pb-space-lg pt-space-xs bg-surface-container-low/20" id="mann-details">
<div className="p-space-md bg-surface-container-lowest rounded-lg flex flex-col sm:flex-row items-start justify-between gap-space-md">
<div className="flex flex-col gap-1 text-caption font-body-sm text-on-surface-variant">
<div><strong className="text-on-surface font-semibold">Interchange:</strong> {data.interchange !== "None yet" ? data.interchange : "None yet"}</div>
<div><strong className="text-on-surface font-semibold">Supplier Note:</strong> Last quotation updated 14 days ago. Dispatch from Manchester warehouse via Knutsford Express freight.</div>
</div>
<button type="button" className="px-space-md py-1.5 rounded bg-surface-container-highest hover:bg-surface-variant text-on-surface font-body-sm text-caption shrink-0" onClick={actions.onFreshQuote}>
            Request Fresh Supplier Quote
          </button>
</div>
</div>
</div>

<div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm p-space-md bg-surface-container-low/60 pl-space-lg relative">
<div className="absolute left-0 top-0 bottom-0 w-2 bg-[#059669]"></div>
<div className="flex items-center flex-wrap gap-space-sm">
<span className="font-headline-sm text-headline-sm font-bold text-on-surface">Fits by size</span>
<span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded-full bg-[#059669]/10 text-[#059669]">1</span>
<span className="font-label-code text-caption font-semibold px-2 py-0.5 rounded bg-surface-container-highest text-on-surface">Universal</span>
</div>
<p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">
          Consumables, fluids, and hardware that match factory chemical and dimensional tolerances.
        </p>
</div>

<div className="p-space-lg flex flex-col lg:flex-row lg:items-center justify-between gap-space-md hover:bg-surface-container-low/30 transition-colors cursor-pointer group">
<div className="flex items-start gap-space-md flex-1">
<div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
<span className="material-symbols-outlined text-secondary text-[24px]">water_drop</span>
</div>
<div className="flex flex-col gap-1 min-w-0">
<div className="flex items-center flex-wrap gap-space-sm">
<span className="font-headline-sm text-body-lg font-bold text-on-surface">Engine oil 0W-20, 1 L</span>
<span className="font-label-code text-body-md font-semibold text-primary">{data.rows[0]?.brandLabel || "—"} 08880-WA001</span>
<span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                SAE 0W-20 · ILSAC GF-6A
              </span>
</div>
<p className="font-body-sm text-body-sm text-secondary">
              Any brand in this size fits: oil grade 0W-20, 3.4 L with filter.
            </p>
</div>
</div>

<div className="flex items-center justify-between lg:justify-end gap-space-lg shrink-0">
<div className="flex flex-col lg:text-right">
<span className="font-body-sm text-body-sm text-on-surface-variant">No price yet</span>
<button type="button" className="font-body-sm text-caption text-primary underline font-semibold hover:text-secondary" onClick={actions.onFreshQuote}>Get a price</button>
</div>
<div className="flex items-center gap-space-md">
<button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-body-sm font-semibold transition-colors flex items-center gap-1.5" onClick={actions.onAddToList}>
<span className="material-symbols-outlined text-[16px]">add_box</span>
<span>Add to stock</span>
</button>
<div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-colors">
<span className="material-symbols-outlined text-[18px]">chevron_right</span>
</div>
</div>
</div>
</div>

<div className="hidden px-space-lg pb-space-lg pt-space-xs bg-surface-container-low/20" id="oil-details">
<div className="p-space-md bg-surface-container-lowest rounded-lg flex flex-col sm:flex-row items-start justify-between gap-space-md">
<div className="flex flex-col gap-1 text-caption font-body-sm text-on-surface-variant">
<div><strong className="text-on-surface font-semibold">Factory Spec:</strong> API SP / Resource Conserving, Full Synthetic.</div>
<div><strong className="text-on-surface font-semibold">Sump Capacity:</strong> 3.2 L dry replacement, 3.4 L complete change with filter cartridge exchange.</div>
</div>
<button type="button" className="px-space-md py-1.5 rounded bg-primary text-on-primary font-body-sm text-caption shrink-0" onClick={actions.onBulkConsumable}>
            Log Bulk Consumable
          </button>
</div>
</div>
</div>

<div className="bg-surface-container-low rounded-xl p-space-md flex flex-col sm:flex-row items-center justify-between gap-space-md shadow-sm">
<div className="flex items-center gap-space-md">
<div className="w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface-variant shrink-0">
<span className="material-symbols-outlined text-[20px]">search_off</span>
</div>
<div className="flex flex-col">
<span className="font-body-md text-body-sm font-semibold text-on-surface">
            Nothing on file for: Same car, different badge · Fits your engine.
          </span>
<span className="font-caption text-caption text-on-surface-variant">
            Cross-platform badges (e.g., Honda Shuttle / Grace cross-references) have no active regional listings.
          </span>
</div>
</div>
<button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-lowest hover:bg-surface text-primary font-body-sm text-body-sm font-semibold shadow-sm transition-colors flex items-center gap-1.5 shrink-0" onClick={actions.onAskRoam}>
<span>Ask Roam to find another option</span>
<span className="material-symbols-outlined text-[16px]">arrow_forward</span>
</button>
</div>
</div>

<div className="grid grid-cols-1 md:grid-cols-3 gap-space-md mb-space-xl p-space-md bg-surface-container-lowest rounded-xl shadow-sm">
<div className="flex items-center gap-space-sm p-space-sm">
<span className="material-symbols-outlined text-secondary text-[24px]">verified_user</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Jamaica Customs Harmonized Code</span>
<span className="font-label-code text-caption text-on-surface-variant">HS 8421.23.00 (Motor Vehicle Oil Filters)</span>
</div>
</div>
<div className="flex items-center gap-space-sm p-space-sm">
<span className="material-symbols-outlined text-secondary text-[24px]">speed</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">{data.hubLabel} Hub Transit Time</span>
<span className="font-label-code text-caption text-on-surface-variant">Same-day courier dispatch guaranteed &lt; 2h</span>
</div>
</div>
<div className="flex items-center gap-space-sm p-space-sm">
<span className="material-symbols-outlined text-secondary text-[24px]">swap_calls</span>
<div className="flex flex-col">
<span className="font-body-sm text-body-sm font-semibold text-on-surface">Automatic Fitment Assurance</span>
<span className="font-label-code text-caption text-on-surface-variant">100% VIN-guaranteed return policy applied</span>
</div>
</div>
</div>

<div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-lg border-t border-surface-container-high">
<button type="button" className="w-full sm:w-auto px-space-lg py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-body-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm" onClick={actions.onBackToPartSelection}>
<span className="material-symbols-outlined text-[18px]">arrow_back</span>
<span>Back to part selection</span>
</button>
<div className="flex items-center gap-space-sm w-full sm:w-auto">
<button type="button" className="flex-1 sm:flex-none px-space-lg py-2.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-body-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm" onClick={actions.onDownloadReport}>
<span className="material-symbols-outlined text-[18px]">file_download</span>
<span>Download fitment report</span>
</button>
<button type="button" className="flex-1 sm:flex-none px-space-xl py-2.5 rounded-lg bg-primary text-on-primary font-body-sm font-semibold hover:bg-inverse-surface transition-all flex items-center justify-center gap-2 shadow-sm" onClick={actions.onConfirmPartsList}>
<span className="material-symbols-outlined text-[18px]">check_circle</span>
<span>Confirm parts list</span>
</button>
</div>
</div>
</div>
</div></div>
    </div>
  );
}
