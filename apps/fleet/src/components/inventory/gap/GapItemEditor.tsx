/** Item editor — real item fields only (IV-13, IV-14, IV-16, IV-18). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapDrawerShell } from './GapDrawerShell';
import { useGapItemEditorForm } from './useGapItemEditorForm';
import { useInventoryShell } from '../InventoryShellContext';
import { formatJmd } from '../inventoryFormat';
import { numField, strField } from '../inventoryData';

const inputCls =
  'h-9 px-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm';

export function GapItemEditor(p: { itemId?: string | null; onClose?: () => void }) {
  const form = useGapItemEditorForm(p.itemId, p.onClose);
  const shell = useInventoryShell();
  const closeDrawer = () => p.onClose?.();
  const readOnly = shell.readOnly;
  const item = form.load.data?.item as Record<string, unknown> | undefined;
  const itemId = p.itemId ?? '';
  const rows = shell.stockRows.filter((r) => strField(r, 'item_id', '') === itemId && numField(r, 'on_hand', 0) > 0);
  const onHand = rows.reduce((s, r) => s + numField(r, 'on_hand', 0), 0);
  const value = rows.reduce((s, r) => s + numField(r, 'stock_value', 0), 0);
  return (
    <GapDrawerShell onClose={p.onClose} ariaLabel="Item editor">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch flex h-full min-h-0 flex-col">

        <header className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-md shrink-0 border-b border-surface-container">
        <div className="flex items-start justify-between">
        <div className="flex flex-col">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">{form.isNew ? 'New item' : `Edit item · ${form.name.trim() || 'Untitled'}`}</h2>
        {!form.isNew && item?.short_code ? (
        <span className="font-caption text-caption text-on-surface-variant mt-0.5">Short code: <span className="font-label-code text-label-code text-on-surface">{String(item.short_code)}</span></span>
        ) : null}
        </div>
        <button aria-label="Close" className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors" id="close-drawer-btn" type="button" onClick={closeDrawer}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>

        {!form.isNew ? (
        <div className="flex items-center justify-between px-space-md py-space-sm bg-surface-container-low rounded-lg gap-space-sm">
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">On hand: {onHand} across {rows.length} place{rows.length === 1 ? '' : 's'} · {formatJmd(value || null)}</span>
        <button type="button" className="px-space-sm py-1 rounded bg-surface-container-lowest hover:bg-surface-container font-caption text-caption text-on-surface font-semibold flex items-center gap-0.5" onClick={() => shell.openMovementsForItem(itemId)}>
                  View history <span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
        </div>
        ) : null}

        <p className="font-body-sm text-body-sm text-on-surface-variant">Quantities can&apos;t be edited here — use Receive, Issue, Move or Opening balances.</p>
        </header>

        <div className="flex-1 overflow-y-auto px-space-lg py-space-lg flex flex-col gap-space-xl min-h-0">

        <section className="flex flex-col gap-space-md">
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Basics</h3>
        <div className="grid grid-cols-12 gap-space-md">
        <label className="col-span-12 flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Item name
        <input className={`${inputCls} font-body-md text-body-md`} type="text" readOnly={readOnly} value={form.name} onChange={(e) => form.setName(e.target.value)} />
        </label>
        <label className="col-span-12 flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Code (SKU)
        <input className={`${inputCls} font-label-code text-label-code`} type="text" readOnly={readOnly} value={form.sku} onChange={(e) => form.setSku(e.target.value)} />
        </label>
        <label className="col-span-12 flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Description
        <textarea className="p-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none shadow-sm" rows={2} readOnly={readOnly} value={form.description} onChange={(e) => form.setDescription(e.target.value)} />
        </label>
        <label className="col-span-12 flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Model / specification
        <input className={`${inputCls} font-label-code text-label-code`} type="text" readOnly={readOnly} value={form.modelSpec} onChange={(e) => form.setModelSpec(e.target.value)} />
        </label>
        </div>
        </section>

        <section className="flex flex-col gap-space-md">
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Tracking</h3>
        <div className="p-1 bg-surface-container rounded-lg grid grid-cols-2 gap-1">
        <button disabled={readOnly} className={`py-2 px-space-md rounded font-body-sm text-body-sm transition-all ${form.tracking === 'quantity' ? 'bg-surface-container-lowest shadow-sm text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`} type="button" onClick={() => form.setTracking('quantity')}>Count by quantity</button>
        <button disabled={readOnly} className={`py-2 px-space-md rounded font-body-sm text-body-sm transition-all ${form.tracking === 'serial' ? 'bg-surface-container-lowest shadow-sm text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`} type="button" onClick={() => form.setTracking('serial')}>Track by serial number</button>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Serial tracking gives each unit its own page on the Assets tab.</p>
        <label className="flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Unit
        <select disabled={readOnly} className={`${inputCls} font-body-sm text-body-sm cursor-pointer`} value={form.unitOfMeasure} onChange={(e) => form.setUnitOfMeasure(e.target.value)}>
        <option value="each">each</option>
        <option value="set">set</option>
        <option value="metre">metre</option>
        <option value="litre">litre</option>
        <option value="box">box</option>
        </select>
        </label>
        </section>

        <section className="flex flex-col gap-space-md">
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Cost and checks</h3>
        <div className="grid grid-cols-12 gap-space-md">
        <label className="col-span-6 flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Cost each (J$)
        <input className={`${inputCls} font-label-price text-label-price font-semibold`} type="text" inputMode="decimal" readOnly={readOnly} value={form.unitCost} onChange={(e) => form.setUnitCost(e.target.value)} data-testid="item-cost-input" />
        <span className="font-caption text-caption text-on-surface-variant">Used to pre-fill Receive and Opening balances.</span>
        </label>
        <label className="col-span-6 flex flex-col gap-1 font-caption text-caption text-on-surface-variant font-medium">Check every (days)
        <input className={`${inputCls} font-label-code text-label-code`} type="number" min="0" readOnly={readOnly} value={form.inspectionIntervalDays} onChange={(e) => form.setInspectionIntervalDays(e.target.value)} />
        <span className="font-caption text-caption text-on-surface-variant">Optional.</span>
        </label>
        </div>
        </section>
        </div>

        {!readOnly ? (
        <footer className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-sm shrink-0 border-t border-surface-container">
        <div className="flex items-center justify-between">
        <button type="button" disabled={form.isNew || form.submit.saving} onClick={() => form.archiveSteps.openConfirm()} className="px-space-md py-2 rounded-lg bg-error-container text-error font-body-sm text-body-sm font-semibold flex items-center gap-1 disabled:opacity-60" id="archive-toggle-btn">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">archive</span>
                  Archive item
                </button>
        <div className="flex items-center gap-space-sm">
        <button className="px-space-lg py-2 rounded-lg bg-error-container text-error font-body-sm text-body-sm font-semibold" id="cancel-drawer-btn" type="button" onClick={closeDrawer}>
                    Cancel
                  </button>
        <button type="button" disabled={!form.canSave || form.submit.saving} onClick={() => void form.save().catch(() => undefined)} className="px-space-xl py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold shadow-md flex items-center gap-space-xs disabled:opacity-60">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">check</span>
                    Save item
                  </button>
        </div>
        </div>
        {form.archiveSteps.confirmOpen ? (
        <div className="flex p-space-md rounded-lg bg-error-container/40 items-start gap-space-sm" id="archive-warning-box">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-error flex-shrink-0 mt-0.5">warning</span>
        <div className="flex flex-col gap-1">
        <p className="font-body-sm text-body-sm text-on-surface font-semibold">Archive {form.name.trim() || 'this item'}?</p>
        <p className="font-caption text-caption text-on-surface-variant">It stays in history but can&apos;t be received or issued.</p>
        <div className="flex items-center gap-space-sm mt-1">
        <button className="px-space-md py-1 bg-error text-on-error rounded font-caption text-caption font-bold" type="button" onClick={() => void form.confirmArchive().catch(() => undefined)}>Archive</button>
        <button className="px-space-md py-1 bg-surface-container-lowest rounded font-caption text-caption text-on-surface" id="cancel-archive-warning" type="button" onClick={() => form.archiveSteps.closeConfirm()}>Keep it</button>
        </div>
        </div>
        </div>
        ) : null}
        </footer>
        ) : null}
      </div>
      </GapLoadState>
    </GapDrawerShell>
  );
}
