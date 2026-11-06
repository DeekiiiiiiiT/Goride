/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn13AlertsForm } from './hooks/useIn13AlertsForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { InventoryOverflowMenu } from '../InventoryOverflowMenu';
import { strField } from '../inventoryData';
export function In13Alerts() {
  const form = useIn13AlertsForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const secondary = live.secondaryVehicle;
  const lowStockLabel = live.lowStockLabel;
  const alertRecord = (id: string) => form.filtered.find((a) => strField(a, 'id', '') === id) ?? {};
  const alertMenu = (id: string) => {
    const a = alertRecord(id);
    return [
      { label: 'Mark done', onClick: () => id && form.markDone(id) },
      { label: 'Open record', onClick: () => form.openRelated(a) },
    ];
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
      <div className="flex items-center gap-space-xs bg-surface-container px-space-md py-1.5 rounded-lg text-on-surface-variant">
      <span className="material-symbols-outlined text-[18px]">verified</span>
      <span className="font-label-code text-caption font-semibold">Ledger Sync: Operational</span>
      </div>
      <button type="button" className="flex items-center gap-space-xs bg-primary text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm" onClick={() => shell.openModal('receive')}>
      <span className="material-symbols-outlined text-[16px]">move_to_inbox</span>
      <span>Receive stock</span>
      </button>
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
      <span className="bg-error-container text-on-error-container font-label-code text-caption font-bold px-2 py-0.5 rounded">2 CRITICAL</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">5 actionable discrepancy and compliance triggers requiring storeroom dispatch or hub resolution.</p>
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
      <button type="button" className="flex items-center gap-space-xs bg-surface-container-low hover:bg-surface-container text-on-surface px-space-md py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors" onClick={() => form.markAllViewed()}>
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">done_all</span>
      <span>Mark all viewed</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Active Deficits</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">{form.live.totalStockValue}</div>
      <span className="font-caption text-caption text-error font-medium">Kit items missing</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-error-container text-on-error-container flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">warning</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Kit Non-Compliance</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">1 Vehicle</div>
      <span className="font-caption text-caption text-on-surface-variant">Dispatch blocked at Kingston #01</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-surface-container text-primary flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">block</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Stock Reorders Due</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">1 SKU</div>
      <span className="font-caption text-caption text-tertiary-container font-medium">Below safety threshold</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">inventory</span>
      </div>
      </div>
      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-center justify-between">
      <div>
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Ledger Variance</span>
      <div className="font-headline-lg text-headline-lg font-bold text-on-surface mt-1">-1 Unit</div>
      <span className="font-caption text-caption text-on-surface-variant">Audit triggered today 06:30</span>
      </div>
      <div className="w-10 h-10 rounded-lg bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center">
      <span className="material-symbols-outlined text-[20px]">calculate</span>
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
      <div className="flex items-center gap-space-sm">
      <span className="font-caption text-caption text-on-surface-variant uppercase font-semibold">Priority Sort:</span>
      <div className="flex items-center gap-1 bg-surface-container-lowest px-space-md py-1.5 rounded-lg shadow-sm font-body-sm text-body-sm text-on-surface">
      <span>Critical Severity First</span>
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">expand_more</span>
      </div>
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
      <button
        type="button"
        className="mt-space-md h-9 px-space-md rounded-lg bg-primary text-on-primary font-semibold disabled:opacity-60"
        disabled={!form.selectedAlertId}
        title={form.markDoneSelectedDisabledReason || 'Mark selected alert done'}
        onClick={() => form.selectedAlertId && form.markDone(form.selectedAlertId)}
      >
        Mark done
      </button>
      <button
        type="button"
        className="h-9 px-space-md rounded-lg bg-surface-container text-on-surface font-semibold"
        onClick={() => form.selectedAlert && form.openRelated(form.selectedAlert)}
      >
        Open related record
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
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Recent Hub Clearances (Last 24h)</h3>
      </div>
      <a className="font-caption text-caption text-primary font-semibold hover:underline" href="#">View 18 resolved alerts</a>
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

      <div className="w-full bg-surface-container p-space-lg rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md text-on-surface">
      <div className="flex items-center gap-space-md">
      <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-on-surface text-[18px]">info</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface">
                  Looking for vehicle service schedules, driver license expirations, or road fitness renewals? Car service and document alerts are in
                  <a className="font-semibold underline hover:text-on-surface-variant ml-1" href="#">Vehicles →</a>
      </p>
      </div>
      <a className="inline-flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-on-surface hover:underline whitespace-nowrap self-end sm:self-auto" href="#">
      <span>Go to Vehicles & Maintenance</span>
      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </a>
      </div>
      </div>
      </div>
      </div></div>
    </div>
  );
}
