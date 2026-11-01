/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In18Phone() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full px-margin space-y-space-lg">

      <div className="w-full -mx-margin px-margin overflow-x-auto no-scrollbar pt-space-xs">
      <div className="flex items-center gap-space-xs w-max pb-space-xs">
      <button type="button" onClick={() => shell.setTab('overview')} className="px-space-md py-1.5 rounded-full font-caption text-caption text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors">Overview</button>
      <button type="button" onClick={() => shell.setTab('stock')} className="px-space-md py-1.5 rounded-full font-caption text-caption font-semibold text-on-primary bg-primary shadow-sm flex items-center gap-1">
      <span>Stock</span>
      <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed"></span>
      </button>
      <button type="button" onClick={() => shell.setTab('vehicle-kits')} className="px-space-md py-1.5 rounded-full font-caption text-caption text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors">Vehicle Kits</button>
      <button type="button" onClick={() => shell.setTab('assets')} className="px-space-md py-1.5 rounded-full font-caption text-caption text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors">Assets</button>
      <button type="button" onClick={() => shell.setTab('movements')} className="px-space-md py-1.5 rounded-full font-caption text-caption text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors">Movements</button>
      <button type="button" onClick={() => shell.setTab('counts')} className="px-space-md py-1.5 rounded-full font-caption text-caption text-on-surface-variant bg-surface-container hover:bg-surface-container-high transition-colors">Counts</button>
      <button type="button" onClick={() => shell.setTab('alerts')} className="px-space-md py-1.5 rounded-full font-caption text-caption text-error bg-error-container/60 hover:bg-error-container transition-colors flex items-center gap-1 font-semibold">
      <span>Alerts</span>
      {live.openAlertCount > 0 ? (
      <span className="px-1.5 py-0.2 rounded-full bg-error text-on-error font-label-code text-[10px] leading-tight">{live.openAlertCount}</span>
      ) : null}
      </button>
      </div>
      </div>

      <div className="grid grid-cols-2 gap-space-sm w-full">
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="font-caption text-caption">Total Items</span>
      <span className="material-symbols-outlined text-[16px]">inventory</span>
      </div>
      <div className="mt-space-sm">
      <div className="font-label-price text-[20px] font-bold text-on-surface tracking-tight">{live.stockItemCount}</div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">Valuation: <span className="font-label-code font-semibold text-on-surface">{live.totalStockValue}</span></div>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="font-caption text-caption">Active Alerts</span>
      <span className="material-symbols-outlined text-error text-[16px]">warning</span>
      </div>
      <div className="mt-space-sm">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-label-price text-[20px] font-bold text-error">{live.openAlertCount}</span>
      <span className="font-caption text-caption text-error font-semibold">critical</span>
      </div>
      <div className="font-caption text-caption text-on-surface-variant mt-0.5">Missing Kit: <span className="font-label-code font-semibold text-error">1 unit</span></div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-xs rounded-xl shadow-sm flex items-center gap-space-sm">
      <div className="flex items-center gap-space-xs flex-1 pl-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
      <input className="w-full bg-transparent text-on-surface placeholder:text-on-surface-variant text-body-sm font-body-sm outline-none" placeholder="Scan or search SKU, serial, bin..." type="text"/>
      </div>
      <button type="button" className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors" >
      <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
      </button>
      </div>

      <div className="flex flex-col space-y-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="font-headline-sm text-headline-sm text-on-surface">Stock Registry</span>
      <span className="px-space-xs py-0.5 rounded bg-surface-container-high font-label-code text-caption text-on-surface-variant font-medium">3 of 1,482</span>
      </div>
      <button type="button" className="font-caption text-caption font-semibold text-on-surface-variant hover:text-on-surface flex items-center gap-0.5">
      <span>Sort by Bin</span>
      <span className="material-symbols-outlined text-[14px]">expand_more</span>
      </button>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col space-y-space-sm relative overflow-hidden group">
      <div className="flex items-start justify-between">
      <div className="flex items-start gap-space-sm min-w-0">
      <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-on-surface-variant">
      <span className="material-symbols-outlined text-[24px]">smartphone</span>
      </div>
      <div className="min-w-0 flex flex-col">
      <span className="font-headline-sm text-body-md font-semibold text-on-surface truncate">Phone Holder Mount</span>
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant mt-0.5">
      <span>ACC-PHM-01</span>
      <span>•</span>
      <span className="truncate">Main store (Bin A-12)</span>
      </div>
      </div>
      </div>
      <button type="button" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>
      </div>
      <div className="flex items-center justify-between pt-space-xs">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Available</span>
      <span className="font-label-price text-[18px] font-bold text-on-surface">On hand: 6</span>
      </div>
      <span className="px-space-sm py-1 rounded-full bg-surface-container-low text-on-surface font-caption text-caption font-semibold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                In stock
              </span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col space-y-space-sm relative overflow-hidden group">
      <div className="flex items-start justify-between">
      <div className="flex items-start gap-space-sm min-w-0">
      <div className="w-12 h-12 rounded-lg bg-secondary-container/40 flex items-center justify-center shrink-0 text-on-secondary-container">
      <span className="material-symbols-outlined text-[24px]">videocam</span>
      </div>
      <div className="min-w-0 flex flex-col">
      <span className="font-headline-sm text-body-md font-semibold text-on-surface truncate">Dash camera Dual-Lens</span>
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant mt-0.5">
      <span>ELC-DCM-01</span>
      <span>•</span>
      <span className="truncate">Main store</span>
      </div>
      </div>
      </div>
      <button type="button" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>
      </div>
      <div className="flex items-center justify-between pt-space-xs">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Available</span>
      <span className="font-label-price text-[18px] font-bold text-on-surface">On hand: 1</span>
      </div>
      <span className="px-space-sm py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-caption text-caption font-semibold flex items-center gap-1">
      <span className="material-symbols-outlined text-[12px]">qr_code</span>
                1 Serialized
              </span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col space-y-space-sm relative overflow-hidden group">
      <div className="flex items-start justify-between">
      <div className="flex items-start gap-space-sm min-w-0">
      <div className="w-12 h-12 rounded-lg bg-error-container/40 flex items-center justify-center shrink-0 text-error">
      <span className="material-symbols-outlined text-[24px]">tire_repair</span>
      </div>
      <div className="min-w-0 flex flex-col">
      <span className="font-headline-sm text-body-md font-semibold text-on-surface truncate">Spare tyre 195/65 R15</span>
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant mt-0.5">
      <span>TYR-SPR-01</span>
      <span>•</span>
      <span className="truncate">Main store</span>
      </div>
      </div>
      </div>
      <button type="button" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[18px]">more_vert</span>
      </button>
      </div>
      <div className="flex items-center justify-between pt-space-xs">
      <div className="flex items-baseline gap-space-xs">
      <span className="font-caption text-caption text-error uppercase tracking-wider font-semibold">Depleted</span>
      <span className="font-label-price text-[18px] font-bold text-error">On hand: 0</span>
      </div>
      <span className="px-space-sm py-1 rounded-full bg-error-container text-on-error-container font-caption text-caption font-semibold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                Out of stock (Short)
              </span>
      </div>
      </div>
      </div>

      <div className="flex flex-col space-y-space-sm pt-space-xs">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="font-headline-sm text-headline-sm text-on-surface">Vehicle Kits</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">directions_car</span>
      </div>
      <button type="button" className="font-caption text-caption text-on-surface-variant hover:text-on-surface font-semibold">All 14 Units →</button>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col space-y-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center font-label-code text-caption font-bold text-on-surface">
                  5179
                </div>
      <div className="min-w-0 flex flex-col">
      <span className="font-headline-sm text-body-md font-semibold text-on-surface">Toyota Roomy</span>
      <span className="font-label-plate text-caption text-on-surface-variant uppercase">{live.primaryPlate}</span>
      </div>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface">70%</span>
      </div>

      <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
      <div className="bg-primary h-full rounded-full" style={{ width: "70%" }}></div>
      </div>
      <div className="flex items-center justify-between text-on-surface-variant">
      <span className="font-caption text-caption flex items-center gap-1 text-error font-medium">
      <span className="material-symbols-outlined text-[14px]">error</span>
                3 items missing (Jack, Kit, Cable)
              </span>
      <button type="button" className="px-space-sm py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-caption text-caption font-semibold transition-colors">
                Fulfill
              </button>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col space-y-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center font-label-code text-caption font-bold text-on-surface">
                  1505
                </div>
      <div className="min-w-0 flex flex-col">
      <span className="font-headline-sm text-body-md font-semibold text-on-surface">Honda Fit</span>
      <span className="font-label-plate text-caption text-on-surface-variant uppercase">{live.secondaryPlate}</span>
      </div>
      </div>
      <span className="font-label-code text-caption font-bold text-on-surface-variant">0%</span>
      </div>

      <div className="w-full bg-surface-container rounded-full h-2 overflow-hidden">
      <div className="bg-primary h-full rounded-full" style={{ width: "0%" }}></div>
      </div>
      <div className="flex items-center justify-between pt-0.5">
      <span className="font-caption text-caption text-on-surface-variant">Unassigned package</span>
      <button type="button" className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary hover:opacity-90 font-caption text-caption font-semibold shadow-sm flex items-center gap-1 transition-opacity">
      <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                Issue whole kit
              </button>
      </div>
      </div>
      </div>

      <div className="h-20 w-full shrink-0"></div>

      <div className="fixed bottom-16 inset-x-0 z-40 px-margin pointer-events-none pb-2">
      <div className="max-w-[390px] mx-auto w-full bg-primary-container/95 backdrop-blur-md rounded-2xl p-1.5 shadow-xl flex items-center justify-between gap-1 pointer-events-auto">
      <button type="button" className="flex-1 py-2 rounded-xl text-on-primary hover:bg-surface-container-lowest/10 transition-colors flex items-center justify-center gap-1.5">
      <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
      <span className="font-caption text-body-sm font-semibold">Receive</span>
      </button>
      <button type="button" className="flex-1 py-2 rounded-xl text-on-primary hover:bg-surface-container-lowest/10 transition-colors flex items-center justify-center gap-1.5">
      <span className="material-symbols-outlined text-[18px]">outbox</span>
      <span className="font-caption text-body-sm font-semibold">Issue</span>
      </button>
      <button type="button" className="flex-[1.2] py-2 rounded-xl bg-surface-container-lowest text-primary hover:bg-surface-container transition-all flex items-center justify-center gap-1.5 shadow-md" >
      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>qr_code_scanner</span>
      <span className="font-caption text-body-sm font-bold">Scan Barcode</span>
      </button>
      </div>
      </div>

      <div className="hidden fixed inset-0 z-50 flex flex-col bg-primary text-on-primary" data-stitch-id="scannerDrawer">

      <div className="h-14 px-margin flex items-center justify-between shrink-0 bg-primary-container">
      <button type="button" className="flex items-center gap-1 text-on-primary hover:opacity-80 transition-opacity font-caption text-body-sm font-medium" >
      <span className="material-symbols-outlined text-[20px]">arrow_back</span>
      <span>Back to Stock</span>
      </button>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="w-9 h-9 rounded-full bg-surface-container-highest/20 flex items-center justify-center text-on-primary" data-stitch-id="torchToggle" >
      <span className="material-symbols-outlined text-[20px]">flash_on</span>
      </button>
      <button type="button" className="w-9 h-9 rounded-full bg-surface-container-highest/20 flex items-center justify-center text-on-primary">
      <span className="material-symbols-outlined text-[20px]">tune</span>
      </button>
      </div>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center px-margin bg-primary/95 overflow-hidden">

      <div className="relative w-64 h-64 rounded-2xl flex items-center justify-center">

      <div className="absolute top-0 left-0 w-8 h-8 rounded-tl-xl border-t-4 border-l-4 border-surface-container-lowest"></div>
      <div className="absolute top-0 right-0 w-8 h-8 rounded-tr-xl border-t-4 border-r-4 border-surface-container-lowest"></div>
      <div className="absolute bottom-0 left-0 w-8 h-8 rounded-bl-xl border-b-4 border-l-4 border-surface-container-lowest"></div>
      <div className="absolute bottom-0 right-0 w-8 h-8 rounded-br-xl border-b-4 border-r-4 border-surface-container-lowest"></div>

      <div className="w-56 h-0.5 bg-error shadow-[0_0_8px_#ba1a1a] animate-pulse"></div>

      <div className="absolute inset-0 bg-surface-container-highest/5 rounded-2xl pointer-events-none"></div>
      </div>
      <p className="mt-space-lg text-center font-caption text-caption text-surface-container-high max-w-[240px]">
              Point at a QR label on an item, a device or a shelf
            </p>
      <button type="button" className="mt-space-md px-space-md py-1.5 rounded-full bg-surface-container-highest/30 text-on-primary font-caption text-caption font-semibold flex items-center gap-1.5 hover:bg-surface-container-highest/50 transition-colors">
      <span className="material-symbols-outlined text-[16px]">keyboard</span>
              Enter Code Manually
            </button>
      </div>

      <div className="w-full bg-surface-container-lowest text-on-surface rounded-t-2xl p-margin shadow-2xl flex flex-col space-y-space-md animate-in slide-in-from-bottom duration-300">
      <div className="w-12 h-1 bg-surface-container-high rounded-full mx-auto -mt-2 mb-1"></div>
      <div className="flex items-start justify-between">
      <div className="flex items-start gap-space-sm min-w-0">
      <div className="w-12 h-12 rounded-xl bg-secondary-container flex items-center justify-center shrink-0 text-on-secondary-container">
      <span className="material-symbols-outlined text-[24px]">videocam</span>
      </div>
      <div className="min-w-0">
      <span className="px-space-xs py-0.5 rounded bg-surface-container text-on-surface font-label-code text-caption font-bold">MATCH FOUND</span>
      <h4 className="font-headline-sm text-body-md font-bold text-on-surface truncate mt-1">Dash camera ELC-DCM-01</h4>
      <p className="font-label-code text-caption text-on-surface-variant truncate">Serial: DC-70A-0042118</p>
      </div>
      </div>
      <span className="px-space-sm py-0.5 rounded bg-surface-container-low text-on-surface font-caption text-caption font-semibold">Bin A-04</span>
      </div>

      <div className="grid grid-cols-3 gap-space-xs pt-space-xs">
      <button type="button" className="p-space-sm rounded-xl bg-primary text-on-primary font-caption text-caption font-semibold flex flex-col items-center justify-center gap-1 hover:opacity-90 transition-opacity" >
      <span className="material-symbols-outlined text-[20px]">directions_car</span>
      <span className="text-center leading-tight">Issue to car</span>
      </button>
      <button type="button" className="p-space-sm rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high font-caption text-caption font-semibold flex flex-col items-center justify-center gap-1 transition-colors" >
      <span className="material-symbols-outlined text-[20px]">swap_horiz</span>
      <span className="text-center leading-tight">Move stock</span>
      </button>
      <button type="button" className="p-space-sm rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high font-caption text-caption font-semibold flex flex-col items-center justify-center gap-1 transition-colors" >
      <span className="material-symbols-outlined text-[20px]">history</span>
      <span className="text-center leading-tight">Lifecycle</span>
      </button>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
