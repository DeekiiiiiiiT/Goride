/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In7KitTemplateEditor() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-surface-container-lowest px-margin-desktop py-space-md shadow-sm">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-md">

      <div className="flex flex-wrap items-center justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary">Asset Governance // KGN-01</span>
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-on-surface"></span>
      <span className="font-label-code text-caption text-secondary">Standard Spec v3.0</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-sm text-body-sm text-on-surface-variant">What you have, where it is, and what every car is missing.</p>
      </div>
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs bg-surface-container px-space-md py-1.5 rounded-lg">
      <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
      <span className="font-label-code text-body-sm font-semibold text-on-surface">Deeki T</span>
      <span className="font-caption text-caption text-secondary uppercase tracking-tight">(platform_owner)</span>
      </div>
      <button type="button" className="bg-primary text-on-primary font-body-sm px-space-md py-1.5 rounded-lg flex items-center gap-space-xs shadow-sm hover:opacity-90 transition-opacity">
      <span className="material-symbols-outlined text-[16px]">add</span>
      <span>New kit template</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto py-1">
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors">Overview</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors">Stock</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm font-semibold text-on-primary bg-primary shadow-sm flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
      <span>Vehicle kits</span>
      </button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors">Assets</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors">Movements</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors">Purchasing</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors">Counts</button>
      <button type="button" className="px-space-md py-1.5 rounded-lg font-body-sm text-secondary hover:text-on-surface hover:bg-surface-container transition-colors flex items-center gap-space-xs">
      <span>Alerts</span>
      <span className="bg-error text-on-error font-label-code text-[10px] font-bold px-1.5 py-0.2 rounded-full">5</span>
      </button>
      </div>

      <div className="flex items-center gap-space-sm pt-space-xs">
      <div className="inline-flex p-1 bg-surface-container rounded-lg">
      <button type="button" className="px-space-md py-1 rounded font-body-sm text-secondary hover:text-on-surface transition-colors">Cars</button>
      <button type="button" className="px-space-md py-1 rounded bg-surface-container-lowest font-body-sm font-semibold text-on-surface shadow-sm">Kit templates</button>
      </div>
      <span className="font-caption text-caption text-secondary">Editing Master Specifications</span>
      </div>
      </div>
      </div>

      <div className="w-full px-margin-desktop py-space-xl">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-xl">

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[26px]">cases</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">Rideshare car kit</h2>
      <span className="font-label-code text-[11px] bg-surface-container px-2 py-0.5 rounded font-bold text-on-surface">Editing v3</span>
      <span className="font-label-code text-[11px] bg-secondary-container text-on-secondary-fixed font-semibold px-2 py-0.5 rounded">Active Standard</span>
      </div>
      <p className="font-label-code text-caption text-secondary mt-0.5">
                    Rideshare car kit · 10 items + 1 optional · used by 2 cars · version 3 (drafting changes)
                  </p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm px-space-md py-2 rounded-lg flex items-center gap-space-xs transition-colors">
      <span className="material-symbols-outlined text-[16px]">history</span>
      <span>Compare with v2</span>
      </button>
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm px-space-md py-2 rounded-lg flex items-center gap-space-xs transition-colors">
      <span className="material-symbols-outlined text-[16px]">file_download</span>
      <span>Export Spec (PDF)</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

      <div className="lg:col-span-8 flex flex-col gap-space-xl">

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Template Parameters</h3>
      <span className="font-caption text-caption text-secondary uppercase font-semibold">UUID: TPL-RSH-003</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption uppercase text-secondary font-bold tracking-wider" htmlFor="tpl-name">Template Name</label>
      <div className="relative">
      <input className="w-full bg-surface-container-low text-on-surface font-body-md px-space-md py-2 rounded-lg focus:outline-none focus:bg-surface-container-lowest" data-stitch-id="tpl-name" type="text" value="Rideshare car kit"/>
      <span className="material-symbols-outlined absolute right-3 top-2.5 text-[16px] text-secondary">edit</span>
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption uppercase text-secondary font-bold tracking-wider" htmlFor="body-type">Target Body Type</label>
      <div className="relative">
      <select className="w-full appearance-none bg-surface-container-low text-on-surface font-body-md px-space-md py-2 rounded-lg focus:outline-none focus:bg-surface-container-lowest cursor-pointer" data-stitch-id="body-type">
      <option>Any body type</option>
      <option>Hatchback (5-Door)</option>
      <option>Sedan (Compact / Midsize)</option>
      <option>Minivan / Small MPV</option>
      <option>Utility Van</option>
      </select>
      <span className="material-symbols-outlined absolute right-3 top-2.5 text-[16px] text-secondary pointer-events-none">expand_more</span>
      </div>
      </div>

      <div className="md:col-span-2 flex flex-col gap-1.5">
      <label className="font-caption text-caption uppercase text-secondary font-bold tracking-wider">Service Allocation Type</label>
      <div className="flex items-center gap-space-sm flex-wrap">
      <button type="button" className="bg-primary text-on-primary font-body-sm font-semibold px-space-lg py-2 rounded-lg shadow-sm flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">local_taxi</span>
      <span>Rideshare</span>
      </button>
      <button type="button" className="bg-surface-container text-on-surface font-body-sm px-space-lg py-2 rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">local_shipping</span>
      <span>Delivery</span>
      </button>
      <button type="button" className="bg-surface-container text-on-surface font-body-sm px-space-lg py-2 rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">shield_person</span>
      <span>Executive</span>
      </button>
      <span className="font-caption text-caption text-secondary ml-space-sm">Applied to all on-demand passenger fleet contracts</span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-space-lg flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-lowest">
      <div>
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Equipment Lines</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Mandatory and auxiliary hardware provisioned to driver handoff.</p>
      </div>
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption bg-surface-container px-2.5 py-1 rounded text-on-surface">9 Lines Configured</span>
      <span className="font-label-code text-caption bg-surface-container-high px-2.5 py-1 rounded text-on-surface">J$ 41,200 Total Landed Val</span>
      </div>
      </div>

      <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-secondary font-caption uppercase tracking-wider text-[11px]">
      <th className="py-2.5 px-3 w-8 text-center"></th>
      <th className="py-2.5 px-4 font-semibold">Item & SKU</th>
      <th className="py-2.5 px-3 font-semibold text-center w-20">Qty</th>
      <th className="py-2.5 px-4 font-semibold w-32">Designation</th>
      <th className="py-2.5 px-4 font-semibold">Location In Vehicle</th>
      <th className="py-2.5 px-3 text-center w-12 font-semibold">Action</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container">

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">tire_repair</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Spare tyre</div>
      <div className="font-label-code text-caption text-secondary">TYR-SPR-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Boot wheel well</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">build</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Car jack</div>
      <div className="font-label-code text-caption text-secondary">TLS-JCK-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Boot tool compartment</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">home_repair_service</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Lug wrench</div>
      <div className="font-label-code text-caption text-secondary">TLS-WRN-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Boot tool compartment</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">mode_fan</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Tyre pump</div>
      <div className="font-label-code text-caption text-secondary">TLS-PMP-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Boot side netting</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">smartphone</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Phone Holder Mount</div>
      <div className="font-label-code text-caption text-secondary">ACC-PHM-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Dashboard</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">medical_services</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">First-aid kit</div>
      <div className="font-label-code text-caption text-secondary">SAF-FAK-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Glove compartment</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">warning</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Warning triangle</div>
      <div className="font-label-code text-caption text-secondary">SAF-TRG-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Boot hatch strap</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">videocam</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Dash camera</div>
      <div className="font-label-code text-caption text-secondary">ELC-DCM-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-bold bg-primary text-on-primary">
                              Required
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Windscreen rearview mount</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>

      <tr className="hover:bg-surface-container-low/50 transition-colors">
      <td className="py-3 px-3 text-center cursor-grab text-secondary hover:text-on-surface">
      <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[15px]">fire_extinguisher</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Fire extinguisher</div>
      <div className="font-label-code text-caption text-secondary">SAF-EXT-01</div>
      </div>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <span className="font-label-code text-body-sm font-semibold text-on-surface">1 ea</span>
      </td>
      <td className="py-3 px-4">
      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium bg-surface-container text-secondary">
                              Optional
                            </span>
      </td>
      <td className="py-3 px-4">
      <div className="flex items-center gap-1.5 text-on-surface">
      <span className="material-symbols-outlined text-[15px] text-secondary">pin_drop</span>
      <span className="font-body-sm">Under passenger seat</span>
      </div>
      </td>
      <td className="py-3 px-3 text-center">
      <button type="button" className="text-secondary hover:text-error transition-colors p-1 rounded">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </td>
      </tr>
      </tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container-low/30 flex items-center justify-between">
      <button type="button" className="bg-surface-container-lowest text-on-surface hover:bg-surface-container font-body-sm font-medium px-space-md py-2 rounded-lg shadow-sm flex items-center gap-space-xs transition-colors">
      <span className="material-symbols-outlined text-[18px]">add_circle</span>
      <span>Add equipment line</span>
      </button>
      <span className="font-caption text-caption text-secondary">Drag handle on left to reorder checklist sequence</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div>
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Linked records</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Auto-bind operational credentials and digital hub peripherals upon vehicle kit allocation.</p>
      </div>
      <span className="font-label-code text-caption bg-surface-container px-2.5 py-1 rounded text-on-surface">2 Active Integrations</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">

      <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-on-surface shadow-sm">
      <span className="material-symbols-outlined text-[20px]">nfc</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Toll tag</div>
      <div className="font-caption text-caption text-secondary">from Toll tags database</div>
      </div>
      </div>

      <div className="relative inline-flex items-center cursor-pointer">
      <div className="w-11 h-6 bg-primary rounded-full transition-colors"></div>
      <div className="absolute left-6 top-1 w-4 h-4 bg-surface-container-lowest rounded-full transition-transform"></div>
      </div>
      </div>

      <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-space-md">
      <div className="w-9 h-9 rounded-lg bg-surface-container-lowest flex items-center justify-center text-on-surface shadow-sm">
      <span className="material-symbols-outlined text-[20px]">credit_card</span>
      </div>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Fuel card</div>
      <div className="font-caption text-caption text-secondary">from Fuel cards ledger</div>
      </div>
      </div>

      <div className="relative inline-flex items-center cursor-pointer">
      <div className="w-11 h-6 bg-primary rounded-full transition-colors"></div>
      <div className="absolute left-6 top-1 w-4 h-4 bg-surface-container-lowest rounded-full transition-transform"></div>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm text-secondary">
      <span className="material-symbols-outlined text-[18px]">info</span>
      <span className="font-caption text-caption">Saving creates an immutable revision hash on Kingston Cluster #01</span>
      </div>
      <div className="flex items-center gap-space-md">
      <button type="button" className="text-secondary hover:text-on-surface font-body-sm px-space-md py-2 transition-colors">
                      Cancel
                    </button>
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm font-semibold px-space-lg py-2 rounded-lg transition-colors">
                      Save as draft
                    </button>
      <button type="button" className="bg-primary text-on-primary font-body-sm font-semibold px-space-xl py-2 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-space-xs" >
      <span className="material-symbols-outlined text-[16px]">save</span>
      <span>Save as new version</span>
      </button>
      </div>
      </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-space-xl">

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Version history</h3>
      <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded text-secondary">3 Releases</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Revision logs are cryptographically tracked against platform auditor IDs.
                  </p>

      <div className="relative pl-6 space-y-space-lg">

      <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-surface-container"></div>

      <div className="relative flex items-start gap-space-sm">
      <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-surface-container-lowest"></div>
      <div className="flex flex-col">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-body-sm font-bold text-on-surface">v3</span>
      <span className="font-caption text-caption text-secondary">· 1 Nov 2026</span>
      </div>
      <div className="font-body-sm font-medium text-on-surface">added Warning triangle</div>
      <div className="font-caption text-caption text-secondary">Author: Deeki T (Authorizer)</div>
      <span className="font-label-code text-[11px] text-on-primary-fixed bg-surface-container px-2 py-0.5 rounded self-start mt-1">Pending Sync</span>
      </div>
      </div>

      <div className="relative flex items-start gap-space-sm">
      <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-secondary ring-4 ring-surface-container-lowest"></div>
      <div className="flex flex-col">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-body-sm font-bold text-on-surface">v2</span>
      <span className="font-caption text-caption text-secondary">· 14 Aug 2025</span>
      </div>
      <div className="font-body-sm text-on-surface">added Dash camera</div>
      <div className="font-caption text-caption text-secondary">Author: —</div>
      <span className="font-label-code text-[11px] text-secondary bg-surface-container-low px-2 py-0.5 rounded self-start mt-1">Production (Live)</span>
      </div>
      </div>

      <div className="relative flex items-start gap-space-sm">
      <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-surface-dim ring-4 ring-surface-container-lowest"></div>
      <div className="flex flex-col">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-body-sm font-bold text-on-surface">v1</span>
      <span className="font-caption text-caption text-secondary">· 10 Jan 2025</span>
      </div>
      <div className="font-body-sm text-on-surface">Initial release</div>
      <div className="font-caption text-caption text-secondary">Author: Deeki T</div>
      <span className="font-label-code text-[11px] text-secondary bg-surface-container-low px-2 py-0.5 rounded self-start mt-1">Archived Spec</span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Active Cars</h3>
      <span className="font-label-code text-caption font-bold text-on-surface bg-surface-container px-2 py-0.5 rounded">2 Active</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Vehicles bound to this template specification currently operating in Kingston:
                  </p>
      <div className="space-y-space-sm pt-space-xs">

      <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-secondary">directions_car</span>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Toyota Roomy</div>
      <div className="font-label-plate text-caption text-secondary">{live.primaryPlate}</div>
      </div>
      </div>
      <div className="text-right">
      <span className="font-label-code text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded font-medium">on v2</span>
      <div className="font-caption text-[11px] text-error flex items-center justify-end gap-0.5 mt-0.5">
      <span className="material-symbols-outlined text-[13px]">warning</span> Missing Triangle
                        </div>
      </div>
      </div>

      <div className="bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[20px] text-secondary">directions_car</span>
      <div>
      <div className="font-body-sm font-semibold text-on-surface">Honda Fit</div>
      <div className="font-label-plate text-caption text-secondary">{live.secondaryPlate}</div>
      </div>
      </div>
      <div className="text-right">
      <span className="font-label-code text-[11px] bg-surface-container text-on-surface px-2 py-0.5 rounded font-medium">on v2</span>
      <div className="font-caption text-[11px] text-secondary mt-0.5">Compliance OK</div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container p-space-md rounded-lg flex items-start gap-space-sm mt-space-sm">
      <span className="material-symbols-outlined text-[18px] text-on-surface shrink-0 mt-0.5">sync_problem</span>
      <p className="font-caption text-caption text-on-surface leading-relaxed">
                      Deploying version 3 will mark both vehicles as <strong>Pending Verification</strong> until the physical equipment inspection is acknowledged at {live.hubShort}.
                    </p>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <h4 className="font-body-sm font-bold text-on-surface uppercase tracking-wider">Fleet Readiness Score</h4>
      <span className="font-label-code text-body-sm font-bold text-on-surface">91%</span>
      </div>

      <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
      <div className="bg-primary h-full rounded-full" style={{ width: "91%" }}></div>
      </div>
      <div className="grid grid-cols-2 gap-space-sm pt-space-xs text-center font-label-code text-caption text-secondary">
      <div className="bg-surface-container-low py-1.5 rounded">Required: 8/8 Fulfilled</div>
      <div className="bg-surface-container-low py-1.5 rounded">Optional: 1/1 Pending</div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary/40 backdrop-blur-[2px]" data-stitch-id="migration-modal">
      <div className="bg-surface-container-lowest max-w-md w-full rounded-xl p-space-xl shadow-2xl flex flex-col gap-space-lg transform transition-all">
      <div className="flex items-start gap-space-md">
      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center shrink-0 text-on-surface">
      <span className="material-symbols-outlined text-[24px]">published_with_changes</span>
      </div>
      <div>
      <span className="font-label-code text-[11px] uppercase tracking-wider text-secondary font-bold">Migration Confirmation</span>
      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface mt-0.5">2 cars use this kit. Move them to version 3?</h3>
      </div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Publishing revision <strong>v3</strong> will flag <strong>Toyota Roomy ({live.primaryPlate})</strong> and <strong>Honda Fit ({live.secondaryPlate})</strong> with updated equipment check requirements (adding Warning triangle). Hub dispatchers will receive an inspection notice.
            </p>
      <div className="bg-surface-container-low p-space-md rounded-lg space-y-1">
      <div className="flex justify-between font-label-code text-caption text-on-surface">
      <span>Target Spec:</span>
      <span className="font-bold">Rideshare car kit (v3)</span>
      </div>
      <div className="flex justify-between font-label-code text-caption text-secondary">
      <span>Automated Work Orders:</span>
      <span>Generate 2 kit upgrade tickets</span>
      </div>
      </div>
      <div className="flex items-center justify-end gap-space-md pt-space-xs">
      <button type="button" className="bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm font-semibold px-space-lg py-2 rounded-lg transition-colors" >
                Not now
              </button>
      <button type="button" className="bg-primary text-on-primary font-body-sm font-semibold px-space-xl py-2 rounded-lg shadow-sm hover:opacity-90 transition-opacity flex items-center gap-space-xs" >
      <span className="material-symbols-outlined text-[16px]">check_circle</span>
      <span>Move 2 cars</span>
      </button>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
