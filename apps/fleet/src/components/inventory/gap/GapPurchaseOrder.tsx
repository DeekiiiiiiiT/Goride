/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapPurchaseOrder(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="PurchaseOrder">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">

        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md">
        <a className="inline-flex items-center gap-space-xs text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors group" href="#">
        <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span>Purchasing</span>
        </a>
        <span className="text-surface-variant">/</span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">New Purchase Order</h1>
        <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-0.5 rounded">
        <span className="material-symbols-outlined text-[15px] text-on-surface-variant">tag</span>
        <span className="font-label-code text-label-code text-on-surface font-bold tracking-tight">PO-0004</span>
        </div>
        <span className="bg-surface-container-high text-on-surface font-caption text-caption uppercase px-space-sm py-0.5 rounded font-semibold tracking-wider">
                    Draft
                  </span>
        </div>

        <div className="flex items-center gap-space-lg">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption">
        <span className="material-symbols-outlined text-[16px] text-surface-tint">schedule</span>
        <span>Created today, 14:32 EST by JD</span>
        </div>
        <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-1 rounded">
        <span className="w-2 h-2 rounded-full bg-secondary"></span>
        <span className="font-label-code text-caption text-on-surface-variant">Unsaved Changes</span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-low rounded-lg p-space-md">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-space-sm items-center">

        <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-sm rounded shadow-sm">
        <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-[11px] font-bold">
                      1
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-headline-sm text-body-sm text-on-surface font-semibold truncate leading-none">Draft</span>
        <span className="font-caption text-[10px] text-on-surface-variant mt-0.5">Editing</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded opacity-80">
        <div className="w-5 h-5 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">
                      2
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate leading-none">Awaiting approval</span>
        <span className="font-caption text-[10px] text-on-surface-variant mt-0.5">Threshold check</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded opacity-50">
        <div className="w-5 h-5 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">
                      3
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate leading-none">Ordered</span>
        <span className="font-caption text-[10px] text-on-surface-variant mt-0.5">Supplier sent</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded opacity-50">
        <div className="w-5 h-5 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">
                      4
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate leading-none">Part received</span>
        <span className="font-caption text-[10px] text-on-surface-variant mt-0.5">Dock partial</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm px-space-md py-space-sm rounded opacity-50">
        <div className="w-5 h-5 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">
                      5
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate leading-none">Received</span>
        <span className="font-caption text-[10px] text-on-surface-variant mt-0.5">Full intake</span>
        </div>
        </div>

        <div className="flex items-center justify-between px-space-md py-space-sm rounded opacity-50">
        <div className="flex items-center gap-space-sm min-w-0">
        <div className="w-5 h-5 rounded-full bg-surface-variant text-on-surface-variant flex items-center justify-center font-label-code text-[11px]">
                        6
                      </div>
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate leading-none">Closed</span>
        </div>
        <span className="font-caption text-[10px] text-error font-medium px-1 rounded bg-error-container/40">or Cancelled</span>
        </div>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

        <div className="lg:col-span-8 flex flex-col gap-space-xl">

        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">domain</span>
        <span className="font-headline-sm text-body-md text-on-surface font-semibold uppercase tracking-wider text-[12px]">Fulfillment & Vendor Baseline</span>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Hub Default: Kingston Depot A</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">

        <div className="flex flex-col gap-space-xs">
        <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">
                        Vendor <span className="text-error">*</span>
        </label>
        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">Kingston Auto Supplies</span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
        </div>
        <div className="flex items-center justify-between text-on-surface-variant font-label-code text-caption">
        <span className="flex items-center gap-1">
        <span className="material-symbols-outlined text-[13px]">call</span>
                            876-555-0142
                          </span>
        <span className="bg-surface-container-high text-on-surface font-caption text-[10px] px-1.5 py-0.5 rounded font-medium">
                            Usually 5 days
                          </span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">
                        Ship To Location <span className="text-error">*</span>
        </label>
        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">Main store — Kingston</span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">warehouse</span>
        </div>
        <p className="font-caption text-caption text-on-surface-variant truncate">
                          Terminal 3, Marcus Garvey Dr, Kingston 11
                        </p>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">
                          Expected Delivery <span className="text-error">*</span>
        </label>
        <span className="font-caption text-[10px] text-surface-tint">5d lead time</span>
        </div>
        <div className="bg-surface-container-low rounded-lg p-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">event</span>
        <input className="bg-transparent font-label-code text-body-sm text-on-surface focus:outline-none w-full font-semibold cursor-pointer" readOnly="" type="text" value="6 Nov 2026"/>
        </div>
        <span className="font-caption text-[11px] text-on-surface-variant bg-surface-container-highest px-1.5 py-0.5 rounded font-mono">Fri</span>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-space-xl flex flex-wrap items-center justify-between gap-space-md">
        <div>
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[18px] text-on-surface">layers</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Order Line Items</h2>
        </div>
        <p className="font-body-sm text-caption text-on-surface-variant mt-0.5">Add vehicle spare parts or stock safety accessories for this replenishment batch.</p>
        </div>

        <div className="flex items-center gap-space-sm">
        <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-1.5 rounded-lg">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">search</span>
        <input className="bg-transparent font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none w-48" placeholder="Lookup part SKU or barcode..." type="text"/>
        </div>
        <button type="button" className="bg-primary text-on-primary hover:bg-on-surface font-body-sm text-body-sm font-medium px-space-md py-1.5 rounded-lg flex items-center gap-space-xs transition-colors">
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>Add Item</span>
        </button>
        </div>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-left">
        <thead>
        <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-md px-space-xl font-semibold">Item & Part SKU</th>
        <th className="py-space-md px-space-md font-semibold text-center">Ordered Qty</th>
        <th className="py-space-md px-space-lg font-semibold text-right">Unit Price (J$)</th>
        <th className="py-space-md px-space-xl font-semibold text-right">Line Total (J$)</th>
        <th className="py-space-md px-space-md font-semibold text-center w-12">Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">

        <tr className="hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-lg px-space-xl">
        <div className="flex items-center gap-space-md">
        <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[20px]">air</span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-md text-body-md text-on-surface font-semibold">Tyre pump</span>
        <div className="flex items-center gap-space-xs mt-0.5">
        <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-1 rounded">ACC-TYP-01</span>
        <span className="font-caption text-caption text-on-surface-variant">· Heavy duty 12V</span>
        </div>
        </div>
        </div>
        </td>
        <td className="py-space-lg px-space-md text-center">
        <div className="inline-flex items-center gap-space-xs bg-surface-container-low rounded p-1">
        <button type="button" className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
        <span className="material-symbols-outlined text-[14px]">remove</span>
        </button>
        <span className="font-label-code text-body-sm font-semibold text-on-surface px-space-xs">2</span>
        <button type="button" className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
        <span className="material-symbols-outlined text-[14px]">add</span>
        </button>
        </div>
        </td>
        <td className="py-space-lg px-space-lg text-right font-label-price text-label-price text-on-surface">
                            J$ 6,500.00
                          </td>
        <td className="py-space-lg px-space-xl text-right font-label-price text-label-price text-on-surface font-bold">
                            J$ 13,000.00
                          </td>
        <td className="py-space-lg px-space-md text-center">
        <button type="button" className="text-on-surface-variant hover:text-error transition-colors p-1 rounded hover:bg-surface-container">
        <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
        </td>
        </tr>

        <tr className="hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-lg px-space-xl">
        <div className="flex items-center gap-space-md">
        <div className="w-9 h-9 rounded bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[20px]">medical_services</span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-md text-body-md text-on-surface font-semibold">First-aid kit</span>
        <div className="flex items-center gap-space-xs mt-0.5">
        <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-1 rounded">SAF-FAK-01</span>
        <span className="font-caption text-caption text-on-surface-variant">· Carib Standard Compliant</span>
        </div>
        </div>
        </div>
        </td>
        <td className="py-space-lg px-space-md text-center">
        <div className="inline-flex items-center gap-space-xs bg-surface-container-low rounded p-1">
        <button type="button" className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
        <span className="material-symbols-outlined text-[14px]">remove</span>
        </button>
        <span className="font-label-code text-body-sm font-semibold text-on-surface px-space-xs">2</span>
        <button type="button" className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface">
        <span className="material-symbols-outlined text-[14px]">add</span>
        </button>
        </div>
        </td>
        <td className="py-space-lg px-space-lg text-right font-label-price text-label-price text-on-surface">
                            J$ 3,200.00
                          </td>
        <td className="py-space-lg px-space-xl text-right font-label-price text-label-price text-on-surface font-bold">
                            J$ 6,400.00
                          </td>
        <td className="py-space-lg px-space-md text-center">
        <button type="button" className="text-on-surface-variant hover:text-error transition-colors p-1 rounded hover:bg-surface-container">
        <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
        </td>
        </tr>
        </tbody>
        </table>
        </div>
        <div className="p-space-lg bg-surface-container-low flex items-center justify-between">
        <span className="font-caption text-caption text-on-surface-variant">Total Units: 4 items across 2 SKUs</span>
        <div className="flex items-center gap-space-sm font-body-sm text-body-sm">
        <span className="text-on-surface-variant">Items Subtotal:</span>
        <span className="font-label-price font-bold text-on-surface">J$ 19,400.00</span>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col gap-space-md p-space-xl">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
        <div>
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[18px] text-on-surface">attach_money</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Extra Costs (Landed Cost Surcharges)</h2>
        </div>
        <p className="font-body-sm text-caption text-on-surface-variant mt-0.5">Customs duties, wharfage, carrier freight, and clearing agent brokerage fees.</p>
        </div>
        <button type="button" className="bg-surface-container-high hover:bg-surface-variant text-on-surface font-body-sm text-body-sm font-medium px-space-md py-1.5 rounded-lg flex items-center gap-space-xs transition-colors">
        <span className="material-symbols-outlined text-[18px]">add_circle</span>
        <span>+ Add Extra Cost</span>
        </button>
        </div>

        <div className="bg-surface-container-low rounded-lg p-space-md flex items-start gap-space-md">
        <span className="material-symbols-outlined text-[18px] text-surface-tint mt-0.5">info</span>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm text-on-surface font-medium">True Landed Allocation Notice</span>
        <span className="font-caption text-caption text-on-surface-variant">These are spread across the items so stock cost is the real landed cost. Apportionment is weighted by base monetary volume.</span>
        </div>
        </div>

        <div className="overflow-x-auto mt-space-sm">
        <table className="w-full text-left">
        <thead>
        <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-md px-space-lg font-semibold">Cost Type</th>
        <th className="py-space-md px-space-lg font-semibold">Label / Description</th>
        <th className="py-space-md px-space-lg font-semibold">Paid To</th>
        <th className="py-space-md px-space-lg font-semibold text-right">Amount (J$)</th>
        <th className="py-space-md px-space-md font-semibold text-center w-12">Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">
        <tr className="hover:bg-surface-container-low/50 transition-colors">
        <td className="py-space-md px-space-lg">
        <span className="bg-primary-container text-on-primary font-caption text-caption font-semibold px-space-sm py-0.5 rounded tracking-wide uppercase">
                              Customs
                            </span>
        </td>
        <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface font-medium">
                            Duty and GCT
                          </td>
        <td className="py-space-md px-space-lg font-body-sm text-body-sm text-on-surface-variant">
                            Jamaica Customs Agency
                          </td>
        <td className="py-space-md px-space-lg text-right font-label-price text-label-price text-on-surface font-bold">
                            J$ 2,400.00
                          </td>
        <td className="py-space-md px-space-md text-center">
        <button type="button" className="text-on-surface-variant hover:text-error transition-colors p-1 rounded hover:bg-surface-container">
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </td>
        </tr>
        </tbody>
        </table>
        </div>
        </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-space-lg">

        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-xl flex flex-col gap-space-lg">
        <div className="flex items-center justify-between pb-space-sm">
        <span className="font-headline-sm text-body-lg text-on-surface font-semibold">Order Summary</span>
        <span className="bg-surface-container text-on-surface-variant font-caption text-caption px-space-sm py-0.5 rounded uppercase font-semibold tracking-wider">
                      PO Balance
                    </span>
        </div>

        <div className="flex flex-col gap-space-sm text-body-sm">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span>Items Subtotal</span>
        <span className="font-label-price text-label-price text-on-surface">J$ 19,400.00</span>
        </div>
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="flex items-center gap-1">
        <span>Landed Surcharge</span>
        <span className="material-symbols-outlined text-[14px] text-surface-tint">help_outline</span>
        </span>
        <span className="font-label-price text-label-price text-on-surface">+ J$ 2,400.00</span>
        </div>
        <div className="flex items-center justify-between text-on-surface-variant">
        <span>Estimated Tax (GCT 15%)</span>
        <span className="font-label-price text-caption text-on-surface-variant">Included in Customs</span>
        </div>
        <div className="h-px bg-surface-container my-space-xs"></div>
        <div className="flex items-baseline justify-between pt-space-xs">
        <div className="flex flex-col">
        <span className="font-headline-sm text-body-sm text-on-surface font-semibold">Grand Total</span>
        <span className="font-caption text-[11px] text-on-surface-variant">Landed liability (JMD)</span>
        </div>
        <span className="font-label-price text-headline-lg font-bold text-on-surface tracking-tight">
                        J$ 21,800.00
                      </span>
        </div>

        <div className="mt-space-sm pt-space-sm flex items-center justify-between bg-surface-container-low rounded-lg p-space-md">
        <span className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Payment Status</span>
        <span className="bg-surface-variant text-on-surface-variant font-label-code text-caption font-bold px-space-sm py-0.5 rounded">
                        Unpaid
                      </span>
        </div>
        </div>

        <div className="bg-surface-container-low rounded-lg p-space-md flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
        <span className="font-headline-sm text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Unit Landed Breakdown</span>
        <span className="font-caption text-[10px] text-surface-tint">Proportional</span>
        </div>

        <div className="bg-surface-container-lowest rounded p-space-sm flex flex-col gap-1 shadow-sm">
        <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">Tyre pump</span>
        <span className="font-label-price text-body-sm font-bold text-on-surface">J$ 7,304.12</span>
        </div>
        <div className="flex items-center justify-between font-caption text-[11px] text-on-surface-variant">
        <span>Base J$ 6,500.00</span>
        <span>+ Surcharge J$ 804.12</span>
        </div>

        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mt-1">
        <div className="bg-primary h-full rounded-full" style="width: 89%;"></div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded p-space-sm flex flex-col gap-1 shadow-sm">
        <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">First-aid kit</span>
        <span className="font-label-price text-body-sm font-bold text-on-surface">J$ 3,595.88</span>
        </div>
        <div className="flex items-center justify-between font-caption text-[11px] text-on-surface-variant">
        <span>Base J$ 3,200.00</span>
        <span>+ Surcharge J$ 395.88</span>
        </div>

        <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden mt-1">
        <div className="bg-primary h-full rounded-full" style="width: 89%;"></div>
        </div>
        </div>
        <p className="font-caption text-[11px] text-on-surface-variant leading-relaxed">
                      * Unit inventory balance will be debited at true landed cost upon warehouse receiving.
                    </p>
        </div>

        <div className="bg-tertiary-fixed rounded-lg p-space-md flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-[20px] text-on-tertiary-fixed mt-0.5">warning</span>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm text-on-tertiary-fixed font-semibold">Approval Required</span>
        <span className="font-caption text-caption text-on-tertiary-fixed mt-0.5 leading-snug">
                        Over J$ 20,000 — this PO needs managerial approval before it is transmitted to the vendor.
                      </span>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm pt-space-xs">
        <button type="button" className="w-full bg-primary hover:bg-on-surface text-on-primary font-body-sm text-body-sm font-semibold py-space-md rounded-lg flex items-center justify-center gap-space-xs shadow transition-all active:scale-[0.99]">
        <span className="material-symbols-outlined text-[18px]">verified_user</span>
        <span>Send for Approval</span>
        </button>
        <div className="grid grid-cols-2 gap-space-sm">
        <button type="button" className="bg-surface-container hover:bg-surface-variant text-on-surface font-body-sm text-body-sm font-medium py-space-sm rounded-lg flex items-center justify-center gap-space-xs transition-colors">
        <span className="material-symbols-outlined text-[16px]">save</span>
        <span>Save Draft</span>
        </button>
        <button type="button" className="bg-surface-container hover:bg-error-container hover:text-error text-on-surface font-body-sm text-body-sm font-medium py-space-sm rounded-lg flex items-center justify-center gap-space-xs transition-colors">
        <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
        <span>Discard</span>
        </button>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm p-space-lg flex flex-col gap-space-md">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase font-semibold">
        <span className="material-symbols-outlined text-[16px]">local_shipping</span>
        <span>Delivery Facility Telemetry</span>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined">map</span>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">Depot Bay 04 - Marcus Garvey</span>
        <span className="font-caption text-caption text-on-surface-variant">Gate code: ROAM-KG-92</span>
        </div>
        </div>
        <div className="bg-surface-container-low rounded p-space-sm flex items-center justify-between text-caption font-label-code">
        <span className="text-on-surface-variant">Carrier Routing:</span>
        <span className="text-on-surface font-semibold">Direct Inland Haulage</span>
        </div>
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
