/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapRegisterAssetForm } from './useGapRegisterAssetForm';

export function GapRegisterAsset(p: { onClose?: () => void }) {
  const form = useGapRegisterAssetForm(p.onClose);
  const closeReg = () => p.onClose?.();
  const selectedLocation = form.locations.find((l) => String(l.id) === form.locationId);
  const selectedItem = form.serialItems.find((it) => String(it.id) === form.itemId);
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="RegisterAsset">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/40 backdrop-blur-sm overflow-y-auto">

        <div className="relative w-full max-w-[768px] bg-surface-container-lowest rounded-xl shadow-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">

        <div className="px-space-xl pt-space-xl pb-space-lg flex items-start justify-between bg-surface-container-lowest">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="px-2 py-0.5 rounded bg-surface-container text-caption font-caption text-on-surface-variant uppercase tracking-wider font-semibold">Hardware Intake</span>
        <span className="text-caption font-caption text-on-surface-variant font-label-code">Asset registration</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface mt-1">Register asset</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Track one expensive device by its serial number.</p>
        </div>
        <button aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors" type="button" onClick={closeReg}>
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>

        <form id="register-asset-form-root" className="px-space-xl py-space-sm flex flex-col gap-space-xl max-h-[calc(88vh-140px)] overflow-y-auto" onSubmit={(e) => e.preventDefault()}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-xl">

        <div className="flex flex-col gap-space-lg">

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>Catalog Item</span>
        <span className="text-caption font-caption text-on-tertiary-container lowercase font-normal">serial-tracked</span>
        </label>
        <div className="relative">
        <select className="w-full h-10 px-3 pr-8 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm appearance-none focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm cursor-pointer" value={form.itemId} onChange={(e) => form.setItemId(e.target.value)}>
        <option value="">Select catalog item…</option>
        {form.serialItems.map((it) => (
          <option key={String(it.id)} value={String(it.id)}>{String(it.name ?? '—')}</option>
        ))}
        </select>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant pointer-events-none">unfold_more</span>
        </div>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>Asset Tag</span>
        <span className="text-caption font-caption text-on-surface-variant">Sequence assigned</span>
        </label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-code text-label-code text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm" type="text" value={form.assetTag} onChange={(e) => form.setAssetTag(e.target.value)}/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">tag</span>
        </div>
        <p className="text-caption font-caption text-on-surface-variant">Auto-generated tag sequence</p>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold flex items-center justify-between">
        <span>Serial Number <span className="text-error">*</span></span>
        </label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-code text-label-code text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm font-semibold tracking-wide" required type="text" value={form.serialNumber} onChange={(e) => form.setSerialNumber(e.target.value)}/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">qr_code_scanner</span>
        </div>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Cost (J$)</label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-label-price text-label-price text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm font-bold" type="text" value={form.purchaseCost} onChange={(e) => form.setPurchaseCost(e.target.value)}/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">receipt_long</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant">What this unit cost, incl. GCT. Counts in Stock value.</span>
        </div>

        </div>

        <div className="flex flex-col gap-space-lg">

        <div className="flex flex-col gap-space-sm">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Where is it now</label>
        <div className="space-y-2">

        <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-2">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">{selectedLocation ? String(selectedLocation.name ?? '—') : 'Choose location'}</span>
        <div className="pl-6 flex items-center gap-space-sm">
        <span className="text-caption font-caption text-on-surface-variant whitespace-nowrap">Location:</span>
        <div className="relative w-full">
        <select className="w-full h-8 px-2.5 pr-7 rounded-lg bg-surface-container-lowest text-on-surface font-label-code text-body-sm appearance-none focus:outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer" value={form.locationId} onChange={(e) => form.setLocationId(e.target.value)}>
        <option value="">—</option>
        {form.locations.map((loc) => (
          <option key={String(loc.id)} value={String(loc.id)}>{String(loc.name ?? loc.code ?? '—')}</option>
        ))}
        </select>
        <span className="material-symbols-outlined absolute right-2 top-2 text-[14px] text-on-surface-variant pointer-events-none">expand_more</span>
        </div>
        </div>
        </div>

        </div>
        </div>

        <div className="flex flex-col gap-1">
        <label className="text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Next inspection</label>
        <div className="relative">
        <input className="w-full h-10 px-3 rounded-lg bg-surface-container-low font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary shadow-sm" type="date" value={form.nextInspectionDue} onChange={(e) => form.setNextInspectionDue(e.target.value)}/>
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[18px] text-on-surface-variant">event_repeat</span>
        </div>
        <span className="text-caption font-caption text-on-surface-variant">Optional schedule</span>
        </div>
        </div>
        </div>

        <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-2">
        <div className="flex items-center justify-between">
        <span className="text-caption font-caption uppercase tracking-wider text-on-surface font-semibold flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history_edu</span>
                      What will change
                    </span>
        </div>
        <ul className="space-y-1.5 text-body-sm font-body-sm text-on-surface-variant pl-1">
        <li className="flex items-start gap-2">
        <span className="text-on-surface">•</span>
        <span><span className="font-semibold text-on-surface">{selectedItem ? String(selectedItem.name ?? 'Item') : 'The item'}{form.serialNumber ? ` ${form.serialNumber}` : ''}</span> is added as <span className="font-label-code text-on-surface font-semibold">{form.previewAssetTag}</span> at {selectedLocation ? String(selectedLocation.name ?? '—') : 'the chosen location'}.</span>
        </li>
        <li className="flex items-start gap-2">
        <span className="text-on-surface">•</span>
        <span>Stock value goes up by <span className="font-label-price text-on-surface font-semibold">{form.ledgerImpactLabel}</span>.</span>
        </li>
        <li className="flex items-start gap-2">
        <span className="text-on-surface">•</span>
        <span>Recorded in this unit's history.</span>
        </li>
        </ul>
        </div>
        </form>

        <div className="px-space-xl py-space-md bg-surface-container-lowest flex items-center justify-between mt-auto">
        <button className="px-space-lg py-2 rounded-lg bg-error-container text-error hover:bg-error-container/80 font-body-sm text-body-sm font-semibold transition-colors" type="button" onClick={() => form.cancel()}>
                  Cancel
                </button>
        <div className="flex items-center gap-space-md">
        <button type="button" disabled={!form.canRegister || form.submit.saving} onClick={() => void form.register().catch(() => undefined)} className="px-space-xl py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-2 hover:opacity-95 active:scale-[0.98] transition-all shadow-md disabled:opacity-60">
        <span className="material-symbols-outlined text-[18px]">lock</span>
        <span>Register asset</span>
        </button>
        </div>
        </div>
        </div>
        </div>
        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
