/** Ported from Stitch — do not simplify layout (audit §0.4). Real locations, item and user (IV-14, IV-16). */
import { useIn14CustodyForm, type CustodyMode } from './hooks/useIn14CustodyForm';
import { useInventoryShell } from '../InventoryShellContext';
import { numField, strField } from '../inventoryData';
import { useAuth } from '../../auth/AuthContext';

const MODES: { id: CustodyMode; label: string; icon: string; title: string; sub: string }[] = [
  { id: 'transfer', label: 'Move stock', icon: 'swap_horiz', title: 'Move stock', sub: 'Move items from one place to another.' },
  { id: 'return', label: 'Return from car', icon: 'assignment_return', title: 'Return from car', sub: 'Bring items back from a car to the store.' },
  { id: 'writeoff', label: 'Write off', icon: 'delete_sweep', title: 'Write off stock', sub: 'Remove damaged, lost or stolen items for good.' },
];

const selectCls =
  'w-full h-9 px-space-md bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded shadow-sm focus:outline-none cursor-pointer';

export function In14CustodyDialog() {
  const form = useIn14CustodyForm();
  const shell = useInventoryShell();
  const { user } = useAuth();
  const userName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email || 'You';
  const mode = MODES.find((m) => m.id === form.mode) ?? MODES[0];
  const placeName = (id: string) => {
    const loc = form.locations.find((l) => String(l.id) === id);
    return loc ? String(loc.name ?? loc.code ?? '—') : '—';
  };
  const fromRow = form.stockRows.find(
    (r) => strField(r, 'item_id', '') === form.itemId && strField(r, 'location_id', '') === form.fromLocationId,
  );
  const onHandFrom = fromRow ? numField(fromRow, 'on_hand', 0) : 0;
  const qty = Number(form.qty) || 0;
  const vehicleName = form.live.kitVehicles.find((v) => v.vehicleId === form.vehicleId)?.plate ?? '—';
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0c10]/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-[700px] my-auto bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden flex flex-col text-on-surface">

      <div className="p-space-lg bg-surface-container-low flex flex-col gap-space-md">
      <div className="flex items-start justify-between">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-primary text-on-primary flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
      </div>
      <div>
      <span className="font-label-code text-caption uppercase tracking-wider text-secondary font-semibold">Stock change</span>
      <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight" data-stitch-data-stitch-id="modal-title">{mode.title}</h2>
      </div>
      </div>
      <button type="button" onClick={() => shell.closeModal()} aria-label="Close dialog" className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:bg-surface-variant transition-colors">
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>
      <p className="font-body-sm text-body-sm text-secondary -mt-1" data-stitch-data-stitch-id="modal-subtitle">{mode.sub}</p>

      <div className="grid grid-cols-3 p-1 rounded-lg bg-surface-variant/70 gap-1 font-body-sm text-body-sm">
      {MODES.map((m) => (
      <button key={m.id} type="button" className={`py-1.5 px-space-sm rounded flex items-center justify-center gap-space-xs transition-all ${form.mode === m.id ? 'font-semibold text-on-surface bg-surface-container-lowest shadow-sm' : 'font-medium text-secondary hover:text-on-surface'}`} data-stitch-data-stitch-id={`tab-${m.id}`} onClick={() => form.setMode(m.id)}>
      <span className="material-symbols-outlined text-[16px]">{m.icon}</span>
      <span>{m.label}</span>
      </button>
      ))}
      </div>
      </div>

      <div className="p-space-lg flex flex-col gap-space-md">

      <div className="grid grid-cols-12 gap-space-md">
      <div className="col-span-8 flex flex-col gap-1">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-item">Item</label>
      <select id="custody-item" className={selectCls} value={form.itemId} onChange={(e) => form.setItemId(e.target.value)}>
      <option value="">Choose an item…</option>
      {form.itemOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      </div>
      <div className="col-span-4 flex flex-col gap-1">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-qty">Quantity</label>
      <input id="custody-qty" className="w-full h-9 px-space-md bg-surface-container-low text-on-surface font-label-code text-label-code rounded focus:outline-none" type="text" inputMode="numeric" value={form.qty} onChange={(e) => form.setQty(e.target.value)}/>
      </div>

      {form.mode === 'return' ? (
      <div className="col-span-6 flex flex-col gap-1">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-car">From car</label>
      <select id="custody-car" className={selectCls} value={form.vehicleId} onChange={(e) => form.setVehicleId(e.target.value)}>
      <option value="">Choose a car…</option>
      {form.live.kitVehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.plate}</option>)}
      </select>
      </div>
      ) : (
      <div className="col-span-6 flex flex-col gap-1" data-stitch-data-stitch-id="field-from-container">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-from">From</label>
      <select id="custody-from" className={selectCls} value={form.fromLocationId} onChange={(e) => form.setFromLocationId(e.target.value)}>
      <option value="">Choose a place…</option>
      {form.realLocations.map((l) => <option key={String(l.id)} value={String(l.id)}>{String(l.name ?? l.code)}</option>)}
      </select>
      </div>
      )}

      {form.mode === 'writeoff' ? (
      <div className="col-span-6 flex flex-col gap-1" data-stitch-data-stitch-id="field-to-container">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">To</label>
      <div className="h-9 px-space-md bg-surface-container text-secondary font-body-sm text-body-sm rounded flex items-center gap-space-sm" data-stitch-data-stitch-id="field-to-display">
      <span className="material-symbols-outlined text-[16px] text-error">cancel</span>
      <span className="truncate italic text-[12px]">Removed from stock for good</span>
      </div>
      </div>
      ) : (
      <div className="col-span-6 flex flex-col gap-1" data-stitch-data-stitch-id="field-to-container">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-to">To</label>
      <select id="custody-to" className={selectCls} value={form.toLocationId} onChange={(e) => form.setToLocationId(e.target.value)}>
      <option value="">Choose a place…</option>
      {(form.mode === 'return' ? form.storeLocations : form.realLocations)
        .filter((l) => String(l.id) !== form.fromLocationId)
        .map((l) => <option key={String(l.id)} value={String(l.id)}>{String(l.name ?? l.code)}</option>)}
      </select>
      </div>
      )}

      {form.mode === 'writeoff' ? (
      <div className="col-span-12 flex flex-col gap-1" data-stitch-data-stitch-id="field-reason-container">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-reason">Reason <span className="text-error">*</span></label>
      <select id="custody-reason" className={selectCls} value={form.reason} onChange={(e) => form.setReason(e.target.value)}>
      <option value="">Choose a reason…</option>
      <option value="damaged">Damaged</option>
      <option value="lost">Lost</option>
      <option value="stolen">Stolen</option>
      <option value="expired">Expired</option>
      <option value="other">Other</option>
      </select>
      </div>
      ) : null}

      <div className="col-span-12 flex flex-col gap-1">
      <label className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold" htmlFor="custody-memo">Note</label>
      <textarea id="custody-memo" className="w-full p-space-md bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded shadow-sm focus:outline-none resize-none leading-relaxed" rows={2} value={form.memo} onChange={(e) => form.setMemo(e.target.value)}></textarea>
      </div>
      </div>

      {form.itemId && qty > 0 ? (
      <div className="rounded-lg bg-surface-container-low p-space-md flex flex-col gap-space-xs">
      <div className="flex items-center gap-space-xs text-secondary font-caption text-caption uppercase tracking-wider font-semibold">
      <span className="material-symbols-outlined text-[14px]">fact_check</span>
      <span>What will change</span>
      </div>
      <div className="flex flex-col gap-1.5 font-label-code text-caption" data-stitch-data-stitch-id="impact-preview-content">
      {form.mode === 'return' ? (
      <div className="bg-surface-container-lowest p-2 rounded">{form.itemName} × {qty}: {vehicleName} → {placeName(form.toLocationId)}</div>
      ) : (
      <div className="bg-surface-container-lowest p-2 rounded flex items-center justify-between">
      <span className="text-secondary">{placeName(form.fromLocationId)}</span>
      <span className="font-semibold text-on-surface">{form.itemName}: {onHandFrom} → {Math.max(0, onHandFrom - qty)} {qty > onHandFrom ? <span className="text-error">(only {onHandFrom} there)</span> : null}</span>
      </div>
      )}
      {form.mode === 'transfer' && form.toLocationId ? (
      <div className="bg-surface-container-lowest p-2 rounded">+{qty} at {placeName(form.toLocationId)}</div>
      ) : null}
      </div>
      </div>
      ) : null}

      {form.submit.error ? <div className="text-error font-body-sm" role="alert">{form.submit.error}</div> : null}
      </div>

      <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
      <button type="button" className="h-9 px-space-lg rounded bg-error-container text-error font-body-sm text-body-sm font-semibold transition-colors" onClick={() => form.close()}>
                Cancel
              </button>
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption text-secondary">Recorded as {userName}</span>
      <button type="button" className="h-9 px-space-lg bg-primary text-on-primary rounded font-body-sm text-body-sm font-semibold flex items-center gap-space-xs hover:bg-surface-tint active:scale-95 transition-all shadow-sm disabled:opacity-60" data-stitch-data-stitch-id="primary-action-btn" title={form.submitDisabledReason || undefined} disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.submitCustody().catch(() => undefined)}>
      <span className="material-symbols-outlined text-[18px]">{form.submit.saving ? 'progress_activity' : 'check'}</span>
      <span data-stitch-data-stitch-id="primary-action-label">{form.submit.saving ? 'Saving…' : form.mode === 'writeoff' ? 'Confirm write-off' : 'Save'}</span>
      </button>
      </div>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
