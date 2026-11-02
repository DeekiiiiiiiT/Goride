/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn2StockForm } from './hooks/useIn2StockForm';
import { In2StockTable } from '../In2StockTable';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';

export function In2Stock() {
  const form = useIn2StockForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const count = form.filteredCount;
  const rows = form.pagedRows;

  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-primary-container px-margin-desktop py-space-sm flex items-center justify-between text-surface-dim shadow-inner">
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs">
      <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
      <span className="font-label-code text-caption text-surface-container-lowest">08:20:30 AM EST · America/Jamaica · JM (JMD)</span>
      </div>
      <span className="text-on-primary-container/40">/</span>
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-caption bg-surface-container-highest/20 px-1.5 py-0.5 rounded text-surface-dim">DE</span>
      <span className="font-body-sm text-body-sm text-surface-dim font-medium">Deeki T</span>
      <span className="font-label-code text-[10px] text-surface-variant bg-surface-tint/30 px-1 rounded">platform_owner</span>
      </div>
      </div>
      <div className="flex items-center gap-space-lg">
      <span className="font-caption text-caption text-surface-dim uppercase tracking-wider">Storage Node: Primary Warehouse Alpha</span>
      <div className="h-3 w-px bg-outline-variant/30"></div>
      <div className="flex items-center gap-1 text-surface-dim">
      <span className="material-symbols-outlined text-[14px]">lock_clock</span>
      <span className="font-label-code text-caption">Immutable Audit Stream Active</span>
      </div>
      </div>
      </div>

      <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-lg">

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md pb-space-sm">
      <div className="flex flex-col gap-1">
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Inventory Logistics / Stores</span>
      <span className="text-outline-variant">›</span>
      <span className="font-caption text-caption text-on-surface-variant">{live.hubShort}</span>
      </div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Inventory & Asset Management</h1>
      </div>

      <div className="bg-surface-container-high p-1 rounded-lg flex items-center gap-1 shadow-sm">
      <button type="button" className="bg-surface-container-lowest text-primary shadow-sm px-space-md py-1.5 rounded font-body-sm text-body-sm font-semibold transition-all" onClick={() => shell.setTab('stock')}>
                Stock
              </button>
      <button type="button" onClick={() => shell.setTab('movements')} className="text-on-surface-variant hover:text-on-surface px-space-md py-1.5 rounded font-body-sm text-body-sm font-medium transition-colors">
                Movements & Audits
              </button>
      <button type="button" onClick={() => shell.setTab('purchasing')} className="text-on-surface-variant hover:text-on-surface px-space-md py-1.5 rounded font-body-sm text-body-sm font-medium transition-colors">
                Purchase Orders
              </button>
      <button type="button" className="text-on-surface-variant hover:text-on-surface px-space-md py-1.5 rounded font-body-sm text-body-sm font-medium transition-colors" onClick={() => form.openSuppliers()}>
                Suppliers
              </button>
      <button type="button" onClick={() => shell.setTab('vehicle-kits')} className="text-on-surface-variant hover:text-on-surface px-space-md py-1.5 rounded font-body-sm text-body-sm font-medium transition-colors">
                Fleet Kit Sets
              </button>
      </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Stock Inventory</h2>
      <span className="bg-surface-container-high text-on-surface font-label-code text-caption px-2 py-0.5 rounded-full font-semibold">{count} items</span>
      </div>
      <div className="flex items-center gap-space-sm w-full sm:w-auto">

      <div className="relative min-w-[160px]">
      <span className="material-symbols-outlined absolute left-3 top-2.5 text-[16px] text-secondary pointer-events-none">location_on</span>
      <select
        className="w-full h-9 pl-9 pr-8 bg-surface-container-lowest text-on-surface rounded font-body-sm text-body-sm font-medium shadow-sm appearance-none cursor-pointer focus:outline-none"
        value={form.locationFilter}
        onChange={(e) => form.setLocationFilter(e.target.value)}
      >
      <option value="all">All locations</option>
      {form.locationOptions.map((loc) => (
        <option key={loc.id} value={loc.id}>{loc.label}</option>
      ))}
      </select>
      <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[16px] text-secondary pointer-events-none">arrow_drop_down</span>
      </div>

      <div className="relative group">
      <button type="button" onClick={() => shell.openModal('receive')} className="h-9 px-space-md bg-primary text-on-primary rounded font-body-sm text-body-sm font-semibold flex items-center gap-space-xs hover:bg-surface-tint transition-colors shadow-sm">
      <span className="material-symbols-outlined text-[18px]">add</span>
      <span>Add item</span>
      </button>

      <div className="absolute right-0 top-full mt-2 w-72 p-space-sm bg-inverse-surface text-inverse-on-surface rounded shadow-xl text-caption font-body-sm opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30">
      <div className="flex items-start gap-1.5">
      <span className="material-symbols-outlined text-[14px] text-tertiary-fixed-dim shrink-0 mt-0.5">info</span>
      <span>Adds item definition to catalogue, quantities only change via audit transactions.</span>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center gap-space-md">

      <div className="relative flex-1">
      <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-secondary">search</span>
      <input className="w-full h-9 pl-9 pr-space-md bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest transition-all" placeholder="Search name, SKU or serial..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)}/>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap items-center gap-space-sm">

      <div className="relative min-w-[170px] flex-1 sm:flex-initial">
      <select className="w-full h-9 px-space-md pr-8 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm font-medium appearance-none cursor-pointer focus:outline-none" value={form.categoryFilter} onChange={(e) => form.setCategoryFilter(e.target.value)}>
      <option value="">All categories</option>
      <option>Electronics</option>
      <option>Tires & wheels</option>
      <option>Tools & roadside</option>
      <option>Safety equipment</option>
      <option>Interior & accessories</option>
      </select>
      <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[16px] text-secondary pointer-events-none">arrow_drop_down</span>
      </div>

      <div className="relative min-w-[190px] flex-1 sm:flex-initial">
      <select className="w-full h-9 px-space-md pr-8 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm font-medium appearance-none cursor-pointer focus:outline-none" value={form.statusFilter} onChange={(e) => form.setStatusFilter(e.target.value)}>
      <option value="">All statuses (OK, Low, Out)</option>
      <option value="ok">Status: OK</option>
      <option value="low">Status: Low</option>
      <option value="out">Status: Out</option>
      </select>
      <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[16px] text-secondary pointer-events-none">arrow_drop_down</span>
      </div>

      <div className="relative min-w-[210px] flex-1 sm:flex-initial">
      <select className="w-full h-9 px-space-md pr-8 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm font-medium appearance-none cursor-pointer focus:outline-none" value={form.typeFilter} onChange={(e) => form.setTypeFilter(e.target.value)}>
      <option value="">All types (Quantity / Tracked)</option>
      <option value="quantity">Type: Quantity Batch</option>
      <option value="serial">Type: Tracked by Serial</option>
      </select>
      <span className="material-symbols-outlined absolute right-2.5 top-2.5 text-[16px] text-secondary pointer-events-none">arrow_drop_down</span>
      </div>
      <button type="button" className="h-9 px-space-md bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded font-body-sm text-body-sm font-medium flex items-center gap-1 transition-colors" onClick={() => form.resetFilters()}>
      <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
      <span>Reset</span>
      </button>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden flex flex-col">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low/70">
      <th className="py-space-md px-space-lg font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Item & SKU</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Category</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Location</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">On hand</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">Reserved</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">Available</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">Reorder at</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">Avg cost</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">Value</th>
      <th className="py-space-md px-space-md font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-center">Status</th>
      <th className="py-space-md px-space-lg font-caption text-caption uppercase text-secondary font-semibold tracking-wider text-right">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">
      <In2StockTable rows={rows} shell={shell} primaryPlate={live.primaryPlate} />
      </tbody>
      </table>
      </div>

      <div className="px-space-lg py-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md font-body-sm text-body-sm text-on-surface-variant">
      <span>Showing <strong className="text-on-surface font-semibold">{form.pageStart ? `${form.pageStart}–${form.pageEnd}` : '0'}</strong> of <strong className="text-on-surface font-semibold">{count}</strong> items</span>
      <div className="h-4 w-px bg-outline-variant/40"></div>
      <div className="flex items-center gap-1">
      <button type="button" className="h-7 w-7 rounded flex items-center justify-center text-outline/50 bg-surface-container-lowest disabled:opacity-50" disabled={form.page <= 0} onClick={() => form.setPage(Math.max(0, form.page - 1))}>
      <span className="material-symbols-outlined text-[16px]">chevron_left</span>
      </button>
      <span className="px-2 font-label-code text-caption text-on-surface font-bold">Page {form.page + 1} of {form.pageCount}</span>
      <button type="button" className="h-7 w-7 rounded flex items-center justify-center text-outline/50 bg-surface-container-lowest disabled:opacity-50" disabled={form.page >= form.pageCount - 1} onClick={() => form.setPage(Math.min(form.pageCount - 1, form.page + 1))}>
      <span className="material-symbols-outlined text-[16px]">chevron_right</span>
      </button>
      </div>
      </div>
      <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-1.5 rounded shadow-sm">
      <span className="font-caption text-caption text-secondary uppercase font-semibold">Total catalogue value:</span>
      <span className="font-label-price text-label-price text-on-surface font-bold">{live.totalStockValue}</span>
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center justify-between">
      <div>
      <div className="font-caption text-caption uppercase text-secondary font-semibold">Active Capital Depots</div>
      <div className="font-headline-sm text-headline-sm font-bold text-on-surface mt-0.5">2 Nodes</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Main store + Vehicle Deployments</div>
      </div>
      <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[20px]">account_balance</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center justify-between">
      <div>
      <div className="font-caption text-caption uppercase text-secondary font-semibold">Replenishment Triggers</div>
      <div className="font-headline-sm text-headline-sm font-bold text-error mt-0.5">4 Critical Items</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">1 Low Stock · 3 Completely Depleted</div>
      </div>
      <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center text-on-error-container">
      <span className="material-symbols-outlined text-[20px]">notification_important</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex items-center justify-between">
      <div>
      <div className="font-caption text-caption uppercase text-secondary font-semibold">Inventory Ledger Drift</div>
      <div className="font-headline-sm text-headline-sm font-bold text-on-surface mt-0.5">0.00% Zero-Loss</div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Reconciled 2 hrs ago by Deeki T</div>
      </div>
      <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-[20px]">verified</span>
      </div>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
