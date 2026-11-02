/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapRequisitionForm } from './useGapRequisitionForm';

export function GapRequisition(p: { onClose?: () => void }) {
  const form = useGapRequisitionForm(p.onClose);
  const closeCreate = () => form.closeCreate();
  const tabClass = (key: typeof form.statusFilter) =>
    form.statusFilter === key
      ? 'px-space-md py-1 rounded bg-surface-container-lowest shadow-sm font-body-sm text-body-sm font-semibold text-on-surface'
      : 'px-space-md py-1 rounded hover:bg-surface-container-lowest/50 font-body-sm text-body-sm text-on-surface-variant transition-colors';
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Requisition">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl relative">

        <div className="flex flex-col gap-space-sm mb-space-xl">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <a className="flex items-center gap-1 hover:text-on-surface transition-colors" href="#">
        <span className="material-symbols-outlined text-[14px]">arrow_back</span>
        <span>Inventory & Assets</span>
        </a>
        <span>/</span>
        <span className="text-on-surface font-semibold">Stock Requisitions</span>
        <span>/</span>
        <span className="font-label-code text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded text-on-surface">HUB-KIN-STORE</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
        <div>
        <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Requisitions & Material Requests</h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-0.5">
                    Internal staging pipeline for fleet drivers, master technicians, and scheduled vehicles before stock release from the Kingston Main Depot.
                  </p>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="bg-surface-container px-space-md py-1.5 rounded flex items-center gap-space-sm">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        <span className="font-label-code text-caption text-on-surface">Store Queue: Active</span>
        </div>
        <button type="button" className="bg-primary hover:bg-inverse-surface text-on-primary font-body-sm text-body-sm font-semibold px-space-lg py-2 rounded shadow-sm flex items-center gap-space-xs transition-all" id="openModalBtn" onClick={() => form.openCreate()}>
        <span className="material-symbols-outlined text-[16px]">add</span>
        <span>New request</span>
        </button>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-space-lg mb-space-xl">
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Queue Allocation</span>
        <span className="material-symbols-outlined text-[18px]">inventory_2</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-price text-headline-lg text-on-surface font-bold">{form.requisitions.length} requests</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant">
        <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
        <span>2 units pending physical count</span>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Awaiting Auth</span>
        <span className="material-symbols-outlined text-[18px]">gavel</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-price text-headline-lg text-on-surface font-bold">{form.pipelineTotalLabel}</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-error">
        <span className="material-symbols-outlined text-[12px] text-error">priority_high</span>
        <span>1 request exceeds driver threshold</span>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Fulfillment Velocity</span>
        <span className="material-symbols-outlined text-[18px]">timer</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-price text-headline-lg text-on-surface font-bold">22.4 min</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant">
        <span>Req-to-dock cycle time</span>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-on-surface-variant">
        <span className="font-caption text-caption uppercase tracking-wider">Depot Status</span>
        <span className="material-symbols-outlined text-[18px]">warehouse</span>
        </div>
        <div className="mt-space-md">
        <div className="font-label-code text-headline-sm text-on-surface font-bold">Bay C · Isle 04</div>
        <div className="flex items-center gap-1.5 mt-1 font-caption text-caption text-on-surface-variant">
        <span>Staging bay load: 40% capacity</span>
        </div>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden flex flex-col">

        <div className="p-space-lg bg-surface-container-lowest flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">

        <div className="flex items-center gap-1 bg-surface-container p-1 rounded">
        <button type="button" className={tabClass('all')} onClick={() => form.setStatusFilter('all')}>
                    All requests <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container text-on-surface-variant">{form.statusCounts.all}</span>
        </button>
        <button type="button" className={tabClass('open')} onClick={() => form.setStatusFilter('open')}>
                    Open <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">{form.statusCounts.open}</span>
        </button>
        <button type="button" className={tabClass('approved')} onClick={() => form.setStatusFilter('approved')}>
                    Approved <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">{form.statusCounts.approved}</span>
        </button>
        <button type="button" className={tabClass('issued')} onClick={() => form.setStatusFilter('issued')}>
                    Issued <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">{form.statusCounts.issued}</span>
        </button>
        <button type="button" className={tabClass('rejected')} onClick={() => form.setStatusFilter('rejected')}>
                    Rejected <span className="font-label-code text-[11px] ml-1 px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface">{form.statusCounts.rejected}</span>
        </button>
        </div>
        <div className="flex items-center gap-space-sm w-full md:w-auto">
        <div className="relative flex-1 md:w-64">
        <span className="material-symbols-outlined absolute left-2.5 top-2 text-[16px] text-on-surface-variant">search</span>
        <input className="w-full bg-surface-container-low pl-8 pr-3 py-1.5 rounded font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:bg-surface-container-lowest transition-all" placeholder="Filter ref, vehicle, or driver..." type="text" value={form.searchQuery} onChange={(e) => form.setSearchQuery(e.target.value)} />
        </div>
        <button type="button" className="p-1.5 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant transition-colors" onClick={() => form.setStatusFilter('open')} aria-label="Show open requests only">
        <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>
        </div>
        </div>

        <div className="flex flex-wrap items-center gap-space-sm px-space-lg pb-space-md">
        <button type="button" disabled={!form.selectedReqId || form.submit.saving} onClick={() => void form.approve()} className="px-space-md py-1.5 rounded-lg bg-primary text-on-primary font-body-sm font-semibold disabled:opacity-60">Approve</button>
        <button type="button" disabled={!form.selectedReqId || form.submit.saving} onClick={() => void form.reject()} className="px-space-md py-1.5 rounded-lg bg-surface-container-high text-on-surface font-body-sm font-semibold disabled:opacity-60">Reject</button>
        <button type="button" disabled={!form.selectedReqId || form.submit.saving} onClick={() => void form.issue()} className="px-space-md py-1.5 rounded-lg bg-secondary text-on-secondary font-body-sm font-semibold disabled:opacity-60">Issue now</button>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-left">
        <thead>
        <tr className="bg-surface-container-low text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <th className="py-space-md px-space-lg">Ref</th>
        <th className="py-space-md px-space-lg">For (Target)</th>
        <th className="py-space-md px-space-lg">Items Requested</th>
        <th className="py-space-md px-space-lg">Requested By</th>
        <th className="py-space-md px-space-lg">Status</th>
        <th className="py-space-md px-space-lg">Needed By</th>
        <th className="py-space-md px-space-lg text-right">Action</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm">
        {form.filteredRequisitions.length === 0 ? (
        <tr>
        <td colSpan={7} className="py-space-lg px-space-lg text-on-surface-variant">No requisitions yet. Use New request to create one.</td>
        </tr>
        ) : (
        form.pagedRequisitions.map((row) => (
        <tr key={String(row.id ?? row.ref_no)} className="hover:bg-surface-container-lowest/80 transition-colors">
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="font-label-code text-label-code text-on-surface font-semibold">{String(row.ref_no ?? row.number ?? row.id ?? '—')}</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="flex items-center gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">directions_car</span>
        <div>
        <span className="font-label-plate text-label-plate text-on-surface">{String(row.for_vehicle_id ?? row.vehicle_plate ?? '—')}</span>
        </div>
        </div>
        </td>
        <td className="py-space-md px-space-lg">
        <div className="text-on-surface font-medium">{String(row.line_count ?? '—')} items</div>
        <div className="font-caption text-caption text-on-surface-variant truncate max-w-xs">{String(row.note ?? row.summary ?? '—')}</div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <div className="text-on-surface">{String(row.requested_by ?? '—')}</div>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded font-caption text-caption font-semibold bg-surface-container-high text-on-surface">
        {form.statusLabel(row.status)}
                        </span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap">
        <span className="text-on-surface font-medium">{String(row.needed_by ?? '—')}</span>
        </td>
        <td className="py-space-md px-space-lg whitespace-nowrap text-right">
        <button type="button" onClick={() => form.setSelectedReqId(String(row.id))} className={`px-space-md py-1 rounded font-body-sm text-body-sm font-medium transition-colors ${form.selectedReqId === String(row.id) ? 'bg-primary text-on-primary' : 'bg-surface-container hover:bg-surface-container-high text-on-surface'}`}>
                          Review
                        </button>
        </td>
        </tr>
        ))
        )}
        </tbody>
        </table>
        </div>

        <div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md text-on-surface-variant font-caption text-caption">
        <div className="flex items-center gap-space-sm">
        <span>{form.paginationLabel}</span>
        <span className="text-outline-variant">·</span>
        <span className="font-label-code">Filter: {form.filterLabel}</span>
        </div>
        <div className="flex items-center gap-space-xs font-label-code">
        <button type="button" className="px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" disabled={!form.canPrevPage} onClick={() => form.prevPage()}>Prev</button>
        <span className="px-2 py-1 bg-surface-container-lowest rounded font-bold text-on-surface">{String(form.page + 1).padStart(2, '0')}</span>
        <button type="button" className="px-2.5 py-1 rounded bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors" disabled={!form.canNextPage} onClick={() => form.nextPage()}>Next</button>
        </div>
        </div>
        </div>

        {form.createOpen ? (
        <div className="fixed inset-0 z-50 bg-primary/40 backdrop-blur-sm flex items-center justify-center p-space-md overflow-y-auto" id="modalBackdrop">
        <div className="w-full max-w-[740px] bg-surface-container-lowest rounded-xl shadow-2xl overflow-hidden my-space-lg transition-transform duration-200" id="modalCard">

        <div className="px-space-xl py-space-lg bg-surface-container-low flex items-start justify-between">
        <div>
        <div className="flex items-center gap-space-xs mb-1">
        <span className="font-caption text-caption uppercase tracking-wider text-on-surface-variant font-semibold">Store Checkout Pipeline</span>
        <span className="text-outline-variant">/</span>
        <span className="font-label-code text-caption text-on-surface">{form.newFormCodeLabel}</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface">New requisition</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      Request parts or accessories for a vehicle or staff member before dispatch from Kingston Main.
                    </p>
        </div>
        <button type="button" className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container transition-colors" id="closeModalBtn" onClick={closeCreate}>
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <form className="p-space-xl flex flex-col gap-space-lg" id="requisitionForm" onSubmit={(e) => e.preventDefault()}>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
        <span>For (Recipient Target)</span>
        <span className="font-caption text-[11px] text-on-surface-variant font-normal">Required</span>
        </label>

        <div className="bg-surface-container p-1 rounded flex gap-1 mb-2">
        <button className={`flex-1 py-1 px-2 rounded font-body-sm text-body-sm text-center ${form.targetKind === 'vehicle' ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface transition-colors'}`} type="button" onClick={() => form.setTargetKind('vehicle')}>
                          Vehicle
                        </button>
        <button className={`flex-1 py-1 px-2 rounded font-body-sm text-body-sm text-center ${form.targetKind === 'staff' ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface transition-colors'}`} type="button" onClick={() => form.setTargetKind('staff')}>
                          Staff member
                        </button>
        </div>

        <div className="relative">
        <input className="w-full bg-surface-container-low px-3 py-2 rounded font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container transition-colors" placeholder={form.targetKind === 'vehicle' ? 'Vehicle plate or ID' : 'Staff member ID'} value={form.targetKind === 'vehicle' ? form.forVehicleId : form.forStaffId} onChange={(e) => (form.targetKind === 'vehicle' ? form.setForVehicleId(e.target.value) : form.setForStaffId(e.target.value))} />
        <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-on-surface-variant text-[18px]">expand_more</span>
        </div>
        <div className="flex items-center gap-1 font-caption text-caption text-on-surface-variant mt-1">
        <span className="material-symbols-outlined text-[12px]">directions_car</span>
        <span>Assigned to: — (Primary Driver)</span>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
        <span>Needed by Date & Time</span>
        <span className="font-caption text-[11px] text-on-surface-variant font-normal">Jamaica (EST)</span>
        </label>
        <div className="relative mt-8">
        <div className="flex items-center bg-surface-container-low rounded px-3 py-2">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-2">event</span>
        <input className="w-full bg-transparent font-label-code text-label-code text-on-surface outline-none" type="datetime-local" value={form.neededBy} onChange={(e) => form.setNeededBy(e.target.value)} />
        </div>
        </div>
        <div className="flex items-center gap-1 font-caption text-caption text-on-surface-variant mt-1">
        <span className="material-symbols-outlined text-[12px]">schedule</span>
        <span>Scheduled before morning route departure</span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm pt-space-xs">
        <div className="flex items-center justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Items Requested</span>
        <span className="font-caption text-caption text-on-surface-variant">Landed store valuation applies</span>
        </div>
        <div className="bg-surface-container-low rounded overflow-hidden">
        <div className="divide-y divide-surface-container">
        {form.draftLines.map((line) => (
        <div key={line.key} className="p-space-md flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest">
        <div className="flex-1">
        <div className="flex items-center gap-space-xs">
        <span className="font-body-md text-body-md font-semibold text-on-surface">{line.name}</span>
        <span className="font-label-code text-[11px] bg-surface-container px-1.5 py-0.5 rounded text-on-surface-variant">{line.sku}</span>
        </div>
        <div className="flex items-center gap-space-xs mt-1">
        <span className="font-label-price text-caption text-on-surface-variant">{form.formatJmd(line.unitJmd)}</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <div className="flex items-center bg-surface-container-low rounded px-2 py-1">
        <span className="font-caption text-caption text-on-surface-variant mr-2">Qty</span>
        <input className="w-12 bg-transparent text-center font-label-code text-label-code font-bold text-on-surface outline-none" min={1} type="number" value={line.qty} onChange={(e) => form.setDraftLineQty(line.key, Number(e.target.value))} aria-label={`Quantity for ${line.name}`}/>
        <span className="font-caption text-caption text-on-surface-variant ml-1">each</span>
        </div>
        <button className="text-on-surface-variant hover:text-error transition-colors p-1" type="button" onClick={() => form.removeDraftLine(line.key)}>
        <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
        </div>
        </div>
        ))}
        </div>

        <div className="p-space-md bg-surface-container-low flex items-center justify-between">
        <button className="inline-flex items-center gap-1.5 font-body-sm text-body-sm font-semibold text-on-surface hover:text-on-surface-variant transition-colors" type="button" onClick={() => form.addDraftLine()}>
        <span className="material-symbols-outlined text-[16px]">add_circle</span>
        <span>+ Add another item</span>
        </button>
        <div className="font-label-price text-caption text-on-surface-variant">
                          Estimated value: <span className="text-on-surface font-bold">{form.draftTotalLabel}</span>
        </div>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between">
        <span>Reason / Work order context</span>
        <span className="font-caption text-[11px] text-on-surface-variant font-normal">Audit Trail Documentation</span>
        </label>
        <textarea className="w-full bg-surface-container-low p-space-md rounded font-body-sm text-body-sm text-on-surface outline-none focus:bg-surface-container transition-colors resize-none" placeholder="Provide reason or reference incident/maintenance report..." rows={3} value={form.note} onChange={(e) => form.setNote(e.target.value)} />
        </div>

        <div className="bg-surface-container-low rounded p-space-md flex items-start gap-space-md">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[18px] text-on-surface">info</span>
        </div>
        <div className="flex-1 text-on-surface font-body-sm text-body-sm leading-relaxed">
        <span className="font-semibold text-on-surface">What will change: </span>
        <span className="text-on-surface-variant">
                        {form.draftLines.length} items will be reserved for {form.targetKind === 'vehicle' ? 'Vehicle' : 'Staff'} {form.vehicleTargetLabel} once approved. Nothing leaves the Main store until an authorized storekeeper clicks <span className="font-semibold text-on-surface">Issue now</span>.
                      </span>
        </div>
        </div>

        <div className="pt-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption">
        <span className="w-1.5 h-1.5 rounded-full bg-on-surface"></span>
        <span>Logged by — (Auth #02)</span>
        </div>
        <div className="flex items-center gap-space-md">
        <button className="px-space-lg py-2 rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium transition-colors" id="cancelModalBtn" type="button" onClick={closeCreate}>
                        Cancel
                      </button>
        <button type="button" disabled={!form.canSubmit || form.submit.saving} onClick={() => void form.submitReq()} className="px-space-xl py-2 rounded bg-primary hover:bg-inverse-surface text-on-primary font-body-sm text-body-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60" id="submitRequestBtn">
        <span className="material-symbols-outlined text-[16px]">send</span>
        <span>{form.submit.saving ? 'Submitting…' : 'Send request'}</span>
        </button>
        </div>
        </div>
        </form>
        </div>
        </div>
        ) : null}
        </div>
        </div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
