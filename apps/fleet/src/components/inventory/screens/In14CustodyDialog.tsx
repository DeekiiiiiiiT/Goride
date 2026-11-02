/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn14CustodyForm } from './hooks/useIn14CustodyForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { firstAssetSerial, strField } from '../inventoryData';
export function In14CustodyDialog() {
  const form = useIn14CustodyForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const asset = live.selectedAsset ?? live.assets[0] ?? null;
  const serial = asset
    ? strField(asset, 'serial_number', strField(asset, 'serial_no', '—'))
    : firstAssetSerial(live.assets);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div className="w-full px-margin-desktop py-space-lg select-none opacity-40 filter blur-[2px] pointer-events-none transition-all duration-300">

      <div className="flex items-center justify-between pb-space-lg">
      <div className="flex flex-col">
      <div className="flex items-center gap-space-sm">
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary">Asset Custody Ledger</span>
      <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
      <span className="font-label-code text-caption text-secondary">Warehouse 01 · Kingston Central</span>
      </div>
      <div className="font-headline-lg text-headline-lg text-on-surface">Inventory Management</div>
      </div>
      <div className="flex items-center gap-space-sm">
      <div className="h-9 px-space-md bg-surface-container-lowest rounded shadow-sm flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[18px] text-secondary">filter_list</span>
      <span className="font-body-sm text-body-sm text-on-surface">Filter Stock</span>
      </div>
      <div className="h-9 px-space-lg bg-primary text-on-primary rounded flex items-center gap-space-xs font-body-sm text-body-sm font-semibold">
      <span className="material-symbols-outlined text-[18px]">add</span>
      <span>New Stock Receipt</span>
      </div>
      </div>
      </div>

      <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="grid grid-cols-12 px-space-lg py-space-sm bg-surface-container-low font-caption text-caption text-secondary uppercase tracking-wider font-semibold">
      <div className="col-span-3">Item / SKU</div>
      <div className="col-span-2">Tracking / Serial</div>
      <div className="col-span-2">Bin Location</div>
      <div className="col-span-1 text-right">In Hand</div>
      <div className="col-span-2 text-right">Landed Unit Val</div>
      <div className="col-span-2 text-right">Actions</div>
      </div>

      <div className="grid grid-cols-12 px-space-lg py-space-md items-center bg-surface-container-lowest">
      <div className="col-span-3 flex items-center gap-space-sm">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-secondary">
      <span className="material-symbols-outlined text-[18px]">videocam</span>
      </div>
      <div>
      <div className="font-body-md text-body-md font-semibold text-on-surface">Dual-Lens Telematics Dashcam</div>
      <div className="font-label-code text-caption text-secondary">ELC-DCM-01</div>
      </div>
      </div>
      <div className="col-span-2 font-label-code text-label-code text-on-surface">{serial}</div>
      <div className="col-span-2 font-body-sm text-body-sm text-secondary">Main Store — Cage A</div>
      <div className="col-span-1 text-right font-label-code text-label-code font-bold text-on-surface">1 ea</div>
      <div className="col-span-2 text-right font-label-price text-label-price text-on-surface">{form.valueLabel}</div>
      <div className="col-span-2 flex justify-end gap-space-xs">
      <span className="px-space-sm py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">Write-off</span>
      </div>
      </div>

      <div className="grid grid-cols-12 px-space-lg py-space-md items-center bg-surface-container-low/40">
      <div className="col-span-3 flex items-center gap-space-sm">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-secondary">
      <span className="material-symbols-outlined text-[18px]">tire_repair</span>
      </div>
      <div>
      <div className="font-body-md text-body-md font-semibold text-on-surface">Bridgestone Ecopia 195/65R15</div>
      <div className="font-label-code text-caption text-secondary">TYR-BST-19565</div>
      </div>
      </div>
      <div className="col-span-2 font-label-code text-label-code text-on-surface">LOT-24-9042</div>
      <div className="col-span-2 font-body-sm text-body-sm text-secondary">Rack B-03 (Tyres)</div>
      <div className="col-span-1 text-right font-label-code text-label-code font-bold text-on-surface">8 ea</div>
      <div className="col-span-2 text-right font-label-price text-label-price text-on-surface">{form.valueLabel}</div>
      <div className="col-span-2 flex justify-end gap-space-xs">
      <span className="px-space-sm py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">Move stock</span>
      </div>
      </div>

      <div className="grid grid-cols-12 px-space-lg py-space-md items-center bg-surface-container-lowest">
      <div className="col-span-3 flex items-center gap-space-sm">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-secondary">
      <span className="material-symbols-outlined text-[18px]">electric_car</span>
      </div>
      <div>
      <div className="font-body-md text-body-md font-semibold text-on-surface">Vehicle Telematics Loom Cable</div>
      <div className="font-label-code text-caption text-secondary">HAR-OBD2-C09</div>
      </div>
      </div>
      <div className="col-span-2 font-label-code text-label-code text-on-surface">HAR-88190-JM</div>
      <div className="col-span-2 font-body-sm text-body-sm text-secondary">Vehicle: {live.primaryPlate}</div>
      <div className="col-span-1 text-right font-label-code text-label-code font-bold text-on-surface">1 ea</div>
      <div className="col-span-2 text-right font-label-price text-label-price text-on-surface">{form.valueLabel}</div>
      <div className="col-span-2 flex justify-end gap-space-xs">
      <span className="px-space-sm py-0.5 rounded bg-surface-container font-label-code text-caption text-secondary">Return</span>
      </div>
      </div>
      </div>
      </div>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0c10]/60 backdrop-blur-sm p-4 overflow-y-auto">

      <div className="relative w-full max-w-[700px] my-auto bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col text-on-surface">

      <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-md">

      <div className="flex items-start justify-between">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-primary text-on-primary flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
      </div>
      <div>
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary font-semibold">Asset Custody Action</span>
      <span className="w-1 h-1 rounded-full bg-outline"></span>
      <span className="font-label-code text-caption text-secondary font-semibold">Transaction #TRX-9481</span>
      </div>
      <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight" data-stitch-data-stitch-id="modal-title">Write off stock</h2>
      </div>
      </div>
      <button type="button" onClick={() => shell.closeModal()} aria-label="Close dialog" className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:bg-surface-variant transition-colors">
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>
      <p className="font-body-sm text-body-sm text-secondary -mt-1" data-stitch-data-stitch-id="modal-subtitle">
                Remove damaged, lost, or stolen items from custody ledger permanently.
              </p>

      <div className="grid grid-cols-3 p-1 rounded-lg bg-surface-variant/70 gap-1 font-body-sm text-body-sm">
      <button type="button" className="py-1.5 px-space-sm rounded font-medium text-secondary hover:text-on-surface flex items-center justify-center gap-space-xs transition-all" data-stitch-data-stitch-id="tab-move"  onClick={() => form.setMode('transfer')}>
      <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
      <span>Move stock</span>
      </button>
      <button type="button" className="py-1.5 px-space-sm rounded font-medium text-secondary hover:text-on-surface flex items-center justify-center gap-space-xs transition-all" data-stitch-data-stitch-id="tab-return"  onClick={() => form.setMode('return')}>
      <span className="material-symbols-outlined text-[16px]">assignment_return</span>
      <span>Return from car</span>
      </button>
      <button type="button" className="py-1.5 px-space-sm rounded font-semibold text-on-surface bg-surface-container-lowest shadow-sm flex items-center justify-center gap-space-xs transition-all" data-stitch-data-stitch-id="tab-writeoff"  onClick={() => form.setMode('writeoff')}>
      <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
      <span>Write off</span>
      </button>
      </div>
      </div>

      <div className="p-space-lg flex flex-col gap-space-md">

      <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-space-xs">
      <div className="flex items-center justify-between text-secondary font-caption text-caption">
      <span className="uppercase tracking-wider font-semibold">Active Inventory Asset</span>
      <span className="font-label-code text-on-tertiary-container bg-tertiary-fixed/30 px-1.5 py-0.5 rounded font-semibold">Serialized Telematics</span>
      </div>
      <div className="flex items-start justify-between gap-space-md pt-0.5">
      <div className="flex items-center gap-space-sm">
      <div className="w-10 h-10 rounded-lg bg-surface-container-lowest flex items-center justify-center shadow-sm">
      <span className="material-symbols-outlined text-[22px] text-on-surface">videocam</span>
      </div>
      <div className="flex flex-col">
      <div className="font-body-md text-body-md font-semibold text-on-surface">
                        Dash camera — Dual-Lens 1080p Telematics
                      </div>
      <div className="flex items-center gap-space-xs font-label-code text-caption text-secondary">
      <span>ELC-DCM-01</span>
      <span>·</span>
      <span className="text-on-surface font-semibold">S/N: {serial}</span>
      </div>
      </div>
      </div>
      <div className="text-right">
      <div className="font-caption text-caption text-secondary">Current Unit Book Valuation</div>
      <div className="font-label-price text-label-price text-on-surface font-bold text-[15px]">{form.valueLabel}</div>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-12 gap-space-md">

      <div className="col-span-4 flex flex-col gap-1">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Quantity to write off</label>
      <div className="relative flex items-center">
      <input className="w-full h-9 px-space-md bg-surface-container-low text-on-surface font-label-code text-label-code rounded focus:outline-none" type="text" inputMode="numeric" value={form.qty} onChange={(e) => form.setQty(e.target.value)}/>
      <span className="absolute right-3 font-caption text-caption text-secondary uppercase">Fixed S/N</span>
      </div>
      </div>

      <div className="col-span-8 flex flex-col gap-1">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Accounting Valuation Subtotal</label>
      <div className="h-9 px-space-md bg-surface-container-low text-on-surface font-label-price text-label-price rounded flex items-center justify-between">
      <span>Depot Book Value (Landed JMD)</span>
      <span className="font-bold">{form.valueLabel}</span>
      </div>
      </div>

      <div className="col-span-6 flex flex-col gap-1" data-stitch-data-stitch-id="field-from-container">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Source Custody (From)</label>
      <div className="h-9 px-space-md bg-surface-container-lowest rounded shadow-sm flex items-center gap-space-sm text-on-surface font-body-sm text-body-sm">
      <span className="material-symbols-outlined text-[16px] text-secondary">warehouse</span>
      <span className="truncate">Main store — Kingston (Cage A)</span>
      </div>
      </div>

      <div className="col-span-6 flex flex-col gap-1" data-stitch-data-stitch-id="field-to-container">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Target Custody (To)</label>
      <div className="h-9 px-space-md bg-surface-container text-secondary font-body-sm text-body-sm rounded flex items-center gap-space-sm cursor-not-allowed" data-stitch-data-stitch-id="field-to-display">
      <span className="material-symbols-outlined text-[16px] text-error">cancel</span>
      <span className="truncate italic text-[12px]">Permanently removed from storeroom</span>
      </div>
      </div>

      <div className="col-span-12 flex flex-col gap-1" data-stitch-data-stitch-id="field-reason-container">
      <div className="flex items-center justify-between">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Write-off Disposition Reason <span className="text-error">*</span></label>
      <span className="font-caption text-caption text-secondary">Mandatory regulatory attribution</span>
      </div>
      <div className="relative">
      <select className="w-full h-9 px-space-md bg-surface-container-lowest text-on-surface font-body-md text-body-md rounded shadow-sm focus:outline-none appearance-none cursor-pointer" value={form.reason} onChange={(e) => form.setReason(e.target.value)}>
      <option value="damaged">Damaged — Internal hardware failure / physical defect</option>
      <option value="lost">Lost — Unaccounted during physical cycle count</option>
      <option value="stolen">Stolen — Police report / security breach reported</option>
      <option value="expired">Expired / Obsolete — Deprecated firmware specification</option>
      <option value="other">Other depot adjustment</option>
      </select>
      <span className="material-symbols-outlined absolute right-3 top-2.5 text-[18px] text-secondary pointer-events-none">expand_more</span>
      </div>
      </div>

      <div className="col-span-12 flex flex-col gap-1">
      <div className="flex items-center justify-between">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Incident Memo & Technical Report <span className="text-error">*</span></label>
      <span className="font-label-code text-caption text-secondary">DEPOT LOG ENTRY #904</span>
      </div>
      <textarea className="w-full p-space-md bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded shadow-sm focus:outline-none resize-none leading-relaxed" rows={2} value={form.memo} onChange={(e) => form.setMemo(e.target.value)}></textarea>
      </div>
      </div>

      <div className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-space-xs">
      <div className="flex items-center justify-between pb-1">
      <div className="flex items-center gap-space-xs text-secondary font-caption text-caption uppercase tracking-wider font-semibold">
      <span className="material-symbols-outlined text-[14px]">fact_check</span>
      <span>Custody & Valuation Impact Preview</span>
      </div>
      <span className="font-label-code text-[11px] text-secondary">Atomic Database Commit</span>
      </div>
      <div className="flex flex-col gap-1.5 font-label-code text-caption" data-stitch-data-stitch-id="impact-preview-content">
      <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded">
      <span className="text-secondary">Main store — Kingston</span>
      <span className="font-semibold text-on-surface">Dash camera: 1 → 0 <span className="text-error">(-1 unit)</span></span>
      </div>
      <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded">
      <span className="text-secondary">Serialized Asset Registry</span>
      <span className="font-semibold text-on-surface">{serial} → <span className="text-error">RETIRED / SCRAPPED</span></span>
      </div>
      <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded">
      <span className="text-secondary">P&L Financial Ledger</span>
      <span className="font-semibold text-error">-{form.valueLabel} (Depot write-off expense)</span>
      </div>
      </div>
      </div>

      <div className="p-space-md rounded-lg bg-tertiary-fixed/20 flex items-start gap-space-md" data-stitch-data-stitch-id="high-value-alert">
      <div className="w-7 h-7 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[18px] text-on-tertiary-fixed font-bold">gavel</span>
      </div>
      <div className="flex flex-col">
      <div className="flex items-center gap-space-sm">
      <span className="font-body-sm text-body-sm font-semibold text-on-tertiary-fixed">High-Value Dual-Signature Review Triggered</span>
      <span className="font-label-code text-caption uppercase px-1.5 py-0.2 rounded bg-tertiary-fixed-dim/40 text-on-tertiary-fixed font-bold">Rule SEC-402</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant pt-0.5 leading-snug">
                    This write-off exceeds Jamaica Depot Statutory limit of <strong className="font-label-price text-on-surface">{form.valueLabel}</strong>. It will be routed to the <strong>Admin Dual-Approval Queue</strong> and queued in Alerts until confirmed by the Hub Director.
                  </p>
      </div>
      </div>
      </div>

      <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
      <button type="button" className="h-9 px-space-lg rounded font-body-sm text-body-sm font-medium text-secondary hover:text-on-surface hover:bg-surface-variant transition-colors" onClick={() => form.close()}>
                Cancel
              </button>
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption text-secondary">Logged as John Doe (JD-Kingston)</span>
      <button type="button" className="h-9 px-space-lg bg-primary text-on-primary rounded font-body-sm text-body-sm font-semibold flex items-center gap-space-xs hover:bg-surface-tint active:scale-95 transition-all shadow-sm disabled:opacity-60" data-stitch-data-stitch-id="primary-action-btn" disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.submitCustody()}>
      <span className="material-symbols-outlined text-[18px]">{form.submit.saving ? 'progress_activity' : 'verified_user'}</span>
      <span data-stitch-data-stitch-id="primary-action-label">{form.submit.saving ? 'Submitting…' : 'Submit for Dual-Approval'}</span>
      </button>
      </div>
      </div>

      <div className="px-space-lg py-2 bg-surface-container text-secondary flex items-center justify-between font-caption text-caption">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[13px]">tune</span>
      <span>Switch mode above or click preview:</span>
      </span>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="hover:text-on-surface underline font-label-code text-caption"  onClick={() => form.setMode('transfer')}>Preview "Move stock" (Depot → Car)</button>
      <span>·</span>
      <button type="button" className="hover:text-on-surface underline font-label-code text-caption"  onClick={() => form.setMode('return')}>Preview "Return from car" (Car → Depot)</button>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
    </div>
  );
}
