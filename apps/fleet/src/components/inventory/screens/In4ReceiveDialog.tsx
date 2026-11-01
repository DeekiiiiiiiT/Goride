/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In4ReceiveDialog() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div className="w-full px-margin-desktop py-space-xl flex flex-col gap-space-xl opacity-40 pointer-events-none select-none filter blur-[1px]">

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <span className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Kingston Operations Central</span>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight mt-0.5">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">What you have, where it is, and what every car is missing.</p>
      </div>
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs bg-surface-container px-space-md py-2 rounded-lg">
      <span className="material-symbols-outlined text-[18px] text-secondary">warehouse</span>
      <span className="font-label-code text-label-code text-on-surface font-semibold">Main store — Kingston</span>
      </div>
      <button type="button" className="bg-primary text-on-primary px-space-lg py-2 rounded-lg font-headline-sm text-body-md flex items-center gap-space-xs shadow-sm">
      <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
      <span>Receive Stock</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter-desktop">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Tracked SKU Count</span>
      <div className="font-label-price text-headline-lg text-on-surface mt-1">1,482</div>
      <div className="font-caption text-caption text-secondary mt-1">Across 4 Jamaican hubs</div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Valuation (Landed J$)</span>
      <div className="font-label-price text-headline-lg text-on-surface mt-1">J$ 38,420,190</div>
      <div className="font-caption text-caption text-secondary mt-1">+4.2% from prior ledger period</div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Serialized Equipment</span>
      <div className="font-label-price text-headline-lg text-on-surface mt-1">426 Units</div>
      <div className="font-caption text-caption text-secondary mt-1">Dashcams, GPS nodes, speed governors</div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Discrepancy Rate</span>
      <div className="font-label-price text-headline-lg text-on-surface mt-1">0.02%</div>
      <div className="font-caption text-caption text-secondary mt-1">Target threshold: {'<'}{' 0.15%'}</div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="p-space-lg bg-surface-container-low flex justify-between items-center">
      <span className="font-headline-sm text-headline-sm text-on-surface">{live.hubName}</span>
      <span className="font-label-code text-caption text-secondary">SYNCED 08:46 PM EST</span>
      </div>
      <div className="divide-y divide-surface-container">
      <div className="grid grid-cols-6 p-space-md font-caption text-caption uppercase text-secondary">
      <span>Item / SKU</span>
      <span>Category</span>
      <span>Bin Location</span>
      <span>Current Count</span>
      <span>Landed Value</span>
      <span>Status</span>
      </div>
      <div className="grid grid-cols-6 p-space-md font-body-sm text-body-sm items-center">
      <div className="font-body-md text-body-md font-medium text-on-surface">Phone Holder Mount <span className="block font-label-code text-caption text-secondary">ACC-PHM-01</span></div>
      <span>Accessories</span>
      <span className="font-label-code text-label-code">BIN-04-A</span>
      <span className="font-label-price text-body-md font-semibold">1 unit</span>
      <span className="font-label-price text-body-md">J$ 5,400.00</span>
      <span className="text-secondary font-body-sm">Active Stock</span>
      </div>
      <div className="grid grid-cols-6 p-space-md font-body-sm text-body-sm items-center">
      <div className="font-body-md text-body-md font-medium text-on-surface">Dash camera <span className="block font-label-code text-caption text-secondary">ELC-DCM-01</span></div>
      <span>Telematics</span>
      <span className="font-label-code text-label-code">SEC-BIN-02</span>
      <span className="font-label-price text-body-md font-semibold">12 units</span>
      <span className="font-label-price text-body-md">J$ 44,500.00</span>
      <span className="text-secondary font-body-sm">Active Stock</span>
      </div>
      </div>
      </div>
      </div>

      <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200"></div>

      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-space-md sm:p-space-lg">

      <div className="bg-surface-container-lowest w-full max-w-[760px] rounded-xl shadow-2xl flex flex-col overflow-hidden my-auto transform transition-all duration-150">

      <div className="px-space-xl pt-space-xl pb-space-lg bg-surface-container-lowest flex items-start justify-between">
      <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded-lg bg-primary-container text-on-primary flex items-center justify-center">
      <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
      </div>
      <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">Receive stock</h2>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Record new inventory items received into storage nodes with cost allocation and serial number tracking.
                </p>
      </div>
      <button type="button" onClick={() => shell.closeModal()} aria-label="Close dialog" className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>

      <div className="px-space-xl py-space-sm flex flex-col gap-space-lg max-h-[calc(88vh-140px)] overflow-y-auto">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md bg-surface-container-low p-space-md rounded-lg">

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption text-secondary uppercase font-semibold tracking-wide">From Source</label>
      <div className="relative">
      <select className="w-full bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded-lg px-space-md py-2 appearance-none focus:outline-none focus:bg-surface-container-lowest">
      <option value="none">No purchase order</option>
      <option value="po-2026-042">Purchase order #PO-2026-042</option>
      <option value="po-2026-039">Purchase order #PO-2026-039</option>
      </select>
      <span className="material-symbols-outlined text-[16px] text-secondary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
      </div>
      <div className="mt-1 flex flex-col gap-1">
      <span className="font-caption text-[10px] text-secondary uppercase">Vendor</span>
      <div className="relative">
      <select className="w-full bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded-lg px-space-md py-1.5 appearance-none focus:outline-none">
      <option>Car Toys Jamaica</option>
      <option>KIG Parts Distribution</option>
      <option>Kingston Auto Electrical Ltd</option>
      </select>
      <span className="material-symbols-outlined text-[14px] text-secondary absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption text-secondary uppercase font-semibold tracking-wide">Into Location</label>
      <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-2 rounded-lg">
      <span className="material-symbols-outlined text-[18px] text-secondary">warehouse</span>
      <div className="flex flex-col min-w-0">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface truncate">Main store — Kingston</span>
      <span className="font-caption text-[10px] text-secondary tracking-tight">Node: JM-KIN-ST01</span>
      </div>
      </div>
      <div className="mt-1 flex items-center gap-space-xs text-secondary font-caption text-caption">
      <span className="material-symbols-outlined text-[14px] text-secondary">lock</span>
      <span>Primary secure lockup</span>
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption text-secondary uppercase font-semibold tracking-wide">Received On</label>
      <div className="relative flex items-center bg-surface-container-lowest rounded-lg px-space-md py-2">
      <span className="material-symbols-outlined text-[18px] text-secondary mr-2">calendar_today</span>
      <input className="bg-transparent font-label-code text-label-code text-on-surface focus:outline-none w-full" readOnly type="text" value="1 Nov 2026"/>
      <span className="font-caption text-[10px] text-secondary font-label-code uppercase tracking-wider bg-surface-container px-1.5 py-0.5 rounded">EST</span>
      </div>
      <div className="mt-1 flex items-center gap-space-xs text-secondary font-caption text-caption">
      <span className="material-symbols-outlined text-[14px] text-secondary">schedule</span>
      <span className="font-label-code text-caption">Logged 08:47 PM EST</span>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Received Lines</span>
      <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded-full font-bold text-on-surface">2 items</span>
      </div>
      <span className="font-caption text-caption text-secondary">FIFO landed valuation auto-apportioned</span>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">

      <div className="grid grid-cols-12 bg-surface-container-low px-space-md py-2.5 font-caption text-caption uppercase text-secondary font-semibold">
      <div className="col-span-4">Item & SKU</div>
      <div className="col-span-2">Qty</div>
      <div className="col-span-2">Unit Price</div>
      <div className="col-span-3">Tracking / Serials</div>
      <div className="col-span-1 text-right">Action</div>
      </div>

      <div className="flex flex-col">

      <div className="grid grid-cols-12 px-space-md py-space-md items-center gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low/40 transition-colors">

      <div className="col-span-4 flex flex-col pr-space-xs">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Phone Holder Mount</span>
      <div className="flex items-center gap-space-xs mt-0.5">
      <span className="font-label-code text-[11px] text-secondary bg-surface-container px-1 rounded">ACC-PHM-01</span>
      <span className="font-caption text-[11px] text-secondary">Standard Fleet Mount</span>
      </div>
      </div>

      <div className="col-span-2">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1.5 w-24">
      <input className="w-full bg-transparent font-label-code text-label-code text-on-surface font-bold focus:outline-none" type="text" value="5"/>
      <span className="font-caption text-caption text-secondary">ea</span>
      </div>
      </div>

      <div className="col-span-2">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1.5">
      <span className="font-label-price text-label-code text-on-surface font-semibold truncate">J$ 5,200.00</span>
      </div>
      </div>

      <div className="col-span-3">
      <div className="inline-flex items-center gap-1 bg-surface-container px-2 py-1 rounded text-secondary">
      <span className="material-symbols-outlined text-[14px]">pin</span>
      <span className="font-caption text-[11px]">Quantity-tracked only</span>
      </div>
      </div>

      <div className="col-span-1 text-right">
      <button type="button" className="w-8 h-8 rounded flex items-center justify-center text-secondary hover:text-error hover:bg-error-container/20 transition-colors ml-auto" title="Remove line">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-12 px-space-md py-space-md items-center gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low/40 transition-colors">

      <div className="col-span-4 flex flex-col pr-space-xs">
      <span className="font-body-md text-body-md font-semibold text-on-surface">Dash camera</span>
      <div className="flex items-center gap-space-xs mt-0.5">
      <span className="font-label-code text-[11px] text-secondary bg-surface-container px-1 rounded">ELC-DCM-01</span>
      <span className="font-caption text-[11px] text-secondary">Dual-Lens 1080p Telematics</span>
      </div>
      </div>

      <div className="col-span-2">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1.5 w-24">
      <input className="w-full bg-transparent font-label-code text-label-code text-on-surface font-bold focus:outline-none" type="text" value="1"/>
      <span className="font-caption text-caption text-secondary">ea</span>
      </div>
      </div>

      <div className="col-span-2">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1.5">
      <span className="font-label-price text-label-code text-on-surface font-semibold truncate">J$ 44,500.00</span>
      </div>
      </div>

      <div className="col-span-3">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1 gap-1">
      <span className="font-label-code text-[11px] text-on-surface font-semibold tracking-wider">[ DC-70A-0042118 ]</span>
      <button type="button" className="ml-auto bg-surface-container-lowest px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5 text-on-surface text-[11px] font-caption hover:bg-surface-container transition-colors" title="Scan Barcode / Serial">
      <span className="material-symbols-outlined text-[13px]">photo_camera</span>
      <span>Scan</span>
      </button>
      </div>
      </div>

      <div className="col-span-1 text-right">
      <button type="button" className="w-8 h-8 rounded flex items-center justify-center text-secondary hover:text-error hover:bg-error-container/20 transition-colors ml-auto" title="Remove line">
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </div>
      </div>
      </div>

      <div className="p-space-sm bg-surface-container-low/50 flex items-center justify-between">
      <button type="button" className="flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-on-surface hover:text-primary px-space-md py-1.5 rounded-lg hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[18px]">add</span>
      <span>Add another item</span>
      </button>
      <div className="flex items-center gap-space-md font-caption text-caption text-secondary pr-space-md">
      <span>Subtotal (2 lines): <strong className="font-label-price text-on-surface font-semibold">J$ 70,500.00</strong></span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-low rounded-xl p-space-md flex flex-col gap-space-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-secondary">local_shipping</span>
      <span className="font-headline-sm text-body-md font-semibold text-on-surface">Extra costs (landed cost allocation)</span>
      </div>
      <span className="font-caption text-caption text-secondary">Spread across lines weighted by item value (FIFO landed valuation)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-1">

      <div className="flex items-center justify-between bg-surface-container-lowest px-space-md py-2 rounded-lg">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px] text-secondary">flight_takeoff</span>
      <span className="font-body-sm text-body-sm text-secondary">Freight & Shipping</span>
      </div>
      <div className="flex items-center gap-1 font-label-price text-label-code text-on-surface font-bold">
      <span>J$</span>
      <input className="w-20 bg-transparent text-right font-label-price text-label-code focus:outline-none" type="text" value="3,500.00"/>
      </div>
      </div>

      <div className="flex items-center justify-between bg-surface-container-lowest px-space-md py-2 rounded-lg">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px] text-secondary">account_balance</span>
      <span className="font-body-sm text-body-sm text-secondary">Customs & Tariffs (Duty)</span>
      </div>
      <div className="flex items-center gap-1 font-label-price text-label-code text-on-surface font-bold">
      <span>J$</span>
      <input className="w-20 bg-transparent text-right font-label-price text-label-code focus:outline-none" type="text" value="2,000.00"/>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-high rounded-xl p-space-md flex flex-col gap-space-xs">
      <div className="flex items-center gap-space-xs text-on-surface">
      <span className="material-symbols-outlined text-[18px] text-on-surface">auto_awesome</span>
      <span className="font-body-md text-body-md font-semibold">What will change</span>
      </div>
      <ul className="flex flex-col gap-1.5 mt-1 font-body-sm text-body-sm text-on-surface">
      <li className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[16px] text-on-surface mt-0.5">arrow_forward</span>
      <span>
      <strong>Main store:</strong> Phone Holder Mount <span className="font-label-code text-caption bg-surface-container-lowest px-1.5 py-0.5 rounded">1 → 6</span> (+5 units)
                    </span>
      </li>
      <li className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[16px] text-on-surface mt-0.5">arrow_forward</span>
      <span>
                      New dash camera <code className="font-label-code text-caption font-bold bg-surface-container-lowest px-1.5 py-0.5 rounded">DC-70A-0042118</code> added to Main store (1 unit)
                    </span>
      </li>
      <li className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[16px] text-on-surface mt-0.5">arrow_forward</span>
      <span>
                      Average cost Phone Holder Mount <span className="font-label-price text-caption">J$ 5,400.00 → J$ 5,348.00</span> (includes apportioned shipping and duty)
                    </span>
      </li>
      </ul>
      </div>
      </div>

      <div className="px-space-xl py-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">

      <div className="flex items-center gap-space-xs text-secondary">
      <span className="material-symbols-outlined text-[16px]">verified</span>
      <span className="font-caption text-caption tracking-tight">Audit note: Creates immutable RECEIVE ledger entry</span>
      </div>

      <div className="flex items-center gap-space-sm w-full sm:w-auto justify-end">
      <button type="button" className="bg-surface-container-lowest text-on-surface px-space-lg py-2 rounded-lg font-headline-sm text-body-md font-semibold hover:bg-surface-container transition-colors shadow-sm">
                  Cancel
                </button>
      <button type="button" className="bg-primary text-on-primary px-space-xl py-2 rounded-lg font-headline-sm text-body-md font-semibold flex items-center gap-space-xs shadow-md hover:bg-primary-container transition-colors">
      <span className="material-symbols-outlined text-[18px]">archive</span>
      <span>Receive</span>
      </button>
      </div>
      </div>
      </div>
      </div>

      <aside aria-label="System notification" className="fixed bottom-6 right-8 z-50 max-w-md bg-inverse-surface text-inverse-on-surface rounded-xl shadow-2xl p-space-md flex items-center justify-between gap-space-md transform transition-all duration-300">
      <div className="flex items-center gap-space-sm">
      <div className="w-6 h-6 rounded-full bg-surface-tint/40 flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-inverse-on-surface text-[16px]">check</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-sm text-body-sm font-medium">Received 2 lines into Main store</span>
      <span className="font-label-code text-caption text-surface-dim">Audit ledger #RCV-8821 verified</span>
      </div>
      </div>
      <button type="button" aria-label="Dismiss toast" className="text-surface-dim hover:text-inverse-on-surface p-1 rounded transition-colors">
      <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
      </aside>
      </div></div>
    </div>
  );
}
