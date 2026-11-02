/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useIn13AlertsForm } from './hooks/useIn13AlertsForm';
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';
import { InventoryOverflowMenu } from '../InventoryOverflowMenu';
import { firstVendorName, strField } from '../inventoryData';
export function In13Alerts() {
  const form = useIn13AlertsForm();
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const openApprovalDrawer = () => {
    const pending =
      shell.alerts.find((a) => strField(a, 'status', '') === 'pending') ??
      shell.alerts.find((a) => strField(a, 'kind', '').includes('approval')) ??
      shell.alerts[0];
    const approvalId = pending
      ? strField(pending, 'approval_id', strField(pending, 'id', '')) || null
      : null;
    shell.setSelectedApprovalId(approvalId);
    shell.openModal('approval-drawer');
  };
  const vendorName = firstVendorName(live.vendors);
  const secondary = live.secondaryVehicle;
  const lowStockLabel = live.lowStockLabel;
  const alertRow = (i: number) => shell.alerts[i] ?? {};
  const alertMenu = (i: number) => {
    const a = alertRow(i);
    const id = strField(a, 'id', '');
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
      <button type="button" className="flex items-center gap-space-xs bg-primary text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm" onClick={() => form.newRequisition()}>
      <span className="material-symbols-outlined text-[16px]">add</span>
      <span>New Requisition</span>
      </button>
      </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pt-2">
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Overview</a>
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Stock</a>
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Vehicle kits</a>
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Assets</a>
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Movements</a>
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Purchasing</a>
      <a className="px-space-md py-2 rounded-lg text-on-surface-variant hover:text-on-surface font-body-sm text-body-sm transition-colors whitespace-nowrap" href="#">Counts</a>
      <a className="flex items-center gap-space-xs bg-primary text-on-primary px-space-md py-1.5 rounded-lg font-body-sm text-body-sm font-semibold shadow-sm whitespace-nowrap" href="#">
      <span>Alerts</span>
      <span className="bg-error text-on-error font-label-code text-[11px] px-1.5 py-0.2 rounded-full font-bold">5</span>
      </a>
      </div>
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
      <input className="w-full bg-surface-container-low pl-9 pr-space-md py-2 rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container-lowest transition-colors" placeholder="Search alerts..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)}/>
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
      <span className="font-caption text-caption text-error font-medium">Kit & telemetry assets missing</span>
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

      <div className="flex flex-col gap-space-md">

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">

      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-error"></div>
      <div className="flex items-start gap-space-lg pl-space-xs min-w-0">
      <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0 mt-0.5">
      <span className="material-symbols-outlined text-[22px]">warning</span>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center flex-wrap gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">{live.secondaryPlate} is missing its whole kit</span>
      <span className="bg-error-container text-on-error-container font-label-code text-[11px] font-bold px-2 py-0.5 rounded">ROAD CLEARANCE BLOCKED</span>
      <span className="bg-surface-container text-on-surface-variant font-label-plate text-caption px-2 py-0.5 rounded tracking-widest font-bold">{live.secondaryPlate}</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">{live.secondaryPlate} · {secondary ? `${secondary.missingLines + secondary.shortLines} kit gaps` : 'Kit compliance gap'}. Vehicle cannot be road-cleared for dispatch.</p>
      <div className="flex items-center flex-wrap gap-x-space-lg gap-y-1 font-caption text-caption text-secondary mt-1">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">schedule</span>
      <span className="font-label-code text-caption">2 days ago</span>
      </span>
      <span>•</span>
      <span>Target: {live.secondaryPlate}</span>
      <span>•</span>
      <span>Depot Bay: Kingston Gate 1</span>
      </div>
      </div>
      </div>
      <div className="flex items-center justify-between lg:justify-end gap-space-md shrink-0 pt-space-sm lg:pt-0">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-1.5 rounded-full">
      <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-code text-[10px] font-bold">DT</div>
      <span className="font-body-sm text-body-sm text-on-surface font-medium">Deeki T (Platform Owner)</span>
      </div>

      <div className="flex items-center gap-space-xs">
      <button type="button" onClick={openApprovalDrawer} className="flex items-center gap-space-xs bg-primary hover:bg-primary/90 text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold shadow-sm transition-transform active:scale-95 flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px]">build_circle</span>
      <span>Issue kit</span>
      </button>
      <InventoryOverflowMenu icon="more_vert" title="More options" items={alertMenu(0)} className="shrink-0" />
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">

      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary-container"></div>
      <div className="flex items-start gap-space-lg pl-space-xs min-w-0">
      <div className="w-10 h-10 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0 mt-0.5">
      <span className="material-symbols-outlined text-[22px]">inventory_2</span>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center flex-wrap gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">{lowStockLabel !== '—' ? `${lowStockLabel} is low` : 'Low stock alert'}</span>
      <span className="bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-code text-[11px] font-bold px-2 py-0.5 rounded">REORDER LEVEL MET</span>
      <span className="bg-surface-container text-on-surface-variant font-label-code text-caption px-2 py-0.5 rounded font-medium">SKU: ACC-PHM-01</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">{live.hubName} has low stock on {lowStockLabel}. Preferred supplier: {vendorName}.</p>
      <div className="flex items-center flex-wrap gap-x-space-lg gap-y-1 font-caption text-caption text-secondary mt-1">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">schedule</span>
      <span className="font-label-code text-caption">1 hour ago</span>
      </span>
      <span>•</span>
      <span>Preferred Supplier: {vendorName}</span>
      <span>•</span>
      <span>Unit Cost: {form.live.totalStockValue}</span>
      </div>
      </div>
      </div>
      <div className="flex items-center justify-between lg:justify-end gap-space-md shrink-0 pt-space-sm lg:pt-0">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-1.5 rounded-full">
      <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-code text-[10px] font-bold">DT</div>
      <span className="font-body-sm text-body-sm text-on-surface font-medium">Deeki T</span>
      </div>

      <div className="flex items-center gap-space-xs">
      <button type="button" className="bg-surface-container hover:bg-surface-container-high text-on-surface px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1" onClick={() => form.reorder(alertRow(1))}>
      <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
      <span>Reorder</span>
      </button>
      <InventoryOverflowMenu icon="more_vert" title="More options" items={alertMenu(1)} className="shrink-0" />
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">

      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary-container"></div>
      <div className="flex items-start gap-space-lg pl-space-xs min-w-0">
      <div className="w-10 h-10 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0 mt-0.5">
      <span className="material-symbols-outlined text-[22px]">videocam_off</span>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center flex-wrap gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Dash camera on {live.primaryPlate} has no serial number</span>
      <span className="bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-code text-[11px] font-bold px-2 py-0.5 rounded">UNREGISTERED SERIAL</span>
      <span className="bg-surface-container text-on-surface-variant font-label-plate text-caption px-2 py-0.5 rounded tracking-widest font-bold">{live.primaryPlate}</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">{live.primaryPlate} has an installed unit without a registered serial in the asset ledger. Annual audit compliance at risk.</p>
      <div className="flex items-center flex-wrap gap-x-space-lg gap-y-1 font-caption text-caption text-secondary mt-1">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">schedule</span>
      <span className="font-label-code text-caption">6 Jan 2026</span>
      </span>
      <span>•</span>
      <span>Model: Thinkware T700 Front/Rear Dual</span>
      <span>•</span>
      <span>Installed Hub: Kingston Electrical Bay</span>
      </div>
      </div>
      </div>
      <div className="flex items-center justify-between lg:justify-end gap-space-md shrink-0 pt-space-sm lg:pt-0">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-1.5 rounded-full">
      <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-label-code text-[10px] font-bold">DT</div>
      <span className="font-body-sm text-body-sm text-on-surface font-medium">Deeki T</span>
      </div>

      <div className="flex items-center gap-space-xs">
      <button type="button" className="bg-surface-container hover:bg-surface-container-high text-on-surface px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1" onClick={() => form.addSerial(alertRow(2))}>
      <span className="material-symbols-outlined text-[16px]">qr_code_scanner</span>
      <span>Add serial</span>
      </button>
      <InventoryOverflowMenu icon="more_vert" title="More options" items={alertMenu(2)} className="shrink-0" />
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">

      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-tertiary-container"></div>
      <div className="flex items-start gap-space-lg pl-space-xs min-w-0">
      <div className="w-10 h-10 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0 mt-0.5">
      <span className="material-symbols-outlined text-[22px]">assignment_late</span>
      </div>

      <div className="relative shrink-0 hidden sm:block">
      <img className="w-16 h-16 object-cover rounded-lg bg-surface-container" data-alt="High contrast photograph of an open vehicle hatchback trunk carpet showing empty elastic emergency mounting straps where a reflective warning triangle should be clipped, fleet yard workshop lighting in Kingston." src="https://lh3.googleusercontent.com/aida-public/AB6AXuCg0jstt6r5dCQxKF46sLyn8UQzwpvrpKO1op51-nkxsq4O3T9XFwO4xmYbro9rvlypmDEIsaIB313h8Lll75Z84q2z2pyj2ZlC1rSsHzoEUpbGYPwgOBBgFNf0HU90bho4xxRi6Jf3VftYB2hmuOKuYn2Jn-dT6Zm1Dtv35i6iCzUrD2aytnuv2-ZJXgU_Mbshrq6b0pYFkgTIN7oUVWnzREZMJKDZKIVGwJZMYEs"/>
      <div className="absolute inset-0 bg-primary/20 rounded-lg flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
      <span className="material-symbols-outlined text-on-primary text-[20px]">zoom_in</span>
      </div>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center flex-wrap gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Driver report: Warning triangle missing — {live.primaryPlate}</span>
      <span className="bg-secondary-container text-on-secondary-container font-label-code text-[11px] font-bold px-2 py-0.5 rounded">DRIVER APP DISPATCH</span>
      <span className="bg-surface-container text-on-surface-variant font-label-plate text-caption px-2 py-0.5 rounded tracking-widest font-bold">{live.primaryPlate}</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">Submitted via Roam Driver App by Driver of {live.primaryPlate}. Note: “Boot strap was empty upon vehicle pre-shift handover at Kingston Gate 2.”</p>
      <div className="flex items-center flex-wrap gap-x-space-lg gap-y-1 font-caption text-caption text-secondary mt-1">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">schedule</span>
      <span className="font-label-code text-caption">3 hours ago</span>
      </span>
      <span>•</span>
      <span className="font-label-code text-caption">Incident #REP-904</span>
      <span>•</span>
      <span>Reported by: Omar Sterling (Shift A)</span>
      </div>
      </div>
      </div>
      <div className="flex items-center justify-between lg:justify-end gap-space-md shrink-0 pt-space-sm lg:pt-0">

      <div className="flex items-center gap-space-xs bg-surface-container-low px-space-md py-1.5 rounded-full">
      <div className="w-6 h-6 rounded-full bg-secondary text-on-secondary flex items-center justify-center font-label-code text-[10px] font-bold">DC</div>
      <span className="font-body-sm text-body-sm text-on-surface font-medium">—</span>
      </div>

      <div className="flex items-center gap-space-xs">
      <button type="button" className="bg-surface-container hover:bg-surface-container-high text-on-surface px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1" onClick={() => form.reviewApproval(alertRow(3))}>
      <span className="material-symbols-outlined text-[16px]">rule</span>
      <span>Review</span>
      </button>
      <InventoryOverflowMenu icon="more_vert" title="More options" items={alertMenu(3)} className="shrink-0" />
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">

      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-error"></div>
      <div className="flex items-start gap-space-lg pl-space-xs min-w-0">
      <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0 mt-0.5">
      <span className="material-symbols-outlined text-[22px]">gpp_maybe</span>
      </div>
      <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center flex-wrap gap-space-sm">
      <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">Nightly check found a stock number that doesn't add up — Main store, Car jack</span>
      <span className="bg-error-container text-on-error-container font-label-code text-[11px] font-bold px-2 py-0.5 rounded">LEDGER VARIANCE</span>
      <span className="bg-surface-container text-on-surface-variant font-label-code text-caption px-2 py-0.5 rounded font-medium">SKU: TOOL-HYD-02</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant">Automated ledger reconciliation identified discrepancy between recorded movements and physical ledger snapshot: expected 2, balance shows 1.</p>
      <div className="flex items-center flex-wrap gap-x-space-lg gap-y-1 font-caption text-caption text-secondary mt-1">
      <span className="flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">schedule</span>
      <span className="font-label-code text-caption">Ran 06:30 today</span>
      </span>
      <span>•</span>
      <span>Depot: Main store — Kingston</span>
      <span>•</span>
      <span className="text-error font-medium">Variance: -1 Unit (Value: {form.live.totalStockValue})</span>
      </div>
      </div>
      </div>
      <div className="flex items-center justify-between lg:justify-end gap-space-md shrink-0 pt-space-sm lg:pt-0">

      <button type="button" className="flex items-center gap-space-xs bg-surface-container-low hover:bg-surface-container px-space-md py-1.5 rounded-full text-on-surface-variant hover:text-on-surface transition-colors" onClick={() => { const id = strField(alertRow(4), 'id', ''); if (id) form.assignToMe(id); }}>
      <span className="material-symbols-outlined text-[16px]">person_add</span>
      <span className="font-body-sm text-body-sm font-medium">Unassigned</span>
      </button>

      <div className="flex items-center gap-space-xs">
      <button type="button" onClick={openApprovalDrawer} className="flex items-center gap-space-xs bg-primary hover:bg-primary/90 text-on-primary px-space-lg py-2 rounded-lg font-body-sm text-body-sm font-semibold shadow-sm transition-transform active:scale-95 flex items-center gap-1">
      <span className="material-symbols-outlined text-[16px]">sync_alt</span>
      <span>Open</span>
      </button>
      <InventoryOverflowMenu icon="more_vert" title="More options" items={alertMenu(4)} className="shrink-0" />
      </div>
      </div>
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
      <div className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between text-body-sm font-body-sm">
      <div className="flex items-center gap-space-md min-w-0">
      <span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span>
      <span className="truncate"><strong className="font-semibold text-on-surface">Jump starter kit replenished</strong> — Kingston Bay 4</span>
      </div>
      <div className="flex items-center gap-space-md shrink-0">
      <span className="font-label-code text-caption text-on-surface-variant">Resolved by Deeki T</span>
      <span className="font-label-code text-caption text-secondary">Yesterday 18:20</span>
      </div>
      </div>
      <div className="p-space-sm bg-surface-container-low rounded-lg flex items-center justify-between text-body-sm font-body-sm">
      <div className="flex items-center gap-space-md min-w-0">
      <span className="material-symbols-outlined text-secondary text-[18px]">check_circle</span>
      <span className="truncate"><strong className="font-semibold text-on-surface">Spare tire barcode audit verified</strong> — 8820HJ</span>
      </div>
      <div className="flex items-center gap-space-md shrink-0">
      <span className="font-label-code text-caption text-on-surface-variant">Resolved by —</span>
      <span className="font-label-code text-caption text-secondary">Yesterday 14:15</span>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between">
      <div>
      <div className="flex items-center justify-between mb-2">
      <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Storeroom Sensor Status</span>
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
      </div>
      <div className="font-headline-sm text-headline-sm text-on-surface font-bold">Kingston Depot Cage A</div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">RFID gate scanner and smart tag antennas operating at nominal signal integrity.</p>
      </div>
      <div className="pt-space-md mt-space-md bg-surface-container-low p-space-md rounded-lg flex items-center justify-between">
      <span className="font-label-code text-caption text-on-surface font-semibold">Gate RFID Check: PASS</span>
      <span className="font-label-code text-caption text-secondary">99.4% read accuracy</span>
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
