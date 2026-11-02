/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { formatJmd } from '../inventoryFormat';
import { downloadInventoryExportCsv } from '../inventoryDownload';
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapItemEditorForm } from './useGapItemEditorForm';

export function GapItemEditor(p: { itemId?: string | null; onClose?: () => void }) {
  const form = useGapItemEditorForm(p.itemId, p.onClose);
  const closeDrawer = () => p.onClose?.();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="ItemEditor">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="w-full opacity-35 pointer-events-none select-none filter blur-[0.6px] transition-all duration-300">

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md mb-space-lg">
        <div className="flex items-center gap-space-md">
        <div className="flex items-center gap-space-xs px-space-md py-1.5 bg-surface-container rounded-lg">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">filter_list</span>
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">Filter Depot: Kingston Central</span>
        </div>
        <div className="px-space-md py-1.5 bg-surface-container-low rounded-lg font-caption text-caption text-on-surface-variant">
                  Showing 124 asset records
                </div>
        </div>
        <div className="flex items-center gap-space-sm">
        <button type="button" className="px-space-md py-2 bg-surface-container-high rounded-lg text-body-sm font-body-sm text-on-surface flex items-center gap-space-xs" onClick={() => {}}>
        <span className="material-symbols-outlined text-[18px]">download</span> Export CSV
                </button>
        <button type="button" className="px-space-lg py-2 bg-primary text-on-primary rounded-lg text-body-sm font-body-sm flex items-center gap-space-xs shadow-sm" onClick={() => {}}>
        <span className="material-symbols-outlined text-[18px]">add</span> + Add Stock Item
                </button>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-space-lg py-space-md bg-surface-container-low font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">
        <span className="col-span-3">Item / Description</span>
        <span className="col-span-2">SKU / Code</span>
        <span className="col-span-2">Category</span>
        <span className="col-span-2">Available Count</span>
        <span className="col-span-2">Valuation (JMD)</span>
        <span className="col-span-1 text-right">Status</span>
        </div>
        <div className="divide-y divide-surface-container">
        {form.catalog.length === 0 ? (
        <div className="px-space-lg py-space-md font-body-sm text-body-sm text-on-surface-variant">No catalog items loaded.</div>
        ) : (
        form.catalog.map((row) => (
        <div key={String(row.id)} className="grid grid-cols-12 px-space-lg py-space-md items-center">
        <div className="col-span-3 flex items-center gap-space-sm">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-on-surface font-label-code text-label-code">{String(row.name ?? '?').slice(0, 2).toUpperCase()}</div>
        <div>
        <p className="font-body-md text-body-md font-semibold text-on-surface">{String(row.name ?? '—')}</p>
        <p className="font-caption text-caption text-on-surface-variant">{String(row.sku ?? '—')}</p>
        </div>
        </div>
        <span className="col-span-2 font-label-code text-label-code text-on-surface">{String(row.sku ?? '—')}</span>
        <span className="col-span-2 font-body-sm text-body-sm text-on-surface-variant">{String(row.category_name ?? row.category ?? '—')}</span>
        <span className="col-span-2 font-label-code text-label-code text-on-surface font-semibold">{String(row.qty_on_hand ?? '—')} each</span>
        <span className="col-span-2 font-label-price text-label-price text-on-surface">{formatJmd(Number(row.default_cost_jmd ?? row.unit_cost_jmd ?? 0))}</span>
        <span className="col-span-1 text-right"><span className="px-2 py-0.5 rounded text-caption font-caption bg-surface-container-high text-on-surface">{String(row.status ?? 'Active')}</span></span>
        </div>
        ))
        )}
        </div>
        </div>
        </div>

        <div className="fixed inset-0 bg-primary-container/30 backdrop-blur-[1px] z-40 transition-opacity" id="drawer-backdrop"></div>

        <aside className="fixed top-0 right-0 bottom-0 w-full sm:w-[580px] bg-surface-container-lowest z-50 flex flex-col shadow-[0_8px_30px_rgba(0,0,0,0.12)]" id="inventory-drawer">

        <header className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-md">
        <div className="flex items-start justify-between">
        <div className="flex flex-col">
        <div className="flex items-center gap-space-sm">
        <span className="w-2 h-2 rounded-full bg-on-tertiary-container"></span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Edit item · {form.name.trim() || 'Untitled'}</h2>
        </div>
        <div className="flex items-center gap-space-xs mt-0.5">
        <span className="font-caption text-caption text-on-surface-variant">Asset Identifier: <span className="font-label-code text-label-code text-on-surface">{form.assetIdentifierLabel}</span></span>
        <span className="text-on-surface-variant text-caption font-caption">·</span>
        <button className="font-caption text-caption text-secondary hover:text-on-surface underline" type="button" onClick={() => {}}>Or New item</button>
        </div>
        </div>
        <button aria-label="Close Drawer" className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center justify-center transition-colors" id="close-drawer-btn" type="button" onClick={closeDrawer}>
        <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
        </div>

        <div className="flex items-center justify-between px-space-md py-space-sm bg-surface-container-low rounded-lg">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface">inventory_2</span>
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-space-xs">
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">On hand: 2 each across 2 locations</span>
        <span className="hidden sm:inline font-caption text-caption text-on-surface-variant">·</span>
        <span className="font-label-price text-label-price text-on-surface">{form.stockValuePreviewLabel}</span>
        </div>
        </div>
        <a className="font-caption text-caption text-on-surface font-semibold hover:underline flex items-center gap-0.5" href="#">
                  View history <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </a>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0 mt-0.5">lock_clock</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
                  Quantities can't be edited here — use <span className="font-semibold text-on-surface">Receive</span>, <span className="font-semibold text-on-surface">Issue</span> or <span className="font-semibold text-on-surface">Count</span> to change stock levels.
                </p>
        </div>
        </header>

        <div className="flex-1 overflow-y-auto px-space-lg py-space-lg flex flex-col gap-space-xl">

        <section className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">01</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Basics</h3>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Core item taxonomy</span>
        </div>
        <div className="grid grid-cols-12 gap-space-md">

        <div className="col-span-12 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Item Name</label>
        <input className="h-9 px-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm" type="text" value={form.name} onChange={(e) => form.setName(e.target.value)} />
        </div>

        <div className="col-span-4 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Short Code</label>
        <div className="h-9 px-space-md bg-surface-container rounded-lg flex items-center">
        <span className="font-label-code text-label-code text-on-surface font-bold uppercase tracking-wider">PHM</span>
        </div>
        </div>
        <div className="col-span-8 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">SKU (Stock Keeping Unit)</label>
        <input className="h-9 px-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-label-code text-label-code text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm" type="text" value={form.sku} onChange={(e) => form.setSku(e.target.value)} />
        </div>

        <div className="col-span-12 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Category</label>
        <div className="h-9 px-space-md bg-surface-container-low rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
        <span className="text-on-surface-variant">Car kit</span>
        <span className="text-on-surface-variant font-caption text-caption">›</span>
        <span className="font-semibold">Accessories</span>
        </div>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">unfold_more</span>
        </div>
        </div>

        <div className="col-span-12 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Description</label>
        <textarea className="p-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-primary resize-none shadow-sm" rows={2} value={form.description} onChange={(e) => form.setDescription(e.target.value)} />
        </div>

        <div className="col-span-6 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Model / Specification</label>
        <input className="h-9 px-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-label-code text-label-code text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm" type="text" value={form.modelSpec} onChange={(e) => form.setModelSpec(e.target.value)} />
        </div>

        <div className="col-span-6 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Item Symbol</label>
        <div className="grid grid-cols-5 gap-1.5 h-9">
        <button className="flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" title="Bracket" type="button" onClick={() => form.setTracking('quantity')}>
        <span className="material-symbols-outlined text-[18px]">data_array</span>
        </button>
        <button className="flex items-center justify-center rounded-lg bg-primary text-on-primary shadow-sm" title="Phone (Selected)" type="button" onClick={() => form.setTracking('serial')}>
        <span className="material-symbols-outlined text-[18px]">smartphone</span>
        </button>
        <button className="flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" title="Camera" type="button" onClick={() => form.setTracking('quantity')}>
        <span className="material-symbols-outlined text-[18px]">videocam</span>
        </button>
        <button className="flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" title="Wrench" type="button" onClick={() => form.setTracking('quantity')}>
        <span className="material-symbols-outlined text-[18px]">build</span>
        </button>
        <button className="flex items-center justify-center rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors" title="Box" type="button" onClick={() => form.setTracking('quantity')}>
        <span className="material-symbols-outlined text-[18px]">package_2</span>
        </button>
        </div>
        </div>

        <div className="col-span-12 p-space-md bg-surface-container-low rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-space-md">
        <div className="w-12 h-12 rounded-lg bg-surface-container overflow-hidden flex-shrink-0 shadow-sm">
        <img className="w-full h-full object-cover" data-alt="High-resolution industrial product photograph of an adjustable magnetic windscreen and dashboard phone holder mount engineered for commercial utility vehicle fleets, matte black finish with suction locking lever, soft studio lighting on clean neutral slate backdrop." src="https://lh3.googleusercontent.com/aida-public/AB6AXuBPVMh69fg-rzUpZ4UfpQWkbx2wB14DtOtR4wQHUHRsGEiY1Q5AbOcP41V72Z9iVlCQFGp-P2ckVskjp9f3DxLGT0OqnVE5dfKd7vl0sMjMxGKNlR475HHCzqKkoyoW5chLV4yw9EQoJ5eI0ISJxONOyxU6eKd7uzWNueBkSNsT2ZZ-GNSM7UNm752yxpWg_DkCPyOML_N8kvW79qtNHv5dHXqi_WB-IWGrA2C4x0A"/>
        </div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">phm_mount_hardware_spec.jpg</span>
        <span className="font-caption text-caption text-on-surface-variant font-label-code">1.2 MB · 2048x1536 · Verified OEM</span>
        </div>
        </div>
        <button className="px-space-md py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold shadow-sm transition-colors" type="button" onClick={() => {}}>
                      Change photo
                    </button>
        </div>
        </div>
        </section>

        <section className="flex flex-col gap-space-md pt-space-xs">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">02</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Tracking</h3>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Ledger methodology</span>
        </div>

        <div className="p-1 bg-surface-container rounded-lg grid grid-cols-2 gap-1">
        <button className="py-2 px-space-md rounded bg-surface-container-lowest shadow-sm text-on-surface font-body-sm text-body-sm font-semibold flex items-center justify-center gap-space-xs transition-all" type="button" onClick={() => {}}>
        <span className="w-2 h-2 rounded-full bg-primary"></span>
                    Count by quantity
                  </button>
        <button className="py-2 px-space-md rounded text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm flex items-center justify-center gap-space-xs transition-all" type="button" onClick={() => {}}>
        <span className="w-2 h-2 rounded-full bg-surface-container-high"></span>
                    Track by serial number
                  </button>
        </div>

        <div className="p-space-md rounded-lg bg-surface-container-low flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface mt-0.5">info</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
        <span className="font-semibold text-on-surface">Count by quantity:</span> Stock is tracked as a single count pool (ideal for consumable or bulk equipment). Serial tracking creates individual asset records with warranty & history.
                  </p>
        </div>

        <div className="flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Unit of Measure</label>
        <div className="relative">
        <select className="w-full h-9 px-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-primary shadow-sm cursor-pointer" value={form.unitOfMeasure} onChange={(e) => form.setUnitOfMeasure(e.target.value)}>
        <option value="each">each</option>
        <option value="set">set</option>
        <option value="metre">metre</option>
        <option value="litre">litre</option>
        <option value="box">box</option>
        </select>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute right-3 top-2.5 pointer-events-none">expand_more</span>
        </div>
        </div>
        </section>

        <section className="flex flex-col gap-space-md pt-space-xs">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">03</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Cost & Buying</h3>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Procurement baseline</span>
        </div>
        <div className="grid grid-cols-12 gap-space-md">

        <div className="col-span-5 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Default Unit Cost</label>
        <div className="relative">
        <input className="w-full h-9 pl-space-md pr-space-md bg-surface-container-low focus:bg-surface-container-lowest rounded-lg font-label-price text-label-price text-on-surface font-semibold focus:outline-none focus:ring-1 focus:ring-primary shadow-sm" type="text" value={form.unitCost} onChange={(e) => form.setUnitCost(e.target.value)} />
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Landed depot cost excl. GCT</span>
        </div>

        <div className="col-span-7 flex flex-col gap-1">
        <div className="flex items-center justify-between">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Default Vendor</label>
        <a className="font-caption text-caption text-secondary hover:text-on-surface font-semibold flex items-center gap-0.5" href="#">
                        Supplier Profile <span className="material-symbols-outlined text-[12px]">open_in_new</span>
        </a>
        </div>
        <div className="h-9 px-space-md bg-surface-container-low rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">storefront</span>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Car Toys Jamaica</span>
        </div>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">unfold_more</span>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Vendor terms from catalog</span>
        </div>
        </div>
        </section>

        <section className="flex flex-col gap-space-md pt-space-xs">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">04</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Reordering per Location</h3>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Par levels & triggers</span>
        </div>
        <div className="rounded-xl overflow-hidden bg-surface-container-low shadow-sm">

        <div className="grid grid-cols-12 px-space-md py-2.5 bg-surface-container font-caption text-caption text-on-surface-variant font-semibold uppercase tracking-wider">
        <span className="col-span-6">Location</span>
        <span className="col-span-2 text-center">Reorder at</span>
        <span className="col-span-2 text-center">Order qty</span>
        <span className="col-span-2 text-right">Safety stock</span>
        </div>

        <div className="divide-y divide-surface-container-high/60 bg-surface-container-lowest">
        {form.reorderRules.map((rule) => (
        <div key={rule.location_id} className="grid grid-cols-12 px-space-md py-space-sm items-center">
        <div className="col-span-6 flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">warehouse</span>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">{rule.location_name}</span>
        </div>
        <div className="col-span-2 flex justify-center">
        <input className="w-10 h-7 text-center rounded bg-surface-container-low font-label-code text-label-code text-on-surface font-semibold focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary" type="text" value={rule.reorder_at} onChange={(e) => form.setReorderField(rule.location_id, 'reorder_at', e.target.value)} />
        </div>
        <div className="col-span-2 flex justify-center">
        <input className="w-10 h-7 text-center rounded bg-surface-container-low font-label-code text-label-code text-on-surface font-semibold focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary" type="text" value={rule.order_qty} onChange={(e) => form.setReorderField(rule.location_id, 'order_qty', e.target.value)} />
        </div>
        <div className="col-span-2 flex justify-end">
        <input className="w-10 h-7 text-center rounded bg-surface-container-low font-label-code text-label-code text-on-surface font-semibold focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary" type="text" value={rule.safety_stock} onChange={(e) => form.setReorderField(rule.location_id, 'safety_stock', e.target.value)} />
        </div>
        </div>
        ))}
        </div>
        </div>
        <button className="self-start px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold flex items-center gap-1 transition-colors" type="button" onClick={() => {}}>
        <span className="material-symbols-outlined text-[16px]">add</span> Add location rule
                </button>
        </section>

        <section className="flex flex-col gap-space-md pt-space-xs">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">05</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Warranty & Inspection</h3>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Maintenance schedules</span>
        </div>
        <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-md shadow-sm">
        <div className="grid grid-cols-12 gap-space-md">

        <div className="col-span-6 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Warranty Duration</label>
        <div className="h-9 px-space-md bg-surface-container-lowest rounded-lg flex items-center justify-between shadow-sm">
        <span className="font-body-sm text-body-sm text-on-surface font-semibold">12 months</span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">verified</span>
        </div>
        </div>
        <div className="col-span-6 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Warranty Type</label>
        <div className="h-9 px-space-md bg-surface-container-lowest rounded-lg flex items-center justify-between shadow-sm">
        <span className="font-body-sm text-body-sm text-on-surface">Manufacturer</span>
        <span className="font-caption text-caption text-on-surface-variant">OEM Direct</span>
        </div>
        </div>

        <div className="col-span-5 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Inspection Frequency</label>
        <div className="h-9 px-space-md bg-surface-container-lowest rounded-lg flex items-center gap-space-xs shadow-sm">
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">event_repeat</span>
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Every 90 days</span>
        </div>
        </div>
        <div className="col-span-7 flex flex-col gap-1">
        <label className="font-caption text-caption text-on-surface-variant font-medium">Inspection Protocol Kind</label>
        <div className="h-9 px-space-md bg-surface-container-lowest rounded-lg flex items-center truncate shadow-sm">
        <span className="font-body-sm text-body-sm text-on-surface truncate">Physical mount suction & clamp integrity check</span>
        </div>
        </div>
        </div>
        </div>
        </section>

        <section className="flex flex-col gap-space-md pt-space-xs">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">06</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Link to Parts Catalog</h3>
        </div>
        <span className="px-2 py-0.5 rounded bg-surface-container font-caption text-caption text-on-surface font-semibold">Tier 1 Fitment</span>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-surface-container-low p-space-md flex items-center justify-between shadow-sm">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
        <div className="pl-space-sm flex items-center gap-space-md min-w-0">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-[20px] text-on-surface">link</span>
        </div>
        <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wide">Roam Catalog Match</span>
        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
        <span className="font-caption text-caption text-on-tertiary-container font-semibold">Synced</span>
        </div>
        <p className="font-body-md text-body-md font-semibold text-on-surface truncate">Universal Windscreen Mount</p>
        <p className="font-label-code text-label-code text-on-surface-variant">OEM Ref: ACC-889 · Heavy Duty Dual-Lever</p>
        </div>
        </div>
        <button className="ml-space-md px-space-md py-1.5 rounded-lg bg-surface-container-lowest hover:bg-error-container hover:text-on-error-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex-shrink-0 shadow-sm" type="button" onClick={() => {}}>
                    Unlink
                  </button>
        </div>
        </section>

        <section className="flex flex-col gap-space-md pt-space-xs pb-space-lg">
        <div className="flex items-center justify-between pb-space-xs">
        <div className="flex items-center gap-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-bold">07</span>
        <h3 className="font-body-md text-body-md font-semibold text-on-surface">Lifecycle Status</h3>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Operational state</span>
        </div>
        <div className="flex flex-col gap-space-xs">

        <label className="p-space-md rounded-xl bg-surface-container-low flex items-start gap-space-md cursor-pointer hover:bg-surface-container transition-colors">
        <input checked={!form.isNew} className="mt-1 w-4 h-4 accent-primary" name="lifecycle_status" type="radio" readOnly />
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Active (in regular fleet distribution)</span>
        <span className="font-caption text-caption text-on-surface-variant">Available for depot technicians and dispatch fulfillment</span>
        </div>
        </label>

        <label className="p-space-md rounded-xl bg-surface-container-low flex items-start gap-space-md cursor-pointer hover:bg-surface-container transition-colors">
        <input checked={false} className="mt-1 w-4 h-4 accent-primary" name="lifecycle_status" type="radio" readOnly />
        <div className="flex flex-col w-full">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Being replaced by…</span>
        <div className="mt-2 flex items-center gap-space-sm opacity-60">
        <div className="h-8 px-space-md bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface flex items-center justify-between flex-1">
        <span>Select replacement SKU (e.g. INV-0042)</span>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">search</span>
        </div>
        </div>
        </div>
        </label>

        <label className="p-space-md rounded-xl bg-surface-container-low flex items-start gap-space-md cursor-pointer hover:bg-surface-container transition-colors">
        <input checked={false} className="mt-1 w-4 h-4 accent-primary" name="lifecycle_status" type="radio" readOnly />
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Archived</span>
        <span className="font-caption text-caption text-on-surface-variant">Hidden from dispatch catalog; retained for audit logs</span>
        </div>
        </label>
        </div>
        </section>
        </div>

        <footer className="p-space-lg bg-surface-container-lowest flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">

        <button type="button" disabled={form.isNew || form.submit.saving} onClick={() => void form.archive()} className="text-error hover:underline font-body-sm text-body-sm font-semibold flex items-center gap-1 transition-colors disabled:opacity-60" id="archive-toggle-btn">
        <span className="material-symbols-outlined text-[16px]">archive</span>
                  Archive item
                </button>

        <div className="flex items-center gap-space-sm">
        <button className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold transition-colors" id="cancel-drawer-btn" type="button" onClick={closeDrawer}>
                    Cancel
                  </button>
        <button type="button" disabled={!form.canSave || form.submit.saving} onClick={() => void form.save()} className="px-space-xl py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-primary-container shadow-md active:scale-[0.99] transition-all flex items-center gap-space-xs disabled:opacity-60">
        <span className="material-symbols-outlined text-[18px]">check</span>
                    Save item
                  </button>
        </div>
        </div>

        <div className="hidden p-space-md rounded-lg bg-error-container/40 flex items-start gap-space-sm transition-all" id="archive-warning-box">
        <span className="material-symbols-outlined text-[18px] text-error flex-shrink-0 mt-0.5">warning</span>
        <div className="flex flex-col gap-1">
        <p className="font-body-sm text-body-sm text-on-surface font-semibold">
                    Archive Phone Holder Mount?
                  </p>
        <p className="font-caption text-caption text-on-surface-variant">
                    It stays in history and can be restored at any time from the archived filters.
                  </p>
        <div className="flex items-center gap-space-sm mt-1">
        <button className="px-space-md py-1 bg-error text-on-error rounded font-caption text-caption font-bold" type="button" onClick={() => {}}>
                      Confirm Archive
                    </button>
        <button className="font-caption text-caption text-on-surface-variant hover:text-on-surface" id="cancel-archive-warning" type="button" onClick={closeDrawer}>
                      Dismiss
                    </button>
        </div>
        </div>
        </div>
        </footer>
        </aside>


        </div></div><aside className="fixed left-0 top-28 bottom-0 w-64 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex flex-col justify-between py-space-lg"><div className="flex flex-col gap-space-xs px-space-md"><div className="px-space-md py-space-xs text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Inventory & Asset Scope</div><nav className="flex flex-col gap-1" data-active-classes="bg-surface-container text-on-surface font-semibold"><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="inventory-catalog" href="#"><span className="material-symbols-outlined text-[20px]">category</span>Inventory Stock</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="parts-fitment-crossref" href="#"><span className="material-symbols-outlined text-[20px]">manufacturing</span>Fitment & Compatibility</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="work-orders-repairs" href="#"><span className="material-symbols-outlined text-[20px]">build</span>Work Orders</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="asset-depreciation-tracker" href="#"><span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>Asset Valuation</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="procurement-suppliers" href="#"><span className="material-symbols-outlined text-[20px]">storefront</span>Suppliers & POs</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="telemetry-diagnostics" href="#"><span className="material-symbols-outlined text-[20px]">sensors</span>Diagnostic Logs</a></nav></div><div className="px-space-lg pt-space-md"><div className="p-space-md rounded-lg bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div className="flex items-center justify-between text-caption font-caption text-on-surface-variant mb-1"><span>Active Depot Stock</span><span className="font-label-code text-label-code text-on-surface font-semibold">84.6%</span></div><div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full bg-primary rounded-full w-[84.6%]"></div></div><div className="mt-space-xs text-caption font-caption text-on-surface-variant">Warehouse A & Yard Kingston</div></div></div></aside>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
