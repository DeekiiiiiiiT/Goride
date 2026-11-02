/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn10MovementsForm } from './hooks/useIn10MovementsForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import {
  firstOpenPoNumber,
  firstVendorName,
  formatMovementWhen,
  movementTypeIcon,
  strField,
} from '../inventoryData';
import { InventoryPagination } from '../InventoryPagination';

export function In10Movements() {
  const form = useIn10MovementsForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const vendorName = firstVendorName(live.vendors);
  const poNumber = firstOpenPoNumber(live.purchaseOrders);
  const movementCount = form.total || live.movementsTotal || live.movements.length;
  const pageSize = 25;
  const rangeStart = form.paged.length ? form.page * pageSize + 1 : 0;
  const rangeEnd = form.page * pageSize + form.paged.length;
  const selectedMovement = form.selectedMovementId
    ? shell.movements.find((m) => strField(m, 'id', '') === form.selectedMovementId)
    : null;
  const selectedRef = selectedMovement
    ? strField(selectedMovement, 'ref_no', form.selectedMovementId ?? '—')
    : '—';

  const closeReversal = () => {
    form.setSelectedMovementId(null);
    form.setReverseReason('');
  };
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-surface-container-low px-margin-desktop py-space-sm flex items-center justify-between">
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
      <span className="font-semibold text-on-surface uppercase tracking-wider">Custody Node:</span>
      <span>KGN-LEDGER-01</span>
      </div>
      <span className="text-surface-variant">|</span>
      <div className="flex items-center gap-space-xs font-caption text-caption text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px]">lock</span>
      <span>Append-only state verified (Block #11,942)</span>
      </div>
      </div>
      <div className="flex items-center gap-space-sm font-label-code text-caption text-on-surface-variant">
      <span>08:47 PM EST · America/Jamaica · JM (JMD) · DE · Deeki T · <strong className="text-on-surface font-semibold">platform_owner</strong></span>
      </div>
      </div>

      <div className="px-margin-desktop py-space-xl flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase tracking-wider mb-space-xs">
      <span>Fleet Operations</span>
      <span className="text-outline-variant">/</span>
      <span className="text-on-surface font-semibold">Vehicle Operations</span>
      <span className="text-outline-variant">/</span>
      <span>Warehousing & Telematics</span>
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
      <div className="font-caption text-caption uppercase text-on-surface-variant">Ledger Entries</div>
      <div className="font-label-price text-label-price text-on-surface font-bold">1,842 total</div>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center gap-space-md">
      <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-[18px]">security</span>
      </div>
      <div>
      <div className="font-caption text-caption uppercase text-on-surface-variant">Zero Tamper State</div>
      <div className="font-label-code text-caption text-on-surface font-semibold">100% SHA-256</div>
      </div>
      </div>
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto py-1">
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Overview</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Stock</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Vehicle kits</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Assets</a>

      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm bg-primary text-on-primary font-semibold shadow-sm flex items-center gap-space-xs" href="#">
      <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
              Movements
            </a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Purchasing</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all" href="#">Counts</a>
      <a className="px-space-md py-space-sm rounded font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all flex items-center gap-space-xs" href="#">
      <span>Alerts</span>
      <span className="bg-error-container text-on-error-container font-label-code text-[11px] px-1.5 py-0.2 rounded-full font-bold">5</span>
      </a>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
      <div className="flex items-start gap-space-md max-w-4xl">
      <div className="w-10 h-10 rounded bg-surface-container-low flex items-center justify-center text-on-surface mt-1 shrink-0">
      <span className="material-symbols-outlined text-[20px]">enhanced_encryption</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Movements — every stock change, kept forever</h2>
      <span className="font-label-code text-[11px] bg-surface-container px-2 py-0.5 rounded text-on-surface uppercase font-semibold">Immutable Ledger</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Cryptographic, append-only custody ledger. Movements can never be edited or deleted — corrections occur solely via auditable reversals with linked cryptographic trails.
                </p>
      </div>
      </div>
      <div className="flex items-center gap-space-sm shrink-0">
      <button type="button" className="flex items-center gap-space-xs px-space-md py-2 rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-all shadow-sm" data-stitch-data-stitch-id="btn-export-csv" onClick={() => form.exportCsv()}>
      <span className="material-symbols-outlined text-[16px]">download</span>
      <span>Export CSV</span>
      </button>
      <button type="button" className="flex items-center gap-space-xs px-space-md py-2 rounded bg-primary text-on-primary font-body-sm text-body-sm font-medium transition-all shadow-sm" onClick={() => form.recordMovement()}>
      <span className="material-symbols-outlined text-[16px]">add_circle</span>
      <span>Record Movement</span>
      </button>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-space-sm justify-between">
      <div className="flex flex-wrap items-center gap-space-sm flex-1">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">calendar_today</span>
      <span className="font-medium">Last 30 days</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">filter_list</span>
      <span className="font-medium">All types</span>
      <span className="font-caption text-caption text-on-surface-variant">(RECEIVE, ISSUE, RET, XFER, REVERSAL)</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">location_on</span>
      <span className="font-medium">All locations</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low px-3 py-1.5 rounded text-on-surface font-body-sm text-body-sm cursor-pointer hover:bg-surface-container transition-colors">
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">person_outline</span>
      <span className="font-medium">All actors</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_drop_down</span>
      </div>

      <div className="flex-1 min-w-[240px] relative">
      <span className="material-symbols-outlined absolute left-3 top-2 text-[16px] text-on-surface-variant">search</span>
      <input className="w-full bg-surface-container-low pl-9 pr-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest transition-all placeholder:text-on-surface-variant/60" data-stitch-data-stitch-id="movement-search" placeholder="Search item, SKU, reference or car..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)}/>
      </div>
      </div>
      <div className="flex items-center gap-space-md justify-end pt-space-xs lg:pt-0">
      <button type="button" className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface transition-colors underline decoration-outline-variant" data-stitch-data-stitch-id="clear-filters-btn" onClick={() => form.clearFilters()}>
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
      <th className="py-space-md px-space-md font-semibold">Type Tag</th>
      <th className="py-space-md px-space-md font-semibold">Item & SKU</th>
      <th className="py-space-md px-space-md font-semibold text-right">Qty</th>
      <th className="py-space-md px-space-lg font-semibold">From → To</th>
      <th className="py-space-md px-space-md font-semibold">Reference / PO</th>
      <th className="py-space-md px-space-md font-semibold">Recorded By</th>
      <th className="py-space-md px-space-lg font-semibold">Reason / Notes</th>
      <th className="py-space-md px-space-md text-right font-semibold">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
      {form.paged.length === 0 ? (
      <tr>
      <td colSpan={9} className="py-space-xl px-space-lg font-body-sm text-body-sm text-on-surface-variant text-center">
                      No movements recorded yet.
                    </td>
      </tr>
      ) : (
      form.paged.map((m) => {
        const movementId = strField(m, 'id', '');
        const rowKey = movementId || strField(m, 'ref_no', String(Math.random()));
        const when = formatMovementWhen(strField(m, 'created_at', ''));
        const type = strField(m, 'type', 'movement');
        const typeLabel = type.toUpperCase();
        const icon = movementTypeIcon(type);
        const refNo = strField(m, 'ref_no', '—');
        const reason = strField(m, 'reason', strField(m, 'memo', '—'));
        const refType = strField(m, 'reference_type', '');
        const poRef = refType.includes('purchase') ? refNo : poNumber;
        const fromLabel = type.toLowerCase().includes('receive') ? vendorName : live.hubShort;
        const toLabel = live.hubName;
        return (
      <tr key={rowKey} className="hover:bg-surface-container-low transition-colors">
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="font-label-code text-label-code font-semibold text-on-surface">{when.date}</div>
      <div className="font-caption text-caption text-on-surface-variant">{when.time}</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="inline-flex items-center gap-1 font-label-code text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface">
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
                        {typeLabel}
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <div className="font-medium text-on-surface">{refType || 'Movement'}</div>
      <div className="font-label-code text-caption text-on-surface-variant tracking-wide">{refNo}</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <span className="font-label-price text-label-price font-bold text-on-surface">—</span>
      </td>
      <td className="py-space-md px-space-lg whitespace-nowrap">
      <div className="flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface">{fromLabel}</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-semibold">{toLabel}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <div className="font-label-code text-label-code text-on-surface font-semibold">{poRef}</div>
      </td>
      <td className="py-space-md px-space-md whitespace-nowrap">
      <span className="text-on-surface font-medium">—</span>
      </td>
      <td className="py-space-md px-space-lg">
      <div className="text-on-surface">{reason}</div>
      </td>
      <td className="py-space-md px-space-md text-right whitespace-nowrap">
      <button type="button" className="p-1 hover:bg-surface-container rounded text-on-surface-variant hover:text-on-surface transition-colors" onClick={() => form.setSelectedMovementId(movementId || null)}>
      <span className="material-symbols-outlined text-[18px]">more_horiz</span>
      </button>
      </td>
      </tr>
        );
      })
      )}
      </tbody>
      </table>
      </div>

      <div className={`${form.selectedMovementId ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-space-md' : 'hidden'}`}>
      <div className={`${form.selectedMovementId ? 'w-full max-w-md bg-surface-container-lowest rounded-xl shadow-xl p-space-lg animate-in fade-in zoom-in-95' : ''}`} data-stitch-data-stitch-id="reversal-specimen-dialog">
      <div className="flex items-start justify-between pb-space-sm">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-error-container text-on-error-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px]">undo</span>
      </div>
      <div>
      <h3 className="font-headline-sm text-[16px] leading-5 text-on-surface font-bold">Reverse movement #{selectedRef}?</h3>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Append-only correction action</p>
      </div>
      </div>
      <button type="button" className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container" data-stitch-data-stitch-id="close-reversal-modal" onClick={closeReversal}>
      <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
      </div>
      <div className="py-space-md flex flex-col gap-space-md font-body-sm text-body-sm">
      <p className="text-on-surface-variant leading-relaxed text-[13px]">
                  Reversals cannot be undone. A new <strong className="text-on-surface font-label-code">REVERSAL</strong> line will be appended to the ledger to restore inventory balances.
                </p>

      <div className="bg-surface-container-low p-space-md rounded-lg">
      <div className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider mb-1">State Modification Preview</div>
      <div className="font-label-code text-caption text-on-surface flex items-center justify-between">
      <span>Main store — Kingston</span>
      <span className="font-bold text-on-surface">ACC-PHM-01</span>
      </div>
      <div className="flex items-center gap-2 mt-1 font-label-price text-label-price">
      <span className="text-on-surface">6 in stock</span>
      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">arrow_forward</span>
      <span className="text-on-surface font-bold">1 in stock</span>
      <span className="font-label-code text-caption font-semibold text-on-surface-variant bg-surface-container px-1.5 py-0.2 rounded">(−5)</span>
      </div>
      </div>

      <div className="flex flex-col gap-space-xs">
      <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Reason for reversal <span className="text-error">*</span></label>
      <select className="w-full bg-surface-container-low px-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface focus:outline-none" value={form.reverseReason} onChange={(e) => form.setReverseReason(e.target.value)}>
      <option value="">Select a reason…</option>
      <option value="Incorrect quantity entered / Vendor delivery discrepancy">Incorrect quantity entered / Vendor delivery discrepancy</option>
      <option value="Duplicate receipt logged">Duplicate receipt logged</option>
      <option value="Damaged in transit upon final inspection">Damaged in transit upon final inspection</option>
      <option value="Administrative clerical correction">Administrative clerical correction</option>
      </select>
      </div>
      <div className="flex flex-col gap-space-xs">
      <label className="font-caption text-caption uppercase text-on-surface-variant font-semibold tracking-wider">Audit notes <span className="text-error">*</span></label>
      <textarea className="w-full bg-surface-container-low p-2 rounded font-body-sm text-body-sm text-on-surface focus:outline-none placeholder:text-on-surface-variant/60" placeholder="E.g. Dispatched with bill of lading #004-B revision by —." rows={2} value={form.reverseReason} onChange={(e) => form.setReverseReason(e.target.value)}></textarea>
      </div>
      </div>
      <div className="pt-space-md flex items-center justify-end gap-space-sm">
      <button type="button" className="px-space-md py-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-body-sm text-body-sm transition-colors" data-stitch-data-stitch-id="cancel-reversal-btn" onClick={closeReversal}>
                  Cancel
                </button>
      <button type="button" className="px-space-md py-1.5 rounded bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-on-surface transition-all flex items-center gap-space-xs shadow-sm disabled:opacity-50" data-stitch-data-stitch-id="confirm-reversal-btn" disabled={!form.reverseReason.trim() || form.submit.saving} onClick={() => void form.confirmReversal()}>
      <span className="material-symbols-outlined text-[16px]">verified</span>
                  Confirm Reversal
                </button>
      </div>
      </div>
      </div>

      <div className="px-space-lg py-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <span className="font-body-sm text-body-sm text-on-surface-variant">Showing <strong className="text-on-surface">{rangeStart ? `${rangeStart}–${rangeEnd}` : '0'}</strong> of <strong className="text-on-surface">{movementCount}</strong> movements</span>
      <span className="text-surface-variant hidden sm:inline">|</span>
      <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px]">lock_clock</span>
      <span>Immutable block SHA-256: <span className="text-on-surface font-semibold underline decoration-dotted">7f8c92b449e7...a19</span> verified</span>
      </div>
      </div>

      <InventoryPagination page={form.page} pageCount={form.pageCount} setPage={form.setPage} />
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg mt-space-md mb-space-xl">

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Active Depot Storage</span>
      <span className="w-2 h-2 rounded-full bg-primary"></span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Kingston Central Vault</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Primary warehouse for Caribbean rideshare installation kits and fleet telematics spares.</p>
      </div>
      <div className="mt-space-md pt-space-sm flex items-center justify-between font-label-code text-caption text-on-surface">
      <span>Bin capacity: 84% utilized</span>
      <span className="font-bold">Zone B-14</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Audit Compliance</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface">gavel</span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Zero-Overwrite Policy</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Every physical piece of equipment retains end-to-end custody logs from supplier port landing to vehicle installation.</p>
      </div>
      <div className="mt-space-md pt-space-sm flex items-center justify-between font-label-code text-caption text-on-surface">
      <span>Reversal frequency: 0.14%</span>
      <span className="font-bold">Strict Audit</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant font-semibold">Cryptographic Trail</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface">fingerprint</span>
      </div>
      <h4 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Chain Consistency</h4>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">All 1,842 block hashes validated against Jamaica Operations root cert with zero broken lineages.</p>
      </div>
      <div className="mt-space-md pt-space-sm flex items-center justify-between">
      <span className="font-label-code text-caption text-on-surface">Last verify: 2 mins ago</span>
      <button type="button" onClick={() => void shell.verifyLedger()} className="font-body-sm text-body-sm text-on-surface font-semibold hover:underline">Verify now</button>
      </div>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
