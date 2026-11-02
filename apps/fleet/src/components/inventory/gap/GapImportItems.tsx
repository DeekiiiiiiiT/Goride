/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { formatJmd } from '../inventoryFormat';
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapImportItemsForm } from './useGapImportItemsForm';

export function GapImportItems(p: { onClose?: () => void }) {
  const form = useGapImportItemsForm(p.onClose);
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="ImportItems">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="w-full px-margin-desktop py-space-xl opacity-25 filter blur-[2px] pointer-events-none select-none max-w-[1440px] mx-auto">
        <div className="flex items-center justify-between pb-space-lg mb-space-lg">
        <div className="flex flex-col gap-space-xs">
        <span className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Parts & Inventory Catalog</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">Kingston Central Storeroom · Zone A Warehouse Ledger</span>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="h-9 px-space-md bg-surface-container rounded-lg flex items-center gap-space-xs text-on-surface-variant font-body-sm text-body-sm">
        <span className="material-symbols-outlined text-[18px]">filter_list</span>
        <span>Filter Stock</span>
        </div>
        <div className="h-9 px-space-md bg-primary text-on-primary rounded-lg flex items-center gap-space-xs font-body-sm text-body-sm font-medium">
        <span className="material-symbols-outlined text-[18px]">add</span>
        <span>Add SKU</span>
        </div>
        </div>
        </div>

        <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-6 px-space-lg py-space-md bg-surface-container font-caption text-caption text-secondary uppercase font-semibold">
        <span>SKU / Part Code</span>
        <span>Item Specification</span>
        <span>Category</span>
        <span>On Hand</span>
        <span>Valuation (JMD)</span>
        <span className="text-right">Primary Vendor</span>
        </div>
        <div className="divide-y divide-surface-container">
        {form.catalog.slice(0, 6).map((row) => (
        <div key={String(row.id)} className="grid grid-cols-6 px-space-lg py-space-md font-body-sm text-body-sm items-center">
        <span className="font-label-code text-label-code font-bold">{String(row.sku ?? '—')}</span>
        <span>{String(row.name ?? '—')}</span>
        <span>{String(row.category_name ?? row.category ?? '—')}</span>
        <span className="font-label-code text-label-code">{String(row.qty_on_hand ?? 0)} units</span>
        <span className="font-label-price text-label-price">{formatJmd(Number(row.default_cost_jmd ?? 0))}</span>
        <span className="text-right text-on-surface-variant">{String(row.vendor_name ?? '—')}</span>
        </div>
        ))}
        </div>
        </div>
        </div>

        <div className="fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-[1px] transition-opacity"></div>

        <div className="fixed inset-0 z-50 flex items-center justify-center p-space-md overflow-y-auto">
        <div className="w-full max-w-[840px] bg-surface-container-lowest rounded-xl shadow-xl flex flex-col overflow-hidden my-auto">

        <div className="px-space-xl pt-space-xl pb-space-lg bg-surface-container-lowest flex items-start justify-between">
        <div className="flex flex-col gap-1 pr-space-lg">
        <div className="flex items-center gap-space-sm">
        <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Import items</span>
        <span className="bg-surface-container text-on-surface-variant font-label-code text-[11px] px-2 py-0.5 rounded font-semibold tracking-wide uppercase">Batch Intake</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Bulk upload parts and accessories into your catalog. Quantities must come from Opening balances or Receive.
                  </p>
        </div>
        <button aria-label="Close dialog" className="w-8 h-8 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors" type="button" onClick={() => p.onClose?.()}>
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <div className="px-space-xl py-space-md bg-surface-container-low">
        <div className="grid grid-cols-3 gap-space-md items-center">

        <div className="flex items-center gap-space-sm">
        <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[15px]">check</span>
        </div>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-secondary font-bold uppercase tracking-wider">Step 01</span>
        <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">Upload</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm">
        <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[15px]">check</span>
        </div>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-secondary font-bold uppercase tracking-wider">Step 02</span>
        <span className="font-body-sm text-body-sm text-on-surface font-semibold truncate">Match columns</span>
        </div>
        </div>

        <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-1.5 rounded-lg shadow-sm">
        <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 font-label-code text-[12px] font-bold">
                      3
                    </div>
        <div className="flex flex-col min-w-0">
        <span className="font-caption text-caption text-primary font-bold uppercase tracking-wider">Step 03</span>
        <span className="font-body-sm text-body-sm text-on-surface font-bold truncate">Check & Review</span>
        </div>
        </div>
        </div>
        </div>

        <div className="px-space-xl py-space-lg flex flex-col gap-space-lg max-h-[calc(88vh-220px)] overflow-y-auto">

        <div className="flex flex-col gap-space-sm bg-surface-container-low p-space-md rounded-lg">

        <div className="flex flex-wrap items-center justify-between gap-space-sm">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-secondary text-[18px]">description</span>
        <span className="font-body-sm text-body-sm text-on-surface font-medium">Uploaded:</span>
        <span className="font-label-code text-label-code text-primary font-semibold bg-surface-container px-2 py-0.5 rounded">{form.fileName || 'No file selected'}</span>
        <span className="font-body-sm text-body-sm text-secondary">({form.rowCount} rows detected)</span>
        </div>
        <div className="flex items-center gap-space-md">
        <label className="font-caption text-caption text-primary font-semibold hover:underline flex items-center gap-0.5 cursor-pointer">
        <span className="material-symbols-outlined text-[14px]">sync</span>
                        Replace file
                        <input type="file" accept=".csv,.tsv,.xlsx" className="sr-only" onChange={(e) => void form.onFile(e.target.files?.[0] ?? null)} />
                      </label>
        <span className="text-secondary/30 text-caption">•</span>
        <a className="font-caption text-caption text-secondary font-semibold hover:text-on-surface hover:underline flex items-center gap-0.5" href="#">
        <span className="material-symbols-outlined text-[14px]">download</span>
                        Download sample CSV template
                      </a>
        </div>
        </div>

        <div className="pt-space-xs flex flex-wrap items-center gap-space-xs font-caption text-caption">
        <span className="text-secondary font-semibold tracking-wider uppercase mr-1 text-[10px]">Active Mappings:</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Part Name <span className="text-secondary">→</span> Name
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Item Code <span className="text-secondary">→</span> SKU
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Cat <span className="text-secondary">→</span> Category
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Unit Price <span className="text-secondary">→</span> Default cost
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-code text-[11px]">
                      Distributor <span className="text-secondary">→</span> Vendor
                      <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-[11px]">
                      Warehouse Bin <span className="opacity-60">→</span> Skipped
                      <span className="material-symbols-outlined text-[13px]">block</span>
        </span>
        </div>
        </div>

        <div className="flex items-center justify-between gap-space-md p-space-md bg-surface-container rounded-lg">
        <div className="flex items-center gap-space-sm">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Data Verification Summary:</span>
        <div className="flex items-center gap-space-xs">
        <span className="px-2.5 py-1 rounded-full bg-surface-container-lowest text-on-surface font-label-code text-label-code font-bold shadow-sm flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
                        12 new items
                      </span>
        <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-fixed font-label-code text-label-code font-bold flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-secondary"></span>
                        3 updates existing
                      </span>
        <span className="px-2.5 py-1 rounded-full bg-error-container text-on-error-container font-label-code text-label-code font-bold flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-error"></span>
                        1 problem row
                      </span>
        </div>
        </div>
        <span className="font-caption text-caption text-secondary">Displaying 4 representative rows</span>
        </div>

        <div className="bg-surface-container-lowest rounded-lg shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-space-md py-space-sm bg-surface-container-high font-caption text-caption text-secondary uppercase font-semibold">
        <span className="col-span-2">Intake Status</span>
        <span className="col-span-3">Item Name</span>
        <span className="col-span-2">SKU</span>
        <span className="col-span-2">Category</span>
        <span className="col-span-2 text-right">Default Cost</span>
        <span className="col-span-1 text-right">Vendor</span>
        </div>
        <div className="divide-y divide-surface-container">
        {form.previewRows.length === 0 ? (
        <div className="px-space-md py-space-md font-body-sm text-body-sm text-on-surface-variant">Upload a CSV to preview intake rows.</div>
        ) : (
        form.previewRows.map((row, index) => (
        <div key={`${index}-${Object.values(row).join('-')}`} className="grid grid-cols-12 px-space-md py-space-md items-center hover:bg-surface-container-low transition-colors">
        <div className="col-span-2 flex items-center">
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container-highest text-on-surface flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                          New
                        </span>
        </div>
        <div className="col-span-3 font-body-sm text-body-sm font-semibold text-on-surface truncate">
                        {row.Name || row['Part Name'] || row.name || '—'}
                      </div>
        <div className="col-span-2 font-label-code text-label-code text-secondary font-medium">
                        {row.SKU || row['Item Code'] || row.sku || '—'}
                      </div>
        <div className="col-span-2 font-body-sm text-body-sm text-on-surface-variant truncate">
                        {row.Category || row.Cat || row.category || '—'}
                      </div>
        <div className="col-span-2 font-label-price text-label-price text-right text-on-surface">
                        {row['Unit Price'] || row['Default cost'] || row.cost || '—'}
                      </div>
        <div className="col-span-1 font-body-sm text-body-sm text-right text-on-surface-variant truncate">
                        {row.Vendor || row.Distributor || row.vendor || '—'}
                      </div>
        </div>
        ))
        )}
        </div>
        </div>

        <div className="p-space-md bg-surface-container rounded-lg flex items-start gap-space-md">
        <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center shrink-0 shadow-sm text-primary">
        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
        </div>
        <div className="flex flex-col gap-0.5">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Catalog Intake Protocol Notice</span>
        <p className="font-caption text-caption text-on-surface-variant leading-relaxed">
                      Import adds items to your master parts catalog only. Inventory quantities remain at <span className="font-label-code font-bold text-on-surface">0 units</span> until explicitly adjusted through <span className="font-medium text-on-surface">Opening balances</span>, purchase <span className="font-medium text-on-surface">Receive</span> documents, or a certified <span className="font-medium text-on-surface">Physical Count</span>.
                    </p>
        </div>
        </div>
        </div>

        <div className="px-space-xl py-space-lg bg-surface-container-low flex flex-wrap items-center justify-between gap-space-md">

        <button className="flex items-center gap-space-xs font-body-sm text-body-sm text-error font-medium hover:underline" type="button" onClick={() => form.downloadProblemRows()}>
        <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
        <span>Download 1 problem row (.csv)</span>
        </button>

        <div className="flex items-center gap-space-md">
        <button className="h-10 px-space-lg rounded-lg bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-semibold shadow-sm hover:bg-surface-container transition-all" type="button" onClick={() => p.onClose?.()}>
                    Back to mapping
                  </button>
        <button type="button" disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.importItems()} className="h-10 px-space-xl rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:opacity-95 active:scale-[0.99] transition-all flex items-center gap-space-xs shadow-sm disabled:opacity-60" id="importActionBtn">
        <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
        <span>{form.submit.saving ? 'Importing…' : form.fileName ? `Import ${form.fileName}` : 'Import items'}</span>
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
