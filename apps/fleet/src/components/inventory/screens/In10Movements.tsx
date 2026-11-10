/** Ported from Stitch — do not simplify layout (audit §0.4). Rows show the real ledger lines (IV-14, IV-16). */
import { useIn10MovementsForm } from './hooks/useIn10MovementsForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { formatMovementWhen, movementTypeIcon, numField, strField } from '../inventoryData';
import { formatJmd } from '../inventoryFormat';
import { InventoryPagination } from '../InventoryPagination';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';

const TYPES = ['receive', 'issue', 'transfer', 'adjust', 'reversal'];

export function In10Movements() {
  const form = useIn10MovementsForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const movementCount = form.total;
  const pageSize = 25;
  const rangeStart = form.paged.length ? form.page * pageSize + 1 : 0;
  const rangeEnd = form.page * pageSize + form.paged.length;
  const selectedMovement = form.selectedMovementId
    ? shell.movements.find((m) => strField(m, 'id', '') === form.selectedMovementId)
    : null;
  const selectedRef = selectedMovement ? strField(selectedMovement, 'ref_no', '—') : '—';
  const itemFilterName = shell.movementItemId
    ? (shell.items.find((i) => strField(i, 'id', '') === shell.movementItemId) ??
        shell.stockRows.find((r) => strField(r, 'item_id', '') === shell.movementItemId))
    : null;

  const closeReversal = () => {
    form.setSelectedMovementId(null);
    form.setReverseReason('');
  };
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="px-margin-desktop py-space-xl flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase tracking-wider mb-space-xs">
      <span>Vehicle Operations</span>
      <span className="text-outline-variant">/</span>
      <span className="text-on-surface font-semibold">Movements</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">What you have, where it is, and what every car is missing.</p>
      </div>

      <div className="flex items-center gap-space-md self-start md:self-auto">
      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[18px]">receipt_long</span>
      </div>
      <div>
      <div className="font-caption text-caption uppercase text-on-surface-variant">Movements</div>
      <div className="font-label-price text-label-price text-on-surface font-bold">{live.movementsTotal} total</div>
      </div>
      </div>
      </div>
      </div>

      <InventoryPrimaryTabs variant="ledger" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="flex items-start gap-space-md max-w-4xl">
      <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface mt-1 shrink-0">
      <span className="material-symbols-outlined text-[20px]">history</span>
      </div>
      <div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Movements — every stock change, kept forever</h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Movements are never edited or deleted. A mistake is fixed by reversing it, which adds a new line.
                </p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm shrink-0">
      <button type="button" className="flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-all shadow-sm" data-stitch-data-stitch-id="btn-export-csv" onClick={() => form.exportCsv()}>
      <span className="material-symbols-outlined text-[16px]">download</span>
      <span>Export CSV</span>
      </button>
      {!shell.readOnly ? (
      <button type="button" className="flex items-center gap-space-xs px-space-md py-2 rounded bg-primary text-on-primary font-body-sm text-body-sm font-medium transition-all shadow-sm" onClick={() => form.recordMovement()}>
      <span className="material-symbols-outlined text-[16px]">add_circle</span>
      <span>Receive stock</span>
      </button>
      ) : null}
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-space-sm justify-between">
      <div className="flex flex-wrap items-center gap-space-sm flex-1">

      <div className="relative">
      <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-on-surface-variant pointer-events-none">filter_list</span>
      <select className="bg-surface-container-low pl-8 pr-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm font-medium appearance-none cursor-pointer" value={form.typeFilter} onChange={(e) => form.setTypeFilter(e.target.value)} aria-label="Movement type">
      <option value="">All types</option>
      {TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
      </select>
      </div>

      {itemFilterName ? (
      <span className="inline-flex items-center gap-1 bg-primary-fixed text-on-surface px-3 py-1.5 rounded font-body-sm text-body-sm font-medium">
      Item: {strField(itemFilterName, 'name', 'Item')}
      <button type="button" aria-label="Show all items" className="ml-1 w-5 h-5 rounded bg-surface-container-lowest flex items-center justify-center" onClick={() => shell.setMovementItemId(null)}>
      <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
      </span>
      ) : null}

      <div className="flex-1 min-w-[240px] relative">
      <span className="material-symbols-outlined absolute left-3 top-2 text-[16px] text-on-surface-variant">search</span>
      <input className="w-full bg-surface-container-low pl-9 pr-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-all placeholder:text-on-surface-variant/60" data-stitch-data-stitch-id="movement-search" placeholder="Search item, reference or place..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)}/>
      </div>
      </div>
      <div className="flex items-center gap-space-md justify-end pt-space-xs lg:pt-0">
      <button type="button" className="px-space-md py-1.5 rounded bg-surface-container-low hover:bg-surface-container font-body-sm text-body-sm text-on-surface font-medium transition-colors" data-stitch-data-stitch-id="clear-filters-btn" onClick={() => { form.clearFilters(); shell.setMovementItemId(null); }}>
                Clear filters
              </button>
      </div>
      </div>

      <div className="relative bg-surface-container-lowest rounded-xl shadow-sm overflow-visible">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <th className="py-space-md px-space-lg font-semibold">Date & Time</th>
      <th className="py-space-md px-space-md font-semibold">Type</th>
      <th className="py-space-md px-space-md font-semibold">Item</th>
      <th className="py-space-md px-space-md font-semibold text-right">Qty</th>
      <th className="py-space-md px-space-md font-semibold text-right">Value</th>
      <th className="py-space-md px-space-lg font-semibold">From → To</th>
      <th className="py-space-md px-space-md font-semibold">Reference</th>
      <th className="py-space-md px-space-lg font-semibold">Reason / Notes</th>
      <th className="py-space-md px-space-md text-right font-semibold">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
      {form.paged.length === 0 ? (
      <tr>
      <td colSpan={9} className="py-space-xl px-space-lg font-body-sm text-body-sm text-on-surface-variant text-center">
                      No movements match.
                    </td>
      </tr>
      ) : (
      form.paged.map((m) => {
        const movementId = strField(m, 'id', '');
        const when = formatMovementWhen(strField(m, 'created_at', ''));
        const type = strField(m, 'type', 'movement');
        const names = Array.isArray(m.item_names) ? (m.item_names as string[]) : [];
        const reason = strField(m, 'reason', strField(m, 'memo', '—'));
        const isReversal = type.toLowerCase().includes('revers') || Boolean(m.reverses_movement_id);
        return (
      <tr key={movementId} className="hover:bg-surface-container-low transition-colors" data-testid="movement-row" data-type={type}>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">{when.date}</div>
      <div className="font-caption text-caption text-on-surface-variant">{when.time}</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">{movementTypeIcon(type)}</span>
                        {type.toUpperCase()}
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">{names.length ? names.join(', ') : '—'}</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap font-label-code font-bold text-on-surface">{numField(m, 'qty', 0) || '—'}</td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap font-label-price text-on-surface">{numField(m, 'value', 0) ? formatJmd(numField(m, 'value', 0)) : '—'}</td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface">{strField(m, 'from_label', '—')}</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-semibold">{strField(m, 'to_label', '—')}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface">{strField(m, 'ref_no', '—')}</div>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface">{reason}</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      {!shell.readOnly && !isReversal ? (
      <button type="button" className="px-2 py-1 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-caption text-caption font-semibold" onClick={() => form.setSelectedMovementId(movementId || null)}>
      Reverse
      </button>
      ) : null}
      </td>
      </tr>
        );
      })
      )}
      </tbody>
      </table>
      </div>

      {form.selectedMovementId ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-space-md">
      <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-xl p-space-lg" data-stitch-data-stitch-id="reversal-specimen-dialog">
      <div className="flex items-start justify-between pb-space-sm">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-error-container text-on-error-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px]">undo</span>
      </div>
      <div>
      <h3 className="font-headline-sm text-[16px] leading-5 text-on-surface font-bold">Reverse movement {selectedRef}?</h3>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Adds a correcting line; the original stays.</p>
      </div>
      </div>
      <button type="button" aria-label="Close" className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container" data-stitch-data-stitch-id="close-reversal-modal" onClick={closeReversal}>
      <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>
      <div className="py-space-md flex flex-col gap-space-md font-body-sm text-body-sm">
      {selectedMovement ? (
      <div className="bg-surface-container-low p-space-md rounded-lg font-label-code text-caption text-on-surface">
      <div>{(Array.isArray(selectedMovement.item_names) ? (selectedMovement.item_names as string[]).join(', ') : '') || '—'} × {numField(selectedMovement, 'qty', 0)}</div>
      <div className="mt-1">{strField(selectedMovement, 'to_label', '—')} → {strField(selectedMovement, 'from_label', '—')}</div>
      </div>
      ) : null}
      <div className="flex flex-col gap-space-xs">
      <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider" htmlFor="reverse-reason">Reason for reversal <span className="text-error">*</span></label>
      <textarea id="reverse-reason" className="w-full bg-surface-container-low p-2 rounded font-body-sm text-body-sm text-on-surface focus:outline-none placeholder:text-on-surface-variant/60" placeholder="What went wrong?" rows={2} value={form.reverseReason} onChange={(e) => form.setReverseReason(e.target.value)}></textarea>
      </div>
      {form.submit.error ? <div className="text-error font-body-sm" role="alert">{form.submit.error}</div> : null}
      </div>
      <div className="pt-space-md flex items-center justify-end gap-space-sm">
      <button type="button" className="px-space-md py-1.5 rounded bg-error-container text-error font-body-sm text-body-sm font-semibold transition-colors" data-stitch-data-stitch-id="cancel-reversal-btn" onClick={closeReversal}>
                  Cancel
                </button>
      <button type="button" className="px-space-md py-1.5 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold transition-all flex items-center gap-space-xs shadow-sm disabled:opacity-50" data-stitch-data-stitch-id="confirm-reversal-btn" disabled={!form.reverseReason.trim() || form.submit.saving} onClick={() => void form.confirmReversal().catch(() => undefined)}>
      <span className="material-symbols-outlined text-[16px]">undo</span>
                  Reverse
                </button>
      </div>
      </div>
      </div>
      ) : null}

      <div className="px-space-lg py-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant">Showing <strong className="text-on-surface">{rangeStart ? `${rangeStart}–${rangeEnd}` : '0'}</strong> of <strong className="text-on-surface">{movementCount}</strong> movements</span>
      <InventoryPagination page={form.page} pageCount={form.pageCount} setPage={form.setPage} />
      </div>
      </div>

      </div>
      </div></div>
    </div>
  );
}
