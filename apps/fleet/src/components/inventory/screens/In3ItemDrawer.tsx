/** Ported from Stitch — do not simplify layout (audit §0.4). Drawer only, real item data (IV-14, IV-16). */
import { useIn3ItemDrawerForm } from './hooks/useIn3ItemDrawerForm';
import { formatMovementWhen, numField, strField } from '../inventoryData';

export function In3ItemDrawer() {
  const form = useIn3ItemDrawerForm();
  const readOnly = form.shell.readOnly;
  const tracking = strField(form.item ?? {}, 'tracking', 'quantity');
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div className="fixed inset-0 z-40 bg-on-surface/40 backdrop-blur-[2px] transition-opacity duration-200" data-stitch-data-stitch-id="drawerScrim" onClick={() => form.close()}></div>

      <aside aria-labelledby="drawerTitle" aria-modal="true" className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-[570px] bg-surface-container-lowest shadow-2xl flex flex-col overflow-hidden text-on-surface" data-stitch-data-stitch-id="itemDrawer" role="dialog">

      <div className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-sm shrink-0">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-surface-tint font-bold">Item detail</span>
      <button type="button" className="w-8 h-8 rounded flex items-center justify-center hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface" title="Close" aria-label="Close drawer" onClick={() => form.close()}>
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight" id="drawerTitle" data-stitch-data-stitch-id="drawerTitle">{form.drawerRow?.name ?? 'Select an item'}</h2>
      {!readOnly && form.itemId ? (
      <button type="button" className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" title="Edit item" aria-label="Edit item" onClick={() => form.openEditItem()}>
      <span className="material-symbols-outlined text-[18px]">edit</span>
      </button>
      ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-space-xs pt-1">
      <span className="font-label-code text-label-code font-bold bg-surface-container px-space-sm py-0.5 rounded text-on-surface">{form.drawerRow?.sku ?? '—'}</span>
      <span className="font-caption text-caption bg-surface-container-low px-space-sm py-0.5 rounded text-on-surface-variant font-medium">{tracking === 'serial' ? 'Tracked by serial' : 'Counted by quantity'}</span>
      {form.need && form.need.status !== 'ok' ? (
      <span className="font-caption text-caption bg-error-container px-space-sm py-0.5 rounded-full text-error font-bold">{form.need.status === 'out' ? 'Out' : 'Low'} in store · {form.need.needed} needed</span>
      ) : null}
      </div>
      </div>

      <div className="flex-1 overflow-y-auto p-space-lg flex flex-col gap-space-xl bg-surface-container-lowest">

      <div className="grid grid-cols-2 gap-space-sm">
      <div className="bg-surface-container-low p-space-md rounded-lg">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">On hand (all places)</span>
      <div className="font-headline-lg text-headline-lg font-bold font-label-code text-on-surface my-space-xs">{form.totals.onHand}</div>
      <span className="font-caption text-caption text-secondary font-medium">{form.totals.inStore} in store · {form.totals.onCars} on cars</span>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Total value</span>
      <div className="font-label-price text-headline-sm font-bold text-on-surface my-space-xs">{form.formatJmd(form.totals.value)}</div>
      <span className="font-caption text-caption text-secondary font-medium">Avg {form.formatJmd(form.totals.onHand ? form.totals.value / form.totals.onHand : null)} each</span>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Where it is</h3>
      </div>
      <div className="bg-surface-container-low rounded-lg overflow-hidden">
      <table className="w-full text-left">
      <thead className="bg-surface-container font-caption text-caption uppercase tracking-wider text-on-surface-variant">
      <tr>
      <th className="py-space-sm px-space-md">Location</th>
      <th className="py-space-sm px-space-sm text-center">On hand</th>
      <th className="py-space-sm px-space-sm text-center">Reserved</th>
      </tr>
      </thead>
      <tbody className="font-body-sm text-body-sm">
      {form.placeRows.length === 0 ? (
      <tr><td colSpan={3} className="py-space-sm px-space-md text-on-surface-variant">None anywhere yet.</td></tr>
      ) : (
        form.placeRows.map((r) => (
      <tr key={strField(r, 'location_id', '')} className="bg-surface-container-lowest">
      <td className="py-space-sm px-space-md">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[16px] text-on-surface">{strField(r, 'location_code', '').toLowerCase().startsWith('veh') ? 'directions_car' : 'warehouse'}</span>
      <span className="font-bold text-on-surface">{strField(r, 'location_name', '—')}</span>
      </div>
      </td>
      <td className="py-space-sm px-space-sm text-center font-label-code text-label-code font-bold text-on-surface">{numField(r, 'on_hand', 0)}</td>
      <td className="py-space-sm px-space-sm text-center font-label-code text-label-code text-on-surface-variant">{numField(r, 'reserved', 0)}</td>
      </tr>
        ))
      )}
      </tbody>
      </table>
      </div>
      </div>

      {form.kitCells.length ? (
      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">category</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">In the car kit</h3>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-xs">
      {form.kitCells.map((c) => (
      <div key={c.vehicleId} className={`flex items-center justify-between p-space-sm rounded ${c.status === 'ok' ? 'bg-surface-container-lowest' : 'bg-error-container/20'}`}>
      <div className="flex items-center gap-space-xs">
      <span className={`material-symbols-outlined text-[16px] ${c.status === 'ok' ? 'text-primary' : 'text-error'}`}>{c.status === 'ok' ? 'check_circle' : 'warning'}</span>
      <span className="font-label-plate text-label-plate text-on-surface">{c.plate}</span>
      <span className="font-caption text-caption text-on-surface-variant">{c.status === 'ok' ? 'in the car' : c.required ? 'missing' : 'optional — not fitted'}</span>
      </div>
      {!readOnly && c.status !== 'ok' && c.required ? (
      <button type="button" className="px-2 py-1 rounded bg-primary text-on-primary font-caption text-caption font-bold flex items-center gap-0.5" onClick={() => form.shell.openIssue({ vehicleId: c.vehicleId, kitLineIds: [c.kitLineId] })}>
      <span>Issue to {c.plate}</span>
      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
      </button>
      ) : null}
      </div>
      ))}
      </div>
      </div>
      ) : null}

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">history_toggle_off</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Recent history</h3>
      </div>
      <div className="flex flex-col gap-space-xs">
      {form.movementRows.length === 0 ? (
      <p className="font-body-sm text-on-surface-variant px-space-sm py-2">No movements loaded for this item.</p>
      ) : (
      form.movementRows.map((mov) => {
        const w = formatMovementWhen(mov.when);
        return (
      <div key={mov.id} className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-sm min-w-0">
      <span className="font-label-code text-[11px] font-bold px-1.5 py-0.5 rounded bg-surface-container text-on-surface shrink-0">{mov.typeLabel}</span>
      <span className="font-caption text-caption text-on-surface-variant truncate">{mov.route}</span>
      </div>
      <div className="flex flex-col items-end shrink-0">
      <span className="font-label-code text-body-sm font-bold text-on-surface">{mov.qtyLabel}</span>
      <span className="font-caption text-[10px] text-on-surface-variant">{w.date}</span>
      </div>
      </div>
        );
      })
      )}
      </div>
      {form.itemId ? (
      <button type="button" className="w-full py-space-sm rounded bg-surface-container-low hover:bg-surface-container text-center font-caption text-caption font-bold text-on-surface transition-colors flex items-center justify-center gap-1" onClick={() => form.shell.openMovementsForItem(form.itemId)}>
      <span>View full history in Movements</span>
      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </button>
      ) : null}
      </div>
      </div>

      {!readOnly ? (
      <div className="p-space-lg bg-surface-container-lowest shadow-[0_-4px_16px_rgba(0,0,0,0.04)] grid grid-cols-3 gap-space-sm shrink-0">
      <button type="button" className="px-space-md py-2.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-bold flex items-center justify-center gap-space-xs transition-colors" onClick={() => form.openReceive()}>
      <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
      <span>Receive</span>
      </button>
      <button type="button" className="px-space-md py-2.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-bold flex items-center justify-center gap-space-xs transition-colors" onClick={() => form.openTransfer()}>
      <span className="material-symbols-outlined text-[18px]">sync_alt</span>
      <span>Move</span>
      </button>
      <button type="button" className="px-space-md py-2.5 rounded bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-bold flex items-center justify-center gap-space-xs transition-colors shadow-sm" onClick={() => form.openIssue()}>
      <span className="material-symbols-outlined text-[18px]">send</span>
      <span>Issue</span>
      </button>
      </div>
      ) : null}
      </aside>
      </div>
      </div>
    </div>
  );
}
