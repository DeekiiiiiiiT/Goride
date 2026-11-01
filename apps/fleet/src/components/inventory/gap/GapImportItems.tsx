/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapImportItems(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="ImportItems">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="w-full px-margin-desktop py-space-xl opacity-25 filter blur-[2px] pointer-events-none select-none max-w-[1440px] mx-auto">
        <div className="flex items-center justify-between pb-space-lg mb-space-lg">
        <div className="flex flex-col gap-space-xs">
        <span className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Parts & Inventory Catalog</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">Kingston Central Storeroom · Zone A Warehouse Ledger</span>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="h-9 px-space-md bg-surface-container rounded-lg flex items-center gap-space-xs text-on-surface-variant font-body-sm text-body-sm">
        <span className="material-symbols-outlined text-[18px]">filter_list</span>
        <span>Filter Stock</span>
        </div>
        <div className="h-9 px-space-md bg-primary text-on-primary rounded-lg flex items-center gap-space-xs font-body-sm text-body-sm font-medium">
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>Add SKU</span>
        </div>
        </div>
        </div>

        <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-6 px-space-lg py-space-md bg-surface-container font-caption text-caption text-secondary uppercase font-semibold">
        <span>SKU / Part Code</span>
        <span>Item Specification</span>
        <span>Category</span>
        <span>On Hand</span>
        <span>Valuation (JMD)</span>
        <span className="text-right">Primary Vendor</span>
        </div>
        <div className="divide-y divide-surface-container">
        <div className="grid grid-cols-6 px-space-lg py-space-md font-body-sm text-body-sm items-center">
        <span className="font-label-code text-label-code font-bold">INV-0004-JA</span>
        <span>Oil Filter Heavy-Duty D4D</span>
        <span>Powertrain</span>
        <span className="font-label-code text-label-code">42 units</span>
        <span className="font-label-price text-label-price">J$ 3,850.00</span>
        <span className="text-right text-on-surface-variant">Toyota Jamaica Ltd</span>
        </div>
        <div className="grid grid-cols-6 px-space-lg py-space-md font-body-sm text-body-sm items-center">
        <span className="font-label-code text-label-code font-bold">INV-0005-JA</span>
        <span>Brake Pads Ceramic Front Set</span>
        <span>Braking Systems</span>
        <span className="font-label-code text-label-code">18 sets</span>
        <span className="font-label-price text-label-price">J$ 9,200.00</span>
        <span className="text-right text-on-surface-variant">Kingston Auto Supplies</span>
        </div>
        <div className="grid grid-cols-6 px-space-lg py-space-md font-body-sm text-body-sm items-center">
        <span className="font-label-code text-label-code font-bold">INV-0007</span>
        <span>Phone Holder Mount Pro</span>
        <span>Cabin Accessories</span>
        <span className="font-label-code text-label-code">6 units</span>
        <span className="font-label-price text-label-price">J$ 4,800.00</span>
        <span className="text-right text-on-surface-variant">Car Toys Jamaica</span>
        </div>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-[1px] transition-opacity"></div>

        <div className="fixed inset-0 z-50 flex items-center justify-center p-space-md overflow-y-auto">
        <div className="w-full max-w-[840px] bg-surface-container-lowest rounded-xl shadow-xl flex flex-col overflow-hidden my-auto">

        <div className="px-space-xl pt-space-xl pb-space-lg bg-surface-container-lowest flex items-start justify-between">
        <div className="flex flex-col gap-1 pr-space-lg">
        <div className="flex items-center gap-space-sm">
        <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Import items</span>
        <span className="bg-surface-container text-on-surface-variant font-label-code text-[11px] px-2 py-0.5 rounded font-semibold tracking-wide uppercase">Batch Intake</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Bulk upload parts and accessories into your catalog. Quantities must come from Opening balances or Receive.
                  </p>
        </div>
        <button type="button" aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" type="button">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <div className="px-space-xl py-space-md bg-surface-container-low">
        <div className="grid grid-cols-3 gap-space-md items-center">

        <div className="flex items-center gap-space-sm">
        <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[15px]">check</span>
        </div>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-secondary font-bold uppercase tracking-wider">Step 01</span>
        <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">Upload</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm">
        <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[15px]">check</span>
        </div>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-secondary font-bold uppercase tracking-wider">Step 02</span>
        <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">Match columns</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-1.5 rounded-lg shadow-sm">
        <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 font-label-code text-[12px] font-bold">
                      3
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-primary font-bold uppercase tracking-wider">Step 03</span>
        <span className="font-body-sm text-body-sm text-on-surface font-bold truncate">Check & Review</span>
        </div>
        </div>
        </div>
        </div>

        <div className="px-space-xl py-space-lg flex flex-col gap-space-lg max-h-[calc(88vh-220px)] overflow-y-auto">

        <div className="flex flex-col gap-space-sm bg-surface-container-low p-space-md rounded-lg">

        <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-secondary text-[18px]">description</span>
        <span className="font-body-sm text-body-sm text-on-surface font-medium">Uploaded:</span>
        <span className="font-label-code text-label-code text-primary font-semibold bg-surface-container px-2 py-0.5 rounded">roam_fleet_catalog_nov2026.csv</span>
        <span className="font-body-sm text-body-sm text-secondary">(16 rows detected)</span>
        </div>
        <div className="flex items-center gap-space-md">
        <a className="font-caption text-caption text-primary font-semibold hover:underline flex items-center gap-0.5" href="#">
        <span className="material-symbols-outlined text-[14px]">sync</span>
                        Replace file
                      </a>
        <span className="text-secondary/30 text-caption">•</span>
        <a className="font-caption text-caption text-secondary font-semibold hover:text-on-surface hover:underline flex items-center gap-0.5" href="#">
        <span className="material-symbols-outlined text-[14px]">download</span>
                        Download sample CSV template
                      </a>
        </div>
        </div>

        <div className="pt-space-xs flex flex-wrap items-center gap-space-xs font-caption text-caption">
        <span className="text-secondary font-semibold tracking-wider uppercase mr-1 text-[10px]">Active Mappings:</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Part Name <span className="text-secondary">→</span> Name
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Item Code <span className="text-secondary">→</span> SKU
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Cat <span className="text-secondary">→</span> Category
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Unit Price <span className="text-secondary">→</span> Default cost
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Distributor <span className="text-secondary">→</span> Vendor
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-[11px]">
                      Warehouse Bin <span className="opacity-60">→</span> Skipped
                      <span className="material-symbols-outlined text-[13px]">block</span>
        </span>
        </div>
        </div>

        <div className="flex items-center justify-between gap-space-md p-space-md bg-surface-container rounded-lg">
        <div className="flex items-center gap-space-sm">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Data Verification Summary:</span>
        <div className="flex items-center gap-space-xs">
        <span className="px-2.5 py-1 rounded-full bg-surface-container-lowest text-on-surface font-label-code text-label-code font-bold shadow-sm flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
                        12 new items
                      </span>
        <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-fixed font-label-code text-label-code font-bold flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-secondary"></span>
                        3 updates existing
                      </span>
        <span className="px-2.5 py-1 rounded-full bg-error-container text-on-error-container font-label-code text-label-code font-bold flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-error"></span>
                        1 problem row
                      </span>
        </div>
        </div>
        <span className="font-caption text-caption text-secondary">Displaying 4 representative rows</span>
        </div>

        <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-space-md py-space-sm bg-surface-container-high font-caption text-caption text-secondary uppercase font-semibold">
        <span className="col-span-2">Intake Status</span>
        <span className="col-span-3">Item Name</span>
        <span className="col-span-2">SKU</span>
        <span className="col-span-2">Category</span>
        <span className="col-span-2 text-right">Default Cost</span>
        <span className="col-span-1 text-right">Vendor</span>
        </div>
        <div className="divide-y divide-surface-container">

        <div className="grid grid-cols-12 px-space-md py-space-md items-center hover:bg-surface-container-low transition-colors">
        <div className="col-span-2 flex items-center">
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container-highest text-on-surface flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          New
                        </span>
        </div>
        <div className="col-span-3 font-body-sm text-body-sm font-semibold text-on-surface truncate">
                        Hydraulic Jack 3-Ton
                      </div>
        <div className="col-span-2 font-label-code text-label-code text-secondary font-medium">
                        TLS-HJK-03
                      </div>
        <div className="col-span-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                        Workshop Tools
                      </div>
        <div className="col-span-2 font-label-price text-label-price text-right text-on-surface">
                        J$ 5,600.00
                      </div>
        <div className="col-span-1 font-body-sm text-body-sm text-right text-on-surface-variant truncate" title="Kingston Auto Supplies">
                        Kgn Auto
                      </div>
        </div>

        <div className="grid grid-cols-12 px-space-md py-space-md items-center hover:bg-surface-container-low transition-colors">
        <div className="col-span-2 flex items-center">
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container-highest text-on-surface flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          New
                        </span>
        </div>
        <div className="col-span-3 font-body-sm text-body-sm font-semibold text-on-surface truncate">
                        Warning Triangle Reflector
                      </div>
        <div className="col-span-2 font-label-code text-label-code text-secondary font-medium">
                        SFT-TRG-01
                      </div>
        <div className="col-span-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                        Safety
                      </div>
        <div className="col-span-2 font-label-price text-label-price text-right text-on-surface">
                        J$ 2,100.00
                      </div>
        <div className="col-span-1 font-body-sm text-body-sm text-right text-on-surface-variant truncate" title="Kingston Auto Supplies">
                        Kgn Auto
                      </div>
        </div>

        <div className="grid grid-cols-12 px-space-md py-space-md items-center bg-surface-container-low/50 hover:bg-surface-container-low transition-colors">
        <div className="col-span-2 flex items-center">
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-secondary-container text-on-secondary-fixed flex items-center gap-1" title="Matches existing INV-0007 in Kingston database">
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                          Updates
                        </span>
        </div>
        <div className="col-span-3 font-body-sm text-body-sm font-semibold text-on-surface truncate">
                        Phone Holder Mount
                        <span className="block font-caption text-caption text-secondary font-normal">Replaces base catalog spec</span>
        </div>
        <div className="col-span-2 font-label-code text-label-code text-primary font-bold">
                        INV-0007
                      </div>
        <div className="col-span-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                        Accessories
                      </div>
        <div className="col-span-2 font-label-price text-label-price text-right text-on-surface">
                        J$ 5,400.00
                      </div>
        <div className="col-span-1 font-body-sm text-body-sm text-right text-on-surface-variant truncate" title="Car Toys Jamaica">
                        Car Toys
                      </div>
        </div>

        <div className="grid grid-cols-12 px-space-md py-space-md items-center bg-error-container/20">
        <div className="col-span-2 flex items-center">
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-error-container text-on-error-container flex items-center gap-1">
        <span className="material-symbols-outlined text-[13px] text-error">error</span>
                          Problem
                        </span>
        </div>
        <div className="col-span-3 font-body-sm text-body-sm font-semibold text-on-surface truncate">
                        OBD-II Dongle CANbus
                      </div>
        <div className="col-span-2 font-label-code text-label-code text-secondary font-medium">
                        TEL-OBD-V4
                      </div>
        <div className="col-span-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                        Telematics
                      </div>
        <div className="col-span-2 text-right">
        <span className="inline-block px-2 py-0.5 rounded bg-error-container text-on-error-container font-label-code text-[12px] font-bold">
                          Call for price
                        </span>
        <span className="block font-caption text-[10px] text-error mt-0.5 leading-tight">
                          Must be numeric (e.g. 12000.00)
                        </span>
        </div>
        <div className="col-span-1 font-body-sm text-body-sm text-right text-on-surface-variant truncate">
                        Amazon
                      </div>
        </div>
        </div>
        </div>

        <div className="p-space-md bg-surface-container rounded-lg flex items-start gap-space-md">
        <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center shrink-0 shadow-sm text-primary">
        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
        </div>
        <div className="flex flex-col gap-0.5">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Catalog Intake Protocol Notice</span>
        <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                      Import adds items to your master parts catalog only. Inventory quantities remain at <span className="font-label-code font-bold text-on-surface">0 units</span> until explicitly adjusted through <span className="font-medium text-on-surface">Opening balances</span>, purchase <span className="font-medium text-on-surface">Receive</span> documents, or a certified <span className="font-medium text-on-surface">Physical Count</span>.
                    </p>
        </div>
        </div>
        </div>

        <div className="px-space-xl py-space-lg bg-surface-container-low flex flex-wrap items-center justify-between gap-space-md">

        <button type="button" className="flex items-center gap-space-xs font-body-sm text-body-sm text-error font-medium hover:underline" type="button">
        <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
        <span>Download 1 problem row (.csv)</span>
        </button>

        <div className="flex items-center gap-space-md">
        <button type="button" className="h-10 px-space-lg rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-semibold shadow-sm hover:bg-surface-container transition-all" type="button">
                    Back to mapping
                  </button>
        <button type="button" className="h-10 px-space-xl rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:opacity-95 active:scale-[0.99] transition-all flex items-center gap-space-xs shadow-sm" id="importActionBtn" type="button">
        <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
        <span>Import 15 items (skip 1 error)</span>
        </button>
        </div>
        </div>
        </div>
        </div>

        </div></div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
