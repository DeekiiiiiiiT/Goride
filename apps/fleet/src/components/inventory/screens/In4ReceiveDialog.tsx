/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { strField } from '../inventoryData';
import { GapLoadState, GapSubmitError } from '../gap/GapLoadState';
import { GapModalShell } from '../gap/GapModalShell';
import { useIn4ReceiveForm } from './hooks/useIn4ReceiveForm';
import type { ReceiveLine } from './hooks/useIn4ReceiveForm';

function lineItemSerialTracked(
  items: Record<string, unknown>[],
  itemId: string,
): boolean {
  const it = items.find((i) => String(i.id ?? '') === itemId);
  if (!it) return false;
  return Boolean(it.is_serial_tracked ?? it.serial_tracked ?? it.track_serial);
}

export function In4ReceiveDialog() {
  const form = useIn4ReceiveForm();
  const { shell, live } = form;

  const onItemSelect = (line: ReceiveLine, itemId: string) => {
    const item = form.items.find((i) => String(i.id ?? '') === itemId);
    form.updateLine(line.key, {
      itemId,
      name: String(item?.name ?? '—'),
      sku: String(item?.sku ?? '—'),
      unitPrice: String(item?.default_unit_cost ?? '0'),
    });
  };
  return (
    <GapModalShell onClose={() => shell.closeModal()} ariaLabel="Receive stock">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch -mx-space-md -mt-space-md flex flex-col md:-mx-space-lg md:-mt-space-lg">

      <div className="px-space-xl pt-space-lg pb-space-lg flex items-start justify-between border-b border-surface-container">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md bg-surface-container-low p-space-md rounded-lg">

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption text-secondary uppercase font-semibold tracking-wide">Into Location</label>
      {form.locations.length > 1 ? (
      <div className="relative">
      <select id="in4-receive-location" aria-label="Into location" className="w-full bg-surface-container-lowest text-on-surface font-body-sm text-body-sm rounded-lg px-space-md py-2 appearance-none focus:outline-none" value={form.locationId} onChange={(e) => form.setLocationId(e.target.value)}>
      {form.locations.map((loc) => {
        const id = String(loc.id ?? '');
        return (
      <option key={id} value={id}>{String(loc.name ?? loc.code ?? live.hubName)}</option>
        );
      })}
      </select>
      <span className="material-symbols-outlined text-[16px] text-secondary absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
      </div>
      ) : (
      <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-2 rounded-lg">
      <span className="material-symbols-outlined text-[18px] text-secondary">warehouse</span>
      <div className="flex flex-col min-w-0">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface truncate">{form.locationLabel}</span>
      <span className="font-caption text-[10px] text-secondary tracking-tight">Node: {form.locationId || live.hubShort}</span>
      </div>
      </div>
      )}
      <div className="mt-1 flex items-center gap-space-xs text-secondary font-caption text-caption">
      <span className="material-symbols-outlined text-[14px] text-secondary">lock</span>
      <span>Primary secure lockup</span>
      </div>
      </div>

      <div className="flex flex-col gap-1.5">
      <label className="font-caption text-caption text-secondary uppercase font-semibold tracking-wide">Received On</label>
      <div className="relative flex items-center bg-surface-container-lowest rounded-lg px-space-md py-2">
      <span className="material-symbols-outlined text-[18px] text-secondary mr-2">calendar_today</span>
      <input className="bg-transparent font-label-code text-label-code text-on-surface focus:outline-none w-full" type="date" value={form.receivedOn} onChange={(e) => form.setReceivedOn(e.target.value)}/>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">Received Lines</span>
      <span className="font-label-code text-caption bg-surface-container px-2 py-0.5 rounded-full font-bold text-on-surface">{form.lineCountLabel} items</span>
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
      {form.lines.map((line, index) => {
        const serialTracked = lineItemSerialTracked(form.items, line.itemId);
        return (
      <div key={line.key} className="grid grid-cols-12 px-space-md py-space-md items-center gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low/40 transition-colors">

      <div className="col-span-4 flex flex-col pr-space-xs">
      <select
        id={index === 0 ? 'in4-receive-first-item' : undefined}
        className="w-full bg-surface-container-low rounded-lg px-2 py-1 font-body-md text-body-md font-semibold text-on-surface"
        value={line.itemId}
        onChange={(e) => onItemSelect(line, e.target.value)}
      >
      {form.items.map((item) => (
      <option key={String(item.id ?? '')} value={String(item.id ?? '')}>{String(item.name ?? '—')}</option>
      ))}
      </select>
      <div className="flex items-center gap-space-xs mt-0.5">
      <span className="font-label-code text-[11px] text-secondary bg-surface-container px-1 rounded">{line.sku}</span>
      </div>
      </div>

      <div className="col-span-2">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1.5 w-24">
      <input id={index === 0 ? 'receive-line-0-qty' : undefined} className="w-full bg-transparent font-label-code text-label-code text-on-surface font-bold focus:outline-none" type="text" value={line.qty} onChange={(e) => form.updateLine(line.key, { qty: e.target.value })}/>
      <span className="font-caption text-caption text-secondary">ea</span>
      </div>
      </div>

      <div className="col-span-2">
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1.5">
      <input className="w-full bg-transparent font-label-code text-label-code text-on-surface font-semibold focus:outline-none" type="text" value={line.unitPrice} onChange={(e) => form.updateLine(line.key, { unitPrice: e.target.value })}/>
      </div>
      <span className="font-caption text-[10px] text-secondary mt-0.5 block">{form.formatJmd(form.lineUnitTotal(line))}</span>
      </div>

      <div className="col-span-3">
      {serialTracked ? (
      <div className="flex items-center bg-surface-container-low rounded-lg px-2 py-1 gap-1">
      <input className="flex-1 bg-transparent font-label-code text-[11px] text-on-surface font-semibold tracking-wider focus:outline-none" type="text" placeholder="Serial" value={line.serial} onChange={(e) => form.updateLine(line.key, { serial: e.target.value })}/>
      </div>
      ) : (
      <div className="inline-flex items-center gap-1 bg-surface-container px-2 py-1 rounded text-secondary">
      <span className="material-symbols-outlined text-[14px]">pin</span>
      <span className="font-caption text-[11px]">Quantity-tracked only</span>
      </div>
      )}
      </div>

      <div className="col-span-1 text-right">
      <button type="button" className="w-8 h-8 rounded flex items-center justify-center text-secondary hover:text-error hover:bg-error-container/20 transition-colors ml-auto" title="Remove line" onClick={() => form.removeLine(line.key)}>
      <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
      </div>
      </div>
        );
      })}
      </div>

      <div className="p-space-sm bg-surface-container-low/50 flex items-center justify-between">
      <button type="button" className="flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-on-surface hover:text-primary px-space-md py-1.5 rounded-lg hover:bg-surface-container transition-colors" onClick={() => form.addLine()}>
      <span className="material-symbols-outlined text-[18px]">add</span>
      <span>Add another item</span>
      </button>
      <div className="flex items-center gap-space-md font-caption text-caption text-secondary pr-space-md">
      <span>Subtotal ({form.lineCountLabel} lines): <strong className="font-label-price text-on-surface font-semibold">{form.subtotalLabel}</strong></span>
      <span>Total: <strong className="font-label-price text-on-surface font-semibold">{form.grandTotalLabel}</strong></span>
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
      <input className="w-20 bg-transparent text-right font-label-price text-label-code focus:outline-none" type="text" value={form.freightCost} onChange={(e) => form.setFreightCost(e.target.value)}/>
      </div>
      </div>

      <div className="flex items-center justify-between bg-surface-container-lowest px-space-md py-2 rounded-lg">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px] text-secondary">account_balance</span>
      <span className="font-body-sm text-body-sm text-secondary">Customs & Tariffs (Duty)</span>
      </div>
      <div className="flex items-center gap-1 font-label-price text-label-code text-on-surface font-bold">
      <span>J$</span>
      <input className="w-20 bg-transparent text-right font-label-price text-label-code focus:outline-none" type="text" value={form.dutyCost} onChange={(e) => form.setDutyCost(e.target.value)}/>
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
                      New asset <code className="font-label-code text-caption font-bold bg-surface-container-lowest px-1.5 py-0.5 rounded">{form.lines.find((l) => l.serial.trim())?.serial || '—'}</code> added to {form.locationLabel}
                    </span>
      </li>
      <li className="flex items-start gap-2">
      <span className="material-symbols-outlined text-[16px] text-on-surface mt-0.5">arrow_forward</span>
      <span>
                      Average cost {form.lines[0]?.name ?? 'item'} <span className="font-label-price text-caption">{form.grandTotalLabel}</span> (includes apportioned shipping and duty)
                    </span>
      </li>
      </ul>
      </div>
      </div>

      <div className="px-space-xl py-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md border-t border-surface-container">

      <div className="flex items-center gap-space-xs text-secondary">
      <span className="material-symbols-outlined text-[16px]">verified</span>
      <span className="font-caption text-caption tracking-tight">Audit note: Creates immutable RECEIVE ledger entry</span>
      </div>

      <div className="flex items-center gap-space-sm w-full sm:w-auto justify-end">
      <button type="button" className="bg-surface-container-lowest text-on-surface px-space-lg py-2 rounded-lg font-headline-sm text-body-md font-semibold hover:bg-surface-container transition-colors shadow-sm" onClick={() => form.close()}>
                  Cancel
                </button>
      <button type="button" className="bg-primary text-on-primary px-space-xl py-2 rounded-lg font-headline-sm text-body-md font-semibold flex items-center gap-space-xs shadow-md hover:bg-primary-container transition-colors disabled:opacity-60" disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.receive()}>
      <span className="material-symbols-outlined text-[18px]">{form.submit.saving ? 'progress_activity' : 'archive'}</span>
      <span>{form.submit.saving ? 'Receiving…' : 'Receive'}</span>
      </button>
      </div>
      </div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
