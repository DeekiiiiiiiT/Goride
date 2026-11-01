/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In6VehicleKits() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="fixed inset-0 z-50 hidden items-center justify-center bg-primary/20 backdrop-blur-sm px-4" data-stitch-id="issue-modal">
      <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-space-xl shadow-xl flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <div className="w-8 h-8 rounded bg-surface-container-high flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[18px]">build_circle</span>
      </div>
      <div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Issue Equipment Item</h4>
      <p className="font-caption text-caption text-on-surface-variant">Kingston Depot Central Logistics</p>
      </div>
      </div>
      <button type="button" className="w-7 h-7 rounded hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors" >
      <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>
      <div className="bg-surface-container-low p-space-md rounded flex flex-col gap-space-xs">
      <div className="flex justify-between items-center">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Target Vehicle</span>
      <span className="font-label-plate text-label-plate bg-surface-container-lowest px-2 py-0.5 rounded text-on-surface" data-stitch-id="modal-vehicle-plate">{live.primaryPlate}</span>
      </div>
      <div className="flex justify-between items-center">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Item Assignment</span>
      <span className="font-body-md text-body-md font-semibold text-primary" data-stitch-id="modal-item-name">Tyre pump</span>
      </div>
      </div>
      <div className="flex flex-col gap-space-md">
      <div>
      <label className="block font-caption text-caption text-on-surface-variant uppercase mb-1">Stock Source / Serial</label>
      <div className="relative">
      <input className="w-full h-9 px-space-md bg-surface-container-lowest rounded text-on-surface font-label-code text-label-code focus:outline-none" type="text" value="SKU-PUMP-2024-089 (Central Shelf B3)"/>
      <span className="absolute right-2.5 top-2 material-symbols-outlined text-[18px] text-on-surface-variant">qr_code_scanner</span>
      </div>
      </div>
      <div>
      <label className="block font-caption text-caption text-on-surface-variant uppercase mb-1">Technician / Installer</label>
      <input className="w-full h-9 px-space-md bg-surface-container-lowest rounded text-on-surface font-body-sm text-body-sm focus:outline-none" type="text" value="JD - Jason Dawkins ({live.hubName})"/>
      </div>
      </div>
      <div className="flex items-center justify-end gap-space-sm pt-space-sm">
      <button type="button" className="h-9 px-space-lg rounded bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium hover:bg-surface-container-highest transition-colors" >Cancel</button>
      <button type="button" className="h-9 px-space-lg rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-space-xs shadow-sm" >
      <span className="material-symbols-outlined text-[16px]">check</span>
                Confirm & Issue
              </button>
      </div>
      </div>
      </div>

      <div className="px-margin-desktop py-space-xl flex flex-col gap-space-xl max-w-[1560px] mx-auto w-full">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Inventory & Asset Management</span>
      <span className="text-outline-variant font-label-code text-[11px]">/</span>
      <span className="font-caption text-caption uppercase tracking-wider text-primary font-semibold">Fleet Equipment Compliance</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">What you have, where it is, and what every car is missing across Kingston operational fleet.</p>
      </div>

      <div className="flex items-center gap-space-md flex-wrap">
      <div className="bg-surface-container-lowest px-space-md py-space-sm rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-2.5 h-2.5 rounded-full bg-error animate-pulse"></div>
      <div className="flex flex-col">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Critical Gaps</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">13 Items</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest px-space-md py-space-sm rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-2.5 h-2.5 rounded-full bg-secondary"></div>
      <div className="flex flex-col">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Fleet Compliance</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">35% Full</span>
      </div>
      </div>
      </div>
      </div>

      <InventoryPrimaryTabs variant="segment" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">

      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs">
      <span className="font-headline-sm text-headline-sm text-on-surface">Vehicle kits</span>
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">2 active models</span>
      </div>
      <div className="h-4 w-px bg-outline-variant/50"></div>
      <div className="flex items-center bg-surface-container-high p-0.5 rounded">
      <button type="button" className="px-space-md py-1 rounded bg-surface-container-lowest text-primary font-body-sm text-body-sm font-semibold shadow-xs">Cars</button>
      <button type="button" className="px-space-md py-1 rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors">Kit templates</button>
      </div>
      </div>

      <div className="flex items-center gap-space-md flex-wrap">

      <div className="flex items-center bg-surface-container-high p-0.5 rounded">
      <button type="button" className="flex items-center gap-space-xs px-space-md py-1 rounded bg-surface-container-lowest text-primary font-body-sm text-body-sm font-semibold shadow-xs transition-all" data-stitch-id="view-mode-matrix" >
      <span className="material-symbols-outlined text-[16px]">grid_view</span>
                  Matrix
                </button>
      <button type="button" className="flex items-center gap-space-xs px-space-md py-1 rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-all" data-stitch-id="view-mode-cards" >
      <span className="material-symbols-outlined text-[16px]">view_agenda</span>
                  Cards
                </button>
      </div>
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-medium hover:bg-surface-container transition-colors flex items-center gap-space-xs shadow-xs">
      <span className="material-symbols-outlined text-[16px]">download</span>
                Export matrix
              </button>
      <button type="button" className="h-9 px-space-md rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-inverse-surface transition-colors flex items-center gap-space-xs shadow-sm" >
      <span className="material-symbols-outlined text-[16px]">inventory</span>
                Issue kits
              </button>
      </div>
      </div>

      <div className="bg-surface-container-low px-space-md py-space-sm rounded-lg flex items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-secondary text-[18px]">info</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">
                Clicking any red <span className="text-error font-semibold uppercase font-label-code text-[11px] bg-error-container/50 px-1 py-0.5 rounded">Missing</span> cell opens the Issue dialog prefilled for that vehicle and required equipment unit.
              </span>
      </div>
      <span className="font-label-code text-caption text-secondary shrink-0">Updated: Just now</span>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col" data-stitch-id="matrix-container">
      <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
      <thead>
      <tr className="bg-surface-container-high/60">

      <th className="p-space-lg w-80 min-w-[280px] bg-surface-container-high/90 sticky left-0 z-20">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Vehicle & Kit Tier</span>
      <span className="font-caption text-caption text-on-surface-variant">Status</span>
      </div>
      </th>

      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">tire_repair</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Spare tyre</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">hardware</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Jack</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">build</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Lug wrench</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">mode_fan</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Tyre pump</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">stay_current_portrait</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Phone holder</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">medical_services</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">First aid</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">warning</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Warning tri.</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">videocam</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Dash cam</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">contactless</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Toll tag</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[105px]">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">credit_card</span>
      </div>
      <span className="font-caption text-caption text-on-surface font-semibold">Fuel card</span>
      </div>
      </th>
      <th className="p-space-sm text-center min-w-[115px] bg-surface-container-high/40">
      <div className="flex flex-col items-center gap-1 py-1">
      <div className="w-7 h-7 rounded bg-surface-container-high flex items-center justify-center text-outline">
      <span className="material-symbols-outlined text-[16px]">fire_extinguisher</span>
      </div>
      <div className="flex flex-col items-center">
      <span className="font-caption text-caption text-secondary font-medium">Extinguisher</span>
      <span className="font-caption text-[9px] text-outline uppercase tracking-tight">Optional</span>
      </div>
      </div>
      </th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container">

      <tr className="hover:bg-surface/50 transition-colors">
      <td className="p-space-lg bg-surface-container-lowest sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Toyota Roomy 2019</span>
      <span className="font-label-plate text-label-plate px-2 py-0.5 bg-surface-container-high rounded text-on-surface">{live.primaryPlate}</span>
      </div>
      <div className="flex items-center justify-between gap-space-xs">
      <span className="font-caption text-caption bg-surface-container text-on-surface-variant px-2 py-0.5 rounded">Rideshare car kit</span>

      <span className="font-label-code text-[11px] font-semibold text-on-tertiary-container bg-tertiary-fixed/30 px-2 py-0.5 rounded flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                            70% · 7 of 10 complete
                          </span>
      </div>

      <div className="mt-1 flex items-center gap-1 text-on-surface-variant">
      <span className="material-symbols-outlined text-[13px]">layers</span>
      <span className="font-caption text-caption text-on-surface-variant">Also on this car:</span>
      <span className="font-label-code text-[11px] bg-surface-container-low px-1.5 py-0.5 rounded text-secondary font-medium">Car mats × 1 (ACC-MAT-01)</span>
      </div>
      </div>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-code text-caption font-semibold">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        ✓ OK
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-code text-caption font-semibold">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        ✓ OK
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-code text-caption font-semibold">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        ✓ OK
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-code text-caption font-semibold">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        ✓ OK
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>

      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-primary font-label-code text-caption font-semibold">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                        ✓ OK
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high text-on-surface font-label-code text-[11px] font-medium">
      <span className="material-symbols-outlined text-[13px]">link</span>
                        Linked
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high text-on-surface font-label-code text-[11px] font-medium">
      <span className="material-symbols-outlined text-[13px]">link</span>
                        Linked
                      </span>
      </td>

      <td className="p-space-sm text-center bg-surface-container-high/20">
      <span className="font-label-code text-on-surface-variant font-bold text-caption">—</span>
      </td>
      </tr>

      <tr className="hover:bg-surface/50 transition-colors">
      <td className="p-space-lg bg-surface-container-lowest sticky left-0 z-10 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-space-xs">
      <div className="flex items-center justify-between gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Honda Fit 2018</span>
      <span className="font-label-plate text-label-plate px-2 py-0.5 bg-surface-container-high rounded text-on-surface">{live.secondaryPlate}</span>
      </div>
      <div className="flex items-center justify-between gap-space-xs">
      <span className="font-caption text-caption bg-surface-container text-on-surface-variant px-2 py-0.5 rounded">Rideshare car kit</span>

      <span className="font-label-code text-[11px] font-semibold text-error bg-error-container/60 px-2 py-0.5 rounded flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                            0% · 0 of 10 complete
                          </span>
      </div>

      <div className="mt-1 flex items-center gap-1 text-on-surface-variant">
      <span className="material-symbols-outlined text-[13px]">layers_clear</span>
      <span className="font-caption text-caption text-on-surface-variant">Also on this car:</span>
      <span className="font-caption text-caption text-outline italic">None</span>
      </div>
      </div>
      </td>

      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>
      <td className="p-space-sm text-center">
      <button type="button" className="group relative inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-error-container/40 text-error hover:bg-error hover:text-on-error transition-all font-label-code text-caption font-bold w-full max-w-[95px]" >
      <span className="group-hover:hidden">Missing</span>
      <span className="hidden group-hover:inline text-[10px]">Issue →</span>
      </button>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high text-on-surface font-label-code text-[11px] font-medium">
      <span className="material-symbols-outlined text-[13px]">link</span>
                        Linked
                      </span>
      </td>

      <td className="p-space-sm text-center">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high text-on-surface font-label-code text-[11px] font-medium">
      <span className="material-symbols-outlined text-[13px]">link</span>
                        Linked
                      </span>
      </td>

      <td className="p-space-sm text-center bg-surface-container-high/20">
      <span className="font-label-code text-on-surface-variant font-bold text-caption">—</span>
      </td>
      </tr>
      </tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm text-on-surface-variant">
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-1.5 font-caption text-caption">
      <span className="w-2.5 h-2.5 rounded bg-surface-container-highest"></span>
      <span>OK: Verified & Mounted</span>
      </div>
      <div className="flex items-center gap-1.5 font-caption text-caption">
      <span className="w-2.5 h-2.5 rounded bg-error-container"></span>
      <span>Missing: Mandatory gap</span>
      </div>
      <div className="flex items-center gap-1.5 font-caption text-caption">
      <span className="w-2.5 h-2.5 rounded bg-surface-container-high"></span>
      <span>Linked: Digital/RFID asset</span>
      </div>
      </div>
      <div className="font-label-code text-caption">
                Showing 2 active vehicles · Total equipment lines: 22
              </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-md" data-stitch-id="cards-container">
      <div className="flex items-center justify-between">
      <div>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Vehicle Kit Cards Summary</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Detailed status breakdown per registered asset with instant kit deployment triggers.</p>
      </div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider bg-surface-container px-2.5 py-1 rounded">2 Units Monitored</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between gap-space-lg hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="w-1.5 absolute left-0 top-0 bottom-0 bg-tertiary-container"></div>
      <div className="flex flex-col gap-space-md pl-1">
      <div className="flex items-start justify-between">
      <div>
      <div className="flex items-center gap-space-sm">
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Toyota Roomy 2019</h4>
      <span className="font-label-plate text-label-plate px-2 py-0.5 bg-surface-container rounded text-on-surface">{live.primaryPlate}</span>
      </div>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Template: Rideshare standard car kit (10 requirements)</p>
      </div>
      <span className="font-label-code text-caption font-bold text-on-tertiary-container bg-tertiary-fixed/30 px-2 py-0.5 rounded">70% Complete</span>
      </div>

      <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center font-caption text-caption">
      <span className="text-on-surface-variant">Kit items on board</span>
      <span className="font-label-code font-semibold text-on-surface">7 / 10 items</span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
      <div className="h-full bg-on-tertiary-container rounded-full" style={{ width: "70%" }}></div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm pt-space-xs">
      <div className="bg-error-container/20 p-space-sm rounded flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-error text-[18px] shrink-0 mt-0.5">error</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption uppercase font-semibold text-error">Missing items required</span>
      <p className="font-body-sm text-body-sm font-semibold text-error">Tyre pump, First-aid kit, Warning triangle</p>
      </div>
      </div>
      <div className="bg-surface-container-low p-space-sm rounded flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">check_circle</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption uppercase font-semibold text-primary">Present & Inspected</span>
      <p className="font-body-sm text-body-sm text-on-surface">7 items verified on board (Spare tyre, Jack, Lug wrench, Phone holder, Dash cam, Toll tag, Fuel card)</p>
      </div>
      </div>
      </div>
      </div>

      <div className="flex items-center justify-between pt-space-md gap-space-sm pl-1">
      <span className="font-label-code text-caption text-on-surface-variant">Depot: {live.hubName}</span>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-low text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-medium transition-colors">Report</button>
      <button type="button" className="h-9 px-space-md rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-inverse-surface transition-colors flex items-center gap-1 shadow-xs" >
      <span className="material-symbols-outlined text-[16px]">add_box</span>
                      Issue missing
                    </button>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between gap-space-lg hover:shadow-md transition-shadow relative overflow-hidden">
      <div className="w-1.5 absolute left-0 top-0 bottom-0 bg-error"></div>
      <div className="flex flex-col gap-space-md pl-1">
      <div className="flex items-start justify-between">
      <div>
      <div className="flex items-center gap-space-sm">
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Honda Fit 2018</h4>
      <span className="font-label-plate text-label-plate px-2 py-0.5 bg-surface-container rounded text-on-surface">{live.secondaryPlate}</span>
      </div>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Template: Rideshare standard car kit (10 requirements)</p>
      </div>
      <span className="font-label-code text-caption font-bold text-error bg-error-container/60 px-2 py-0.5 rounded">0% Complete</span>
      </div>

      <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center font-caption text-caption">
      <span className="text-on-surface-variant">Kit items on board</span>
      <span className="font-label-code font-semibold text-error">0 / 10 items</span>
      </div>
      <div className="w-full h-2 rounded-full bg-surface-container-high overflow-hidden">
      <div className="h-full bg-error rounded-full" style={{ width: "0%" }}></div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm pt-space-xs">
      <div className="bg-error-container/30 p-space-sm rounded flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-error text-[18px] shrink-0 mt-0.5">warning</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption uppercase font-semibold text-error">Critical Incomplete State</span>
      <p className="font-body-sm text-body-sm font-semibold text-error">Missing entire standard kit (10 items)</p>
      <p className="font-caption text-caption text-on-error-container mt-1">Car is not road-cleared for dispatch until mandatory safety & emergency kit is equipped.</p>
      </div>
      </div>
      <div className="bg-surface-container-low p-space-sm rounded flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-on-surface-variant text-[18px] shrink-0 mt-0.5">link</span>
      <div className="flex flex-col">
      <span className="font-caption text-caption uppercase font-semibold text-on-surface-variant">Digital Telematics Only</span>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Toll tag & Fuel card associated via central vehicle cloud account.</p>
      </div>
      </div>
      </div>
      </div>

      <div className="flex items-center justify-between pt-space-md gap-space-sm pl-1">
      <span className="font-label-code text-caption text-on-surface-variant">Depot: {live.hubName}</span>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-low text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-medium transition-colors">Report</button>
      <button type="button" className="h-9 px-space-md rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-inverse-surface transition-colors flex items-center gap-1 shadow-xs" >
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                      Issue whole kit
                    </button>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex flex-col gap-space-xs">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Depot Warehouse</span>
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Available Kit Reserve</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Stock units staged in Hub #01 ready for installation today.</p>
      </div>
      <div className="grid grid-cols-3 gap-space-sm py-space-md">
      <div className="bg-surface-container-low p-space-sm rounded flex flex-col">
      <span className="font-label-code text-[11px] text-on-surface-variant">Tyre Pumps</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">14</span>
      </div>
      <div className="bg-surface-container-low p-space-sm rounded flex flex-col">
      <span className="font-label-code text-[11px] text-on-surface-variant">First Aid</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">06</span>
      </div>
      <div className="bg-surface-container-low p-space-sm rounded flex flex-col">
      <span className="font-label-code text-[11px] text-on-surface-variant">Triangles</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">22</span>
      </div>
      </div>
      <button type="button" className="h-8 w-full rounded bg-surface-container text-on-surface font-body-sm text-body-sm hover:bg-surface-container-high transition-colors font-medium">
                Open Central Store Inventory
              </button>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex flex-col gap-space-xs">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Fleet Health Audit</span>
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Compliance Timeline</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Weekly replenishment cycle for driver safety gear.</p>
      </div>
      <div className="flex items-center gap-space-md py-space-sm">

      <svg className="w-full h-12 text-primary" fill="none" viewBox="0 0 200 48">
      <path d="M 0 38 Q 30 40 60 28 T 120 18 T 160 24 T 200 8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.5"></path>
      <circle cx="200" cy="8" fill="currentColor" r="4"></circle>
      </svg>
      </div>
      <div className="flex items-center justify-between font-caption text-caption text-on-surface-variant">
      <span>Target: 100% Full compliance</span>
      <span className="font-label-code font-semibold text-primary">+12% vs last week</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex flex-col gap-space-xs">
      <span className="font-caption text-caption text-on-surface-variant uppercase">Depot Operations</span>
      <h4 className="font-headline-sm text-headline-sm text-on-surface">Quick Scanner</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Handheld barcode sync for technician staging bay.</p>
      </div>
      <div className="p-space-sm bg-surface-container-low rounded flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-secondary">barcode_scanner</span>
      <span className="font-label-code text-body-sm text-on-surface">Laser #3 Active</span>
      </div>
      <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
      </div>
      <button type="button" className="h-8 w-full rounded bg-primary text-on-primary font-body-sm text-body-sm hover:bg-inverse-surface transition-colors font-medium">
                Pair Mobile Scanner
              </button>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
