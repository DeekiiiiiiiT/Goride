/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn8AssetsForm } from './hooks/useIn8AssetsForm';
import { InventoryOverflowMenu } from '../InventoryOverflowMenu';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { InventoryPagination } from '../InventoryPagination';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
export function In8Assets() {
  const form = useIn8AssetsForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-lg"><div className="flex flex-col w-full gap-space-lg">

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md pb-space-xs">
      <div className="flex flex-col gap-space-xs max-w-2xl">
      <div className="flex items-center gap-space-xs">
      <span className="font-label-code text-caption text-secondary uppercase tracking-wider">Assets</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight font-bold">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
              Each expensive unit tracked by serial number: where it is and when it is next checked.
            </p>
      </div>

      <div className="flex items-center flex-wrap gap-space-xs shrink-0">
      <button type="button" className="w-9 h-9 rounded flex items-center justify-center bg-surface-container-lowest text-on-surface hover:bg-surface-container-high transition-colors shadow-sm" title="Settings" onClick={() => shell.openModal('inventory-settings')}>
      <span className="material-symbols-outlined text-lg">settings</span>
      </button>
      <InventoryOverflowMenu
        items={[{ label: 'Export assets', onClick: () => form.exportAssets() }]}
        title="More Operations"
      />
      {!shell.readOnly ? (
      <>
      <button type="button" className="h-9 px-space-md rounded bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-semibold transition-colors shadow-sm flex items-center gap-space-xs" onClick={() => shell.openModal('receive')}>
      <span className="material-symbols-outlined text-base">download</span>
      <span>Receive Stock</span>
      </button>
      <button type="button" className="h-9 px-space-md rounded bg-primary text-on-primary hover:bg-primary/90 font-body-sm text-body-sm font-semibold transition-transform active:scale-95 shadow-sm flex items-center gap-space-xs" onClick={() => shell.openIssue()}>
      <span className="material-symbols-outlined text-base">local_shipping</span>
      <span>Issue to cars</span>
      </button>
      </>
      ) : null}
      </div>
      </div>

      <div className="bg-surface-container-low p-1 rounded-lg w-full overflow-x-auto">
      <InventoryPrimaryTabs variant="segment" />
      </div>

      <div className="flex flex-col gap-space-md">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold flex items-center gap-space-xs">
      <span>Assets — items tracked by serial number</span>
      <span className="font-label-code text-caption text-secondary bg-surface-container-high px-space-xs py-0.5 rounded font-medium">{form.statusCounts.all} Total</span>
      </h2>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">
                Where each unit is, when it was installed and when it is next checked
              </p>
      </div>
      <div className="flex items-center gap-space-sm flex-wrap">
      <div className="relative min-w-[240px]">
      <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">search</span>
      <input className="w-full bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant font-body-sm text-body-sm pl-8 pr-3 py-1.5 rounded-lg shadow-sm outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary/20" placeholder="Search serial, asset or car..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)}/>
      </div>
      {!shell.readOnly ? (
      <button type="button" onClick={() => shell.openModal('register-asset')} className="h-9 px-space-md rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-high font-body-sm text-body-sm font-semibold transition-colors shadow-sm flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-base">add</span>
      <span>Register asset</span>
      </button>
      ) : null}
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto pb-1">
      <button type="button" className={`px-3 py-1.5 rounded-lg font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm ${form.statusFilter === 'all' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-secondary hover:text-on-surface transition-colors'}`} onClick={() => form.setStatusFilter('all')}>
      <span>All</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container-highest/20 font-bold">{form.statusCounts.all}</span>
      </button>
      <button type="button" className={`px-3 py-1.5 rounded-lg font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm ${form.statusFilter === 'installed' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-secondary hover:text-on-surface transition-colors'}`} onClick={() => form.setStatusFilter('installed')}>
      <span>Installed</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">{form.statusCounts.installed}</span>
      </button>
      <button type="button" className={`px-3 py-1.5 rounded-lg font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm ${form.statusFilter === 'in_store' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-secondary hover:text-on-surface transition-colors'}`} onClick={() => form.setStatusFilter('in_store')}>
      <span>In store</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">{form.statusCounts.in_store}</span>
      </button>
      <button type="button" className={`px-3 py-1.5 rounded-lg font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm ${form.statusFilter === 'in_repair' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-secondary hover:text-on-surface transition-colors'}`} onClick={() => form.setStatusFilter('in_repair')}>
      <span>In repair</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">{form.statusCounts.in_repair}</span>
      </button>
      <button type="button" className={`px-3 py-1.5 rounded-lg font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm ${form.statusFilter === 'faulty' ? 'bg-primary text-on-primary' : 'bg-surface-container-lowest text-secondary hover:text-on-surface transition-colors'}`} onClick={() => form.setStatusFilter('faulty')}>
      <span>Faulty</span>
      <span className="font-label-code text-caption px-1.5 py-0.2 rounded bg-surface-container font-semibold">{form.statusCounts.faulty}</span>
      </button>
      </div>
      </div>

      <div className="w-full bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container-low text-secondary font-caption text-caption uppercase tracking-wider">
      <th className="py-3 px-space-md font-semibold">Serial / Identifier</th>
      <th className="py-3 px-space-md font-semibold">Item & Model</th>
      <th className="py-3 px-space-md font-semibold">Status</th>
      <th className="py-3 px-space-md font-semibold">Where / Assigned Car</th>
      <th className="py-3 px-space-md font-semibold">Installed</th>
      <th className="py-3 px-space-md font-semibold">Next inspection</th>
      <th className="py-3 px-space-md font-semibold text-right">Actions</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">
      {form.pagedAssetRows.length === 0 ? (
      <tr>
      <td colSpan={7} className="py-space-xl px-space-md text-center text-on-surface-variant font-body-sm">
      No assets match your filters.
      </td>
      </tr>
      ) : (
      form.pagedAssetRows.map((row, index) => {
        const assetId = row.id;
        const selected = form.selectedAssetId === assetId;
        const st = row.status.toLowerCase();
        return (
      <tr
        key={assetId || String(index)}
        className={`hover:bg-surface-container-low/50 transition-colors cursor-pointer ${selected ? 'bg-primary/5' : ''}`}
        onClick={() => form.selectAsset(assetId)}
      >
      <td className="py-space-md px-space-md align-middle">
      {row.serial && row.serial !== '—' ? (
      <span className="font-label-code text-label-code font-semibold text-on-surface flex items-center gap-1">
      <span className="material-symbols-outlined text-sm text-surface-tint">qr_code_2</span>
      <span>{row.serial}</span>
      </span>
      ) : (
      <div className="flex items-center gap-space-xs">
      <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-caption font-semibold flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
      <span>No serial yet</span>
      </span>
      <button type="button" className="h-7 px-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-caption text-caption font-semibold" onClick={(e) => { e.stopPropagation(); form.openAsset(assetId); }}>
                        Add serial
                      </button>
      </div>
      )}
      </td>
      <td className="py-space-md px-space-md align-middle">
      <div className="flex flex-col">
      <span className="font-body-md text-body-md font-semibold text-on-surface">{row.name}</span>
      <span className="font-label-code text-caption text-on-surface-variant font-medium">{row.category}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container text-on-surface font-caption text-caption font-medium">
      <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
      <span>{row.statusLabel}</span>
      </span>
      </td>
      <td className="py-space-md px-space-md align-middle">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-secondary text-base">{st === 'installed' ? 'directions_car' : 'warehouse'}</span>
      <span className="font-body-sm text-body-sm text-on-surface">{row.plate || '—'}</span>
      </div>
      </td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-on-surface-variant">{row.installedAt || '—'}</td>
      <td className="py-space-md px-space-md align-middle font-label-code text-body-sm text-on-surface-variant">{row.nextCheck || '—'}</td>
      <td className="py-space-md px-space-md align-middle text-right" onClick={(e) => e.stopPropagation()}>
      <InventoryOverflowMenu items={form.rowMenuItems(assetId)} />
      </td>
      </tr>
        );
      })
      )}
      {form.selectedAssetRow ? (
      <tr className="bg-surface-container-low">
      <td colSpan={7} className="py-space-md px-space-md">
      <div className="flex flex-wrap items-center justify-between gap-space-md">
      <div>
      <span className="font-caption text-caption uppercase text-secondary font-semibold">Selected asset</span>
      <div className="font-body-md text-body-md font-semibold text-on-surface">{form.selectedAssetRow.name} · {form.selectedAssetRow.serial}</div>
      <div className="font-label-code text-caption text-on-surface-variant">{form.selectedAssetRow.plate} · {form.selectedAssetRow.bookValue}</div>
      </div>
      <button
        type="button"
        className="h-9 px-space-md rounded-lg bg-primary text-on-primary font-body-sm font-semibold disabled:opacity-60"
        disabled={!form.selectedAssetId}
        title={form.openSelectedAssetPageDisabledReason || 'Open asset page'}
        onClick={() => form.selectedAssetId && form.openAsset(form.selectedAssetId)}
      >
        View asset page
      </button>
      </div>
      </td>
      </tr>
      ) : null}
      </tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-space-md">
      <div className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-space-xs">
      <span>Showing {form.paged.length} of {form.filteredCount} operational assets</span>
      </div>
      <div className="flex items-center gap-space-xs">
      <InventoryPagination page={form.page} pageCount={form.pageCount} setPage={form.setPage} />
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Units without a serial</span>
      <span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-sm">qr_code_2</span>
      </span>
      </div>
      <div className="mt-space-md flex items-baseline gap-space-xs">
      <span className={`font-headline-lg text-headline-lg font-bold ${live.assetUnitsWithoutSerial ? 'text-error' : 'text-on-surface'}`}>{live.assetUnitsWithoutSerial}</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant">of {form.statusCounts.all} units</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Next check due</span>
      <span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-sm">event_repeat</span>
      </span>
      </div>
      <div className="mt-space-md">
      <span className="font-headline-sm text-headline-sm font-bold text-on-surface">{live.assetNextCheckDue ?? 'None set'}</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
      <span className="font-caption text-caption uppercase text-secondary font-semibold tracking-wider">Value of units</span>
      <span className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-on-surface">
      <span className="material-symbols-outlined text-sm">payments</span>
      </span>
      </div>
      <div className="mt-space-md flex flex-col gap-1">
      <span className="font-headline-lg text-headline-lg font-bold text-on-surface font-label-price">{live.assetValueLabel}</span>
      <span className="font-caption text-caption text-on-surface-variant">Included in Stock value ({live.totalStockValue})</span>
      </div>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
