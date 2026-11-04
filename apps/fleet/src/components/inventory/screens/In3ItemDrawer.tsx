/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn3ItemDrawerForm } from './hooks/useIn3ItemDrawerForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { firstOpenPoNumber, firstVendorName, strField } from '../inventoryData';
export function In3ItemDrawer() {
  const form = useIn3ItemDrawerForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const vendorName = firstVendorName(live.vendors);
  const poNumber = firstOpenPoNumber(live.purchaseOrders);
  const item = live.selectedItem;
  const primarySub = live.primaryVehicle
    ? `${live.primaryPlate} · ${strField(item ?? {}, 'name', 'Kit item')}`
    : live.primaryPlate;
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

      <div className="w-full px-margin-desktop py-space-lg flex flex-col gap-space-lg">

      <div className="flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm font-caption text-caption text-on-surface-variant uppercase tracking-wider">
      <span className="font-medium text-surface-tint">Logistics</span>
      <span>/</span>
      <span className="font-medium text-surface-tint">Stores</span>
      <span>/</span>
      <span className="font-bold text-on-surface">Kingston Fleet Base</span>
      <span className="mx-space-xs text-outline-variant">·</span>
      <span className="bg-surface-container px-space-sm py-0.5 rounded text-on-surface font-label-code text-[11px] font-semibold">STORAGE NODE: ALPHA-01</span>
      </div>
      <div className="flex items-center gap-space-md">
      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-sm py-1 rounded">
      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
      <span className="font-label-code text-[11px] text-on-surface font-medium">Immutable Audit Stream Active</span>
      </div>
      <span className="font-caption text-caption text-on-surface-variant">Ledger: SHA-256 Verified</span>
      </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div>
      <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Real-time stock valuation, fleet kit deployments, and serial tracking across {live.hubShort} nodes.</p>
      </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="px-space-md py-1.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors font-body-sm text-body-sm font-semibold flex items-center gap-space-xs" onClick={() => form.exportMovements()}>
      <span className="material-symbols-outlined text-[16px]">file_download</span>
      <span>Export CSV</span>
      </button>
      <button type="button" className="px-space-md py-1.5 rounded bg-primary text-on-primary hover:bg-primary/90 transition-colors font-body-sm text-body-sm font-semibold flex items-center gap-space-xs" onClick={() => form.openNewStockItem()}>
      <span className="material-symbols-outlined text-[16px]">add</span>
      <span>New Stock Item</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-space-xs bg-surface-container-low p-1 rounded-lg w-fit">
      <button type="button" className="px-space-md py-1.5 rounded bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-bold shadow-sm flex items-center gap-space-xs" onClick={() => form.goToInventoryTab('stock')}>
      <span className="material-symbols-outlined text-[16px]">inventory_2</span>
      <span>Stock ({form.stockTabCount})</span>
      </button>
      <button type="button" className="px-space-md py-1.5 rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-medium transition-colors" onClick={() => form.goToInventoryTab('movements')}>
              Movements & Audits
            </button>
      <button type="button" className="px-space-md py-1.5 rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-medium transition-colors" onClick={() => form.goToInventoryTab('pos')}>
              Purchase Orders
            </button>
      <button type="button" className="px-space-md py-1.5 rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-medium transition-colors" onClick={() => form.goToInventoryTab('suppliers')}>
              Suppliers
            </button>
      <button type="button" className="px-space-md py-1.5 rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm font-medium transition-colors" onClick={() => form.goToInventoryTab('kits')}>
              Fleet Kit Sets
            </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md">
      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-1">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Total Inventory Value</span>
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">{form.valueLabels.stockValue}</span>
      <span className="font-caption text-caption text-secondary font-medium">1,412 active units in custody</span>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-1">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Low Stock Triggers</span>
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-space-xs">
      <span>7 items</span>
      <span className="w-2 h-2 rounded-full bg-tertiary-container"></span>
      </span>
      <span className="font-caption text-caption text-on-surface-variant font-medium">Reorder recommended</span>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-1">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Installed on Vehicles</span>
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">842 items</span>
      <span className="font-caption text-caption text-secondary font-medium">Across 86 registered chassis</span>
      </div>
      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col gap-1">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Discrepancy Rate</span>
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">0.00%</span>
      <span className="font-caption text-caption text-secondary font-medium">Last cycle count: Today 06:00</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm flex flex-col">
      <div className="p-space-md bg-surface-container-low flex flex-wrap items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-sm flex-1 max-w-md">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">search</span>
      <input className="bg-surface-container-lowest px-space-md py-1.5 rounded text-on-surface font-body-sm text-body-sm w-full outline-none focus:bg-surface-container-lowest" placeholder="Search by SKU, item name, chassis, kit..." type="text" value={form.drawerSearch} onChange={(e) => form.setDrawerSearch(e.target.value)}/>
      </div>
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption text-on-surface-variant">Filter category:</span>
      <span className="px-space-sm py-1 rounded bg-surface-container text-on-surface font-caption text-caption font-semibold">Accessories (All)</span>
      </div>
      </div>
      <div className="overflow-x-auto w-full">
      <table className="w-full text-left text-on-surface">
      <thead className="bg-surface-container-low/60 font-caption text-caption uppercase tracking-wider text-on-surface-variant">
      <tr>
      <th className="py-space-sm px-space-md">SKU & Code</th>
      <th className="py-space-sm px-space-md">Item Description</th>
      <th className="py-space-sm px-space-md">Category</th>
      <th className="py-space-sm px-space-md">Stock Level</th>
      <th className="py-space-sm px-space-md">Installed</th>
      <th className="py-space-sm px-space-md">Avg Unit Cost</th>
      <th className="py-space-sm px-space-md">Status</th>
      <th className="py-space-sm px-space-md text-right">Actions</th>
      </tr>
      </thead>
      <tbody className="font-body-sm text-body-sm">
      {form.stockBrowseRows.length === 0 ? (
      <tr>
      <td colSpan={8} className="py-space-lg text-center text-on-surface-variant">No stock rows match this search.</td>
      </tr>
      ) : (
      form.stockBrowseRows.map((row, index) => (
      <tr key={row.id || row.sku} className={index === 0 ? 'bg-primary/5 transition-colors cursor-pointer' : 'hover:bg-surface-container-low/40 transition-colors'}>
      <td className="py-space-md px-space-md font-label-code text-label-code font-bold text-on-surface flex items-center gap-space-xs">
      {index === 0 ? <span className="w-1.5 h-6 rounded-full bg-primary inline-block mr-1"></span> : null}
      {row.sku}
      </td>
      <td className="py-space-md px-space-md">
      <div className="flex flex-col">
      <span className="font-bold text-on-surface">{row.name}</span>
      <span className="font-caption text-caption text-on-surface-variant">{row.locationLabel}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md text-on-surface-variant">{row.locationLabel}</td>
      <td className="py-space-md px-space-md font-label-code text-label-code font-bold text-on-surface">{row.qtyLabel}</td>
      <td className="py-space-md px-space-md font-label-code text-label-code text-on-surface-variant">—</td>
      <td className="py-space-md px-space-md font-label-price text-label-price text-on-surface">{row.valueLabel}</td>
      <td className="py-space-md px-space-md">
      <span className="px-space-sm py-0.5 rounded-full bg-surface-container text-on-surface font-caption text-caption font-medium">—</span>
      </td>
      <td className="py-space-md px-space-md text-right">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
      </td>
      </tr>
      ))
      )}
      </tbody>
      </table>
      </div>
      </div>
      </div>

      <div className="fixed inset-0 top-32 z-40 bg-on-surface/40 backdrop-blur-[2px] transition-opacity duration-200" data-stitch-data-stitch-id="drawerScrim" ></div>

      <aside aria-labelledby="drawerTitle" aria-modal="true" className="fixed top-32 right-0 bottom-0 z-50 w-full max-w-[570px] bg-surface-container-lowest shadow-2xl flex flex-col overflow-hidden text-on-surface transition-transform duration-200 ease-out" data-stitch-data-stitch-id="itemDrawer" role="dialog">

      <div className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-sm shrink-0">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="font-caption text-caption uppercase tracking-wider text-surface-tint font-bold">Item Detail Ledger</span>
      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
      <span className="font-label-code text-[11px] text-on-surface-variant">ID: 884-FLT</span>
      </div>

      <button type="button" className="flex items-center gap-space-xs px-2 py-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant hover:text-on-surface"  title="Close drawer (Esc)" onClick={() => form.close()}>
      <span className="font-label-code text-[10px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">ESC</span>
      <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      </div>
      <div className="flex items-start justify-between gap-space-md">
      <div className="flex flex-col">
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight" data-stitch-data-stitch-id="drawerTitle">{form.drawerRow?.name ?? 'Select an item'}</h2>
      <button type="button" className="p-1 rounded hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" title="Edit item metadata — name, category, SKU, photo, reorder rule; quantities are immutable" onClick={() => form.openEditItem()}>
      <span className="material-symbols-outlined text-[18px]">edit</span>
      </button>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Heavy-duty magnetic dashboard phone clamp (Rideshare standard spec).</p>
      </div>
      <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-primary text-[28px]">smartphone</span>
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-space-xs pt-1">
      <span className="font-label-code text-label-code font-bold bg-surface-container px-space-sm py-0.5 rounded text-on-surface">{form.drawerRow?.sku ?? '—'}</span>
      <span className="font-caption text-caption bg-surface-container-low px-space-sm py-0.5 rounded text-on-surface-variant font-medium">Counted by quantity</span>
      <span className="font-caption text-caption bg-tertiary-container/10 px-space-sm py-0.5 rounded-full text-on-tertiary-container font-bold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                Low Stock
              </span>
      <span className="font-caption text-caption bg-surface-container-low px-space-sm py-0.5 rounded text-on-surface-variant">Active Kit Asset</span>
      </div>
      </div>

      <div className="flex-1 overflow-y-auto p-space-lg flex flex-col gap-space-xl bg-surface-container-lowest">

      <div className="grid grid-cols-2 gap-space-sm">
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">On Hand</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">inventory</span>
      </div>
      <div className="my-space-xs">
      <span className="font-headline-lg text-headline-lg font-bold font-label-code text-on-surface">1</span>
      </div>
      <span className="font-caption text-caption text-secondary font-medium">1 unit in store</span>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Reserved</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">lock_clock</span>
      </div>
      <div className="my-space-xs">
      <span className="font-headline-lg text-headline-lg font-bold font-label-code text-on-surface">0</span>
      </div>
      <span className="font-caption text-caption text-secondary font-medium">Ready to dispatch</span>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Avg Cost</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">payments</span>
      </div>
      <div className="my-space-xs">
      <span className="font-label-price text-headline-sm font-bold text-on-surface">{form.valueLabels.stockValue}</span>
      </div>
      <span className="font-caption text-caption text-secondary font-medium">FIFO weighted landed</span>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Total Value</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">account_balance_wallet</span>
      </div>
      <div className="my-space-xs">
      <span className="font-label-price text-headline-sm font-bold text-on-surface">{form.valueLabels.stockValue}</span>
      </div>
      <span className="font-caption text-caption text-secondary font-medium">Current asset base</span>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">location_on</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Where it is</h3>
      </div>
      <span className="font-caption text-caption text-on-surface-variant">Depot & vehicle allocations</span>
      </div>
      <div className="bg-surface-container-low rounded-lg overflow-hidden">
      <table className="w-full text-left">
      <thead className="bg-surface-container font-caption text-caption uppercase tracking-wider text-on-surface-variant">
      <tr>
      <th className="py-space-sm px-space-md">Location</th>
      <th className="py-space-sm px-space-sm text-center">On hand</th>
      <th className="py-space-sm px-space-sm text-center">Reserved</th>
      <th className="py-space-sm px-space-md text-right">Status</th>
      </tr>
      </thead>
      <tbody className="font-body-sm text-body-sm divide-y-0">
      <tr className="bg-surface-container-lowest">
      <td className="py-space-sm px-space-md">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px] text-on-surface">warehouse</span>
      </div>
      <div className="flex flex-col">
      <span className="font-bold text-on-surface">Main store — Kingston</span>
      <span className="font-caption text-caption text-on-surface-variant">Shelf B-04 · Bin 12</span>
      </div>
      </div>
      </td>
      <td className="py-space-sm px-space-sm text-center font-label-code text-label-code font-bold text-on-surface">1</td>
      <td className="py-space-sm px-space-sm text-center font-label-code text-label-code text-on-surface-variant">0</td>
      <td className="py-space-sm px-space-md text-right">
      <span className="px-space-sm py-0.5 rounded bg-surface-container text-on-surface font-caption text-caption font-semibold">In stock</span>
      </td>
      </tr>
      <tr className="bg-surface-container-lowest">
      <td className="py-space-sm px-space-md">
      <div className="flex items-center gap-space-sm">
      <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[16px] text-on-surface">directions_car</span>
      </div>
      <div className="flex flex-col">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-plate text-label-plate text-on-surface">{live.primaryPlate}</span>
      <span className="font-caption text-caption text-on-surface-variant">(on car)</span>
      </div>
      <span className="font-caption text-caption text-on-surface-variant">{primarySub}</span>
      </div>
      </div>
      </td>
      <td className="py-space-sm px-space-sm text-center font-label-code text-label-code font-bold text-on-surface">1</td>
      <td className="py-space-sm px-space-sm text-center font-label-code text-label-code text-on-surface-variant">0</td>
      <td className="py-space-sm px-space-md text-right">
      <span className="px-space-sm py-0.5 rounded bg-surface-container-high text-on-surface font-caption text-caption font-semibold">Installed</span>
      </td>
      </tr>
      </tbody>
      </table>
      <div className="p-space-sm bg-surface-container-low text-on-surface-variant font-caption text-caption flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[14px]">info</span>
      <span>Total 2 units across fleet & depot nodes. Quantities update strictly via immutable movement events.</span>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">category</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Used in (Fleet Kits)</h3>
      </div>
      <span className="font-caption text-caption text-on-surface-variant">Mandatory kit spec</span>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[18px] text-on-surface">minor_crash</span>
      </div>
      <div className="flex flex-col">
      <span className="font-bold text-on-surface">Rideshare car kit</span>
      <span className="font-caption text-caption text-on-surface-variant">1 unit required per active car</span>
      </div>
      </div>
      <span className="font-label-code text-caption font-bold bg-surface-container-lowest px-space-sm py-0.5 rounded text-on-surface">KIT-RIDE-01</span>
      </div>
      <div className="flex flex-col gap-space-xs pt-1">
      <div className="flex items-center justify-between bg-surface-container-lowest p-space-sm rounded">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
      <span className="font-body-sm text-body-sm font-medium text-on-surface">On 1 car:</span>
      <span className="font-label-plate text-label-plate text-on-surface">{live.primaryPlate}</span>
      <span className="font-caption text-caption text-on-surface-variant">({live.primaryPlate})</span>
      </div>
      <span className="font-caption text-caption text-surface-tint font-semibold">Active</span>
      </div>
      <div className="flex items-center justify-between bg-error-container/20 p-space-sm rounded">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px] text-error">warning</span>
      <span className="font-body-sm text-body-sm font-semibold text-on-surface">Missing on 1 car:</span>
      <span className="font-label-plate text-label-plate text-on-surface">{live.secondaryPlate}</span>
      <span className="font-caption text-caption text-on-surface-variant">({live.secondaryPlate})</span>
      </div>
      <button type="button" className="font-caption text-caption font-bold text-on-surface hover:underline flex items-center gap-0.5" onClick={() => form.openIssue()}>
      <span>Issue to {live.secondaryPlate}</span>
      <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
      </button>
      </div>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">tune</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Reorder rule</h3>
      </div>
      <button type="button" className="font-caption text-caption font-bold text-on-surface hover:underline" onClick={() => form.openEditRule()}>Edit rule</button>
      </div>
      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-md">
      <div className="flex items-start gap-space-sm">
      <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[18px] text-on-surface">restart_alt</span>
      </div>
      <div className="flex flex-col">
      <span className="font-body-sm text-body-sm font-bold text-on-surface">Reorder at 3 units · Buy 5 units</span>
      <span className="font-caption text-caption text-on-surface-variant">Preferred supplier: {vendorName}</span>
      </div>
      </div>

      <div className="p-space-sm rounded bg-tertiary-container/10 flex items-start gap-space-sm">
      <span className="material-symbols-outlined text-on-tertiary-container text-[18px] shrink-0 mt-0.5">notification_important</span>
      <div className="flex flex-col">
      <span className="font-body-sm text-body-sm font-bold text-on-tertiary-container">Restock Trigger Active</span>
      <p className="font-caption text-caption text-on-surface">
                      1 unit on hand in Main Store is below minimum reorder threshold (3). Recommended restock: <span className="font-bold">5 units</span> via automated draft PO.
                    </p>
      </div>
      </div>
      </div>
      </div>

      <div className="flex flex-col gap-space-sm">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-primary">history_toggle_off</span>
      <h3 className="font-headline-sm text-body-lg font-bold text-on-surface">Recent history</h3>
      </div>
      <span className="font-caption text-caption text-on-surface-variant">Last 5 verified ledger movements</span>
      </div>
      <div className="flex flex-col gap-space-xs">
      {form.movementRows.length === 0 ? (
      <p className="font-body-sm text-on-surface-variant px-space-sm py-2">No movements for this item yet.</p>
      ) : (
      form.movementRows.map((mov) => (
      <div key={mov.id} className="p-space-sm bg-surface-container-low hover:bg-surface-container transition-colors rounded-lg flex items-center justify-between gap-space-sm">
      <div className="flex items-center gap-space-sm min-w-0">
      <span className="font-label-code text-[11px] font-bold px-1.5 py-0.5 rounded bg-surface-container text-on-surface shrink-0">{mov.typeLabel}</span>
      <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-space-xs">
      <span className="font-body-sm text-body-sm font-bold text-on-surface truncate">{mov.locationLabel}</span>
      <span className="text-outline-variant font-caption">·</span>
      <span className="font-caption text-caption text-on-surface-variant truncate">{mov.actor}</span>
      </div>
      <span className="font-caption text-caption text-on-surface-variant truncate">{mov.note || mov.label}</span>
      </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
      <span className="font-label-code text-body-sm font-bold text-on-surface">{mov.qtyLabel || '—'}</span>
      <span className="font-caption text-[10px] text-on-surface-variant">{mov.when}</span>
      </div>
      </div>
      ))
      )}
      </div>
      <button type="button" className="w-full py-space-sm text-center font-caption text-caption font-bold text-on-surface hover:bg-surface-container-low rounded transition-colors flex items-center justify-center gap-1" onClick={() => form.openMovementsTab()}>
      <span>View all {form.movementCount} movements in Movements log</span>
      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
      </button>
      </div>
      </div>

      <div className="p-space-lg bg-surface-container-lowest shadow-[0_-4px_16px_rgba(0,0,0,0.04)] flex flex-col gap-space-sm shrink-0">
      <div className="grid grid-cols-3 gap-space-sm">
      <button type="button" className="px-space-md py-2.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-bold flex items-center justify-center gap-space-xs transition-colors" onClick={() => form.openReceive()}>
      <span className="material-symbols-outlined text-[18px]">move_to_inbox</span>
      <span>Receive</span>
      </button>
      <button type="button" className="px-space-md py-2.5 rounded bg-surface-container text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-bold flex items-center justify-center gap-space-xs transition-colors" onClick={() => form.openTransfer()}>
      <span className="material-symbols-outlined text-[18px]">sync_alt</span>
      <span>Transfer</span>
      </button>
      <button type="button" className="px-space-md py-2.5 rounded bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-bold flex items-center justify-center gap-space-xs transition-colors shadow-sm" onClick={() => form.openIssue()}>
      <span className="material-symbols-outlined text-[18px]">send</span>
      <span>Issue</span>
      </button>
      </div>
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-[11px] pt-1">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">verified_user</span>
      <span>Cryptographically auditable movements</span>
      </span>
      <span className="font-label-code text-[10px]">SHA-256 LEDGER BLOCK</span>
      </div>
      </div>
      </aside>
      </div>
      </div>
    </div>
  );
}
