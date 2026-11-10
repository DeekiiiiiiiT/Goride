/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn13AlertsForm } from './hooks/useIn13AlertsForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { InventoryOverflowMenu } from '../InventoryOverflowMenu';
import { strField } from '../inventoryData';
import { isStoredAlert } from './hooks/useIn13AlertsForm';
export function In13Alerts() {
  const form = useIn13AlertsForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const alertRecord = (id: string) => form.filtered.find((a) => strField(a, 'id', '') === id) ?? {};
  const alertMenu = (id: string) => {
    const a = alertRecord(id);
    const open = { label: form.openLabel(a), onClick: () => form.openRelated(a) };
    if (!isStoredAlert(a) || shell.readOnly) return [open];
    return [{ label: 'Mark done', onClick: () => void form.markDone(id).catch(() => undefined) }, open];
  };
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-surface-container-lowest px-margin-desktop py-space-xl shadow-sm">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-xs font-caption text-caption text-secondary uppercase tracking-wider mb-1">
      <span>Fleet Operations</span>
      <span>/</span>
      <span>Asset Control</span>
      <span>/</span>
      <span className="text-on-surface font-semibold">Storeroom</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">What you have, where it is, and what every car is missing.</p>
      </div>
      <div className="flex items-center gap-space-sm self-start md:self-auto">
      {!shell.readOnly ? (
      <button type="button" className="flex items-center gap-space-xs bg-primary text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm" onClick={() => shell.openModal('receive')}>
      <span className="material-symbols-outlined text-[16px]">move_to_inbox</span>
      <span>Receive stock</span>
      </button>
      ) : null}
      </div>
      </div>

      <InventoryPrimaryTabs variant="pill" />
      </div>
      </div>

      <div className="w-full px-margin-desktop py-space-xl">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-xl">

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-lowest p-space-xl rounded-xl shadow-sm">
      <div>
      <div className="flex items-center gap-space-sm mb-1">
      <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">Inventory & Storeroom Alerts</h2>
      {form.counts.critical > 0 ? (
      <span className="bg-error-container text-on-error-container font-label-code text-caption font-bold px-2 py-0.5 rounded">{form.counts.critical} CRITICAL</span>
      ) : null}
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">{form.counts.open} open alert{form.counts.open === 1 ? '' : 's'}.</p>
      </div>
      <div className="flex flex-wrap items-center gap-space-sm">
      <div className="relative min-w-[240px]">
      <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
      <input className="w-full bg-surface-container-low pl-9 pr-space-md py-2 rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-lowest transition-colors" placeholder="Search alerts..." type="text" value={form.search} onChange={(e) => form.setSearch(e.target.value)}/>
      </div>
      <button type="button" onClick={() => shell.openModal('snooze-settings')} className="flex items-center gap-space-xs bg-surface-container-low hover:bg-surface-container text-on-surface px-space-md py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">schedule</span>
      <span>Snooze settings</span>
      </button>
      <button type="button" className="flex items-center gap-space-xs bg-surface-container-low hover:bg-surface-container text-on-surface px-space-md py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors" onClick={() => void form.markAllViewed().catch(() => undefined)}>
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">done_all</span>
      <span>Mark all viewed</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Open alerts</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">{form.counts.open}</div>
      <span className="font-caption text-caption text-error font-medium">{form.counts.critical} critical</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-error-container text-on-error-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">warning</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Driver reports open</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">{form.counts.driverReports}</div>
      <span className="font-caption text-caption text-on-surface-variant">From the driver app</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-surface-container text-primary flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">campaign</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Equipment needing attention</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">{live.assetsFaulty + live.assetsLost + live.assetsInRepair}</div>
      <span className="font-caption text-caption text-on-surface-variant">{live.assetsFaulty} faulty · {live.assetsLost} lost · {live.assetsInRepair} in repair</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">build</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Low or out</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">{live.lowStockCount}</div>
      <span className="font-caption text-caption text-on-surface-variant">{live.lowStockCount ? live.lowStockLabel : 'The store covers the cars'}</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">inventory</span>
      </div>
      </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-space-md">
      <div className="flex items-center gap-space-xs bg-surface-container p-1 rounded-lg">
      <button type="button" className={`flex items-center gap-space-xs px-space-md py-1.5 rounded font-body-sm text-body-sm transition-all ${form.tab === 'open' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface font-medium'}`} onClick={() => form.setTab('open')}>
      <span>Open</span>
      <span className="bg-primary text-on-primary font-label-code text-[11px] px-1.5 py-0.2 rounded-full">{form.tabCounts.open}</span>
      </button>
      <button type="button" className={`flex items-center gap-space-xs px-space-md py-1.5 rounded font-body-sm text-body-sm transition-colors ${form.tab === 'assigned' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface font-medium'}`} onClick={() => form.setTab('assigned')}>
      <span>Assigned to me</span>
      <span className="bg-surface-container-high text-on-surface-variant font-label-code text-[11px] px-1.5 py-0.2 rounded-full">{form.tabCounts.assigned}</span>
      </button>
      <button type="button" className={`flex items-center gap-space-xs px-space-md py-1.5 rounded font-body-sm text-body-sm transition-colors ${form.tab === 'snoozed' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface font-medium'}`} onClick={() => form.setTab('snoozed')}>
      <span>Snoozed</span>
      <span className="bg-surface-container-high text-on-surface-variant font-label-code text-[11px] px-1.5 py-0.2 rounded-full">{form.tabCounts.snoozed}</span>
      </button>
      <button type="button" className={`flex items-center gap-space-xs px-space-md py-1.5 rounded font-body-sm text-body-sm transition-colors ${form.tab === 'done' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface font-medium'}`} onClick={() => form.setTab('done')}>
      <span>Done</span>
      <span className="bg-surface-container-high text-on-surface-variant font-label-code text-[11px] px-1.5 py-0.2 rounded-full">{form.tabCounts.done}</span>
      </button>
      </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-space-lg">
      <div className="flex flex-col gap-space-md flex-1 min-w-0">
      {form.alertRows.length === 0 ? (
      <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm text-center text-on-surface-variant font-body-md">
      No alerts in this view. Try another tab or clear your search.
      </div>
      ) : (
      form.alertRows.map((row) => {
        const raw = alertRecord(row.id);
        const selected = form.selectedAlertId === row.id;
        return (
      <button
        key={row.id}
        type="button"
        className={`bg-surface-container-lowest p-space-lg rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg text-left w-full ${selected ? 'ring-2 ring-primary' : ''}`}
        onClick={() => form.selectAlert(row.id)}
      >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
      <div className="flex items-start gap-space-lg pl-space-xs min-w-0">
      <div className="w-10 h-10 rounded-full bg-surface-container text-on-surface flex items-center justify-center shrink-0 mt-0.5">
      <span className="material-symbols-outlined text-[22px]">notifications</span>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center flex-wrap gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">{row.title}</span>
      {row.sku ? (
      <span className="bg-surface-container text-on-surface-variant font-label-code text-caption px-2 py-0.5 rounded font-medium">SKU: {row.sku}</span>
      ) : null}
      {row.vehiclePlate ? (
      <span className="bg-surface-container text-on-surface-variant font-label-plate text-caption px-2 py-0.5 rounded tracking-widest font-bold">{row.vehiclePlate}</span>
      ) : null}
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">{row.message || row.kind}</p>
      {row.assigneeLabel ? (
      <span className="font-caption text-caption text-secondary mt-1">Assigned: {row.assigneeLabel}</span>
      ) : null}
      </div>
      </div>
      <div className="flex items-center gap-space-xs shrink-0" onClick={(e) => e.stopPropagation()}>
      <InventoryOverflowMenu icon="more_vert" title="More options" items={alertMenu(row.id)} className="shrink-0" />
      </div>
      </button>
        );
      })
      )}
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm lg:w-[320px] shrink-0">
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-space-md">Alert detail</h3>
      {form.selectedAlertRow ? (
      <div className="flex flex-col gap-space-sm font-body-sm text-body-sm">
      <div className="font-semibold text-on-surface">{form.selectedAlertRow.title}</div>
      <div className="text-on-surface-variant">{form.selectedAlertRow.message}</div>
      <div className="font-label-code text-caption text-secondary">Status: {form.selectedAlertRow.status}</div>
      {form.selectedAlertRow.sku ? (
      <div className="font-label-code text-caption">SKU: {form.selectedAlertRow.sku}</div>
      ) : null}
      {form.selectedAlert && isStoredAlert(form.selectedAlert) && !shell.readOnly ? (
      <button
        type="button"
        className="mt-space-md h-9 px-space-md rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60"
        disabled={!form.selectedAlertId}
        title={form.markDoneSelectedDisabledReason || 'Mark selected alert done'}
        onClick={() => form.selectedAlertId && void form.markDone(form.selectedAlertId).catch(() => undefined)}
      >
        Mark done
      </button>
      ) : (
      <p className="mt-space-md font-caption text-caption text-on-surface-variant">This alert clears by itself when the record behind it changes.</p>
      )}
      <button
        type="button"
        className="h-9 px-space-md rounded-lg bg-surface-container text-on-surface font-semibold"
        onClick={() => form.selectedAlert && form.openRelated(form.selectedAlert)}
      >
        {form.selectedAlert ? form.openLabel(form.selectedAlert) : 'Open record'}
      </button>
      </div>
      ) : (
      <p className="font-body-sm text-body-sm text-on-surface-variant">Select an alert to see details and actions.</p>
      )}
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm lg:col-span-2">
      <div className="flex items-center justify-between mb-space-md">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-on-surface text-[20px]">history</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Recently resolved</h3>
      </div>
      </div>
      <div className="space-y-space-sm">
      {form.resolvedAlertRows.length === 0 ? (
      <p className="font-body-sm text-on-surface-variant p-space-sm">No recently resolved alerts.</p>
      ) : (
      form.resolvedAlertRows.map((row) => (
      <div key={row.id} className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between text-body-sm font-body-sm">
      <div className="flex items-center gap-space-md min-w-0">
      <span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span>
      <span className="truncate"><strong className="font-semibold text-on-surface">{row.title}</strong></span>
      </div>
      <div className="flex items-center gap-space-md shrink-0">
      <span className="font-label-code text-caption text-on-surface-variant">Resolved by {row.resolverLabel}</span>
      <span className="font-label-code text-caption text-secondary">{row.whenLabel}</span>
      </div>
      </div>
      ))
      )}
      </div>
      </div>
      </div>

      </div>
      </div>
      </div></div>
    </div>
  );
}
