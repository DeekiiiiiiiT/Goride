/** Ported from Stitch — do not simplify layout (audit §0.4). Real asset fields only (IV-13, IV-14, IV-16, IV-20). */
import { useIn9AssetPageForm } from './hooks/useIn9AssetPageForm';
import { goToFleetPath, vehiclePath } from '../inventoryNav';
import { useFleetTimezone, formatInFleetTz } from '../../../utils/timezoneDisplay';

function daysUntil(ymd: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(ymd)) return null;
  const due = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86400000);
}

export function In9AssetPage() {
  const form = useIn9AssetPageForm();
  const timezone = useFleetTimezone();
  const readOnly = form.shell.readOnly;
  if (!form.hasAsset || !form.asset) {
    return (
      <div className="fleet-inventory-stitch inventory-stitch-root p-space-xl text-center text-on-surface-variant font-body-md">
        Select an asset from the Assets tab to view its page.
      </div>
    );
  }
  const asset = form.asset;
  const assetName = form.strField(asset, 'name', 'Asset');
  const plate = form.strField(asset, 'license_plate', '');
  const vehicleId = form.strField(asset, 'vehicle_id', '');
  const locationName = form.strField(asset, 'location_name', '—');
  const status = form.strField(asset, 'status', '—').replace(/_/g, ' ');
  const savedSerial = form.strField(asset, 'serial_number', '');
  const installedAt = form.strField(asset, 'installed_at', '').slice(0, 10);
  const due = form.nextInspectionDueLabel !== '—' ? daysUntil(form.nextInspectionDueLabel) : null;
  const dueText = due == null ? null : due === 0 ? 'today' : due > 0 ? `in ${due} day${due === 1 ? '' : 's'}` : `${-due} day${due === -1 ? '' : 's'} overdue`;
  const when = (iso: string) =>
    iso && iso !== '—' ? formatInFleetTz(iso, timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="max-w-[1400px] mx-auto px-margin md:px-margin-desktop py-space-lg"><div className="flex flex-col w-full space-y-space-lg pb-space-xl">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pt-space-xs">
      <div className="flex items-center gap-space-sm">
      <button type="button" onClick={() => form.closeAssetPage()} className="inline-flex items-center gap-1.5 px-space-sm py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface transition-colors font-body-sm text-body-sm group shadow-sm">
      <span aria-hidden="true" className="material-symbols-outlined text-[18px] transition-transform group-hover:-translate-x-0.5">arrow_back</span>
      <span className="font-medium">Back</span>
      </button>
      <span className="text-surface-tint">/</span>
      <span className="font-label-code text-caption text-on-surface font-semibold">Asset detail</span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg">
      <div className="flex flex-wrap items-center gap-space-md">
      <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
      <span aria-hidden="true" className="material-symbols-outlined text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>
      </div>
      <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-space-sm">
      <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">{assetName}</h1>
      {savedSerial ? (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface-container rounded-lg font-label-code text-label-code text-on-surface">
      <span data-stitch-data-stitch-id="serialDisplay">{savedSerial}</span>
      <button type="button" className="p-0.5 hover:text-primary transition-colors flex items-center justify-center" title="Copy serial" aria-label="Copy serial" onClick={() => void form.copySerial()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">content_copy</span>
      </button>
      </div>
      ) : (
      <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-caption font-semibold">No serial yet</span>
      )}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface font-label-code text-caption font-semibold">
      <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-surface-tint">{plate ? 'directions_car' : 'warehouse'}</span>
      <span>{plate ? <>Installed on <span className="font-label-plate tracking-wider text-primary">{plate}</span></> : locationName}</span>
      </div>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant capitalize">Status: {status}</p>
      </div>
      </div>

      {!readOnly ? (
      <div className="flex flex-wrap items-center gap-space-xs sm:gap-space-sm">
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.openMoveDialog()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">drive_file_move</span>
      <span>Move</span>
      </button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.openRepairDialog()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">build</span>
      <span>Send to repair</span>
      </button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-low hover:bg-error-container hover:text-on-error-container text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.openConditionDialog()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">report_problem</span>
      <span>Change condition</span>
      </button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-error-container text-error hover:bg-error-container/80 font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm" onClick={() => form.retireConfirmed()}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">archive</span>
      <span>Retire</span>
      </button>
      </div>
      ) : null}
      </div>

      {form.confirmRetire ? (
      <div className="bg-error-container/40 rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md" role="alertdialog" aria-label="Confirm retire">
      <span className="font-body-md text-body-md text-on-surface font-semibold">Retire {assetName} for good? It leaves Stock value and can&apos;t be issued again.</span>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-lowest text-on-surface font-body-sm font-semibold" onClick={() => form.setConfirmRetire(false)}>Keep it</button>
      <button type="button" className="px-space-md py-2 rounded-lg bg-error text-on-error font-body-sm font-semibold" onClick={() => { form.setConfirmRetire(false); void form.retire().catch(() => undefined); }}>Retire</button>
      </div>
      </div>
      ) : null}

      {form.submit.error ? (
      <div className="bg-error-container/50 text-error rounded-xl p-space-md font-body-sm" role="alert">{form.submit.error}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-space-md">

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Cost</span>
      <span aria-hidden="true" className="material-symbols-outlined text-sm">payments</span>
      </div>
      <div>
      <div className="font-label-price text-headline-sm text-on-surface font-bold">{form.valueLabel}</div>
      {form.totalRepairCostJmd > 0 ? (
      <div className="font-caption text-caption text-on-surface-variant mt-1">Total repairs: {form.totalRepairCostLabel}</div>
      ) : null}
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Installed</span>
      <span aria-hidden="true" className="material-symbols-outlined text-sm">event</span>
      </div>
      <div className="font-label-code text-headline-sm text-on-surface font-bold">{installedAt || '—'}</div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Serial number</span>
      <span aria-hidden="true" className="material-symbols-outlined text-sm">qr_code_2</span>
      </div>
      {!readOnly ? (
      <div className="flex flex-col gap-1.5">
      <input type="text" className="w-full bg-surface-container-low rounded-lg px-2 py-1 font-label-code text-body-sm text-on-surface" placeholder="From the device label" value={form.serial} onChange={(e) => form.setSerial(e.target.value)} aria-label="Serial number" data-testid="asset-serial-input"/>
      <button type="button" className="self-start px-2 py-1 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold disabled:opacity-60" disabled={Boolean(form.saveSerialDisabledReason) || form.serial.trim() === savedSerial} onClick={() => void form.saveSerial().catch(() => undefined)}>Save serial</button>
      </div>
      ) : (
      <div className="font-label-code text-body-md text-on-surface font-bold">{savedSerial || '—'}</div>
      )}
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col justify-between space-y-space-xs">
      <div className="flex items-center justify-between text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <span>Next inspection</span>
      <span aria-hidden="true" className="material-symbols-outlined text-sm">calendar_month</span>
      </div>
      <div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
      <span className="font-label-code text-headline-sm text-on-surface font-bold">{form.nextInspectionDueLabel}</span>
      {dueText ? <span className={`px-1.5 py-0.5 rounded font-caption text-caption font-medium ${due != null && due < 0 ? 'bg-error-container text-error' : 'bg-surface-container text-on-surface-variant'}`}>{dueText}</span> : null}
      </div>
      {!readOnly ? (
      <div className="mt-space-sm flex flex-col gap-1.5">
      <input type="date" className="w-full bg-surface-container-low rounded-lg px-2 py-1 font-body-sm text-body-sm text-on-surface" value={form.inspectionDueDate} onChange={(e) => form.setInspectionDueDate(e.target.value)} aria-label="Next check date"/>
      <input type="text" className="w-full bg-surface-container-low rounded-lg px-2 py-1 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant" placeholder="Note (required to save)" value={form.inspectionNote} onChange={(e) => form.setInspectionNote(e.target.value)}/>
      <button type="button" className="self-start px-2 py-1 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold" onClick={() => void form.saveNextInspection().catch(() => undefined)}>Save check date</button>
      </div>
      ) : null}
      </div>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">

      <div className="lg:col-span-8 space-y-space-lg">
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md gap-space-sm">
      <div className="flex items-center gap-2">
      <span aria-hidden="true" className="material-symbols-outlined text-primary text-xl">history</span>
      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">History</h2>
      </div>
      <div className="flex items-center gap-1.5 bg-surface-container p-1 rounded-lg self-start sm:self-auto font-caption text-caption">
      <button type="button" className={`px-2.5 py-1 rounded ${form.logFilter === 'all' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-lowest'}`} onClick={() => form.setLogFilter('all')}>All ({form.logCounts.all})</button>
      <button type="button" className={`px-2.5 py-1 rounded ${form.logFilter === 'incident' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-lowest'}`} onClick={() => form.setLogFilter('incident')}>Notes ({form.logCounts.incident})</button>
      <button type="button" className={`px-2.5 py-1 rounded ${form.logFilter === 'custody' ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-sm' : 'text-on-surface-variant hover:bg-surface-container-lowest'}`} onClick={() => form.setLogFilter('custody')}>Moves ({form.logCounts.custody})</button>
      </div>
      </div>
      <div className="relative pl-6 sm:pl-8 space-y-space-lg before:content-[''] before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-surface-container-high pt-space-sm">
      {form.eventRows.length === 0 ? (
      <p className="font-body-sm text-body-sm text-on-surface-variant pl-2">Nothing recorded for this asset yet.</p>
      ) : (
      form.eventRows.map((ev) => (
      <div key={ev.id} className="relative group">
      <div className="absolute -left-6 sm:-left-8 top-0.5 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center ring-4 ring-surface-container-lowest">
      <span aria-hidden="true" className="material-symbols-outlined text-[15px]">history</span>
      </div>
      <div className="bg-surface-container-low rounded-xl p-space-md shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
      <span className="font-label-code text-body-md text-on-surface font-bold">{when(ev.when)}</span>
      <span className="text-surface-tint">•</span>
      <span className="font-headline-sm text-body-md text-on-surface font-semibold">{ev.label}</span>
      </div>
      {ev.actor && ev.actor !== '—' ? (
      <div className="mt-1 font-body-sm text-body-sm text-on-surface-variant">By <strong className="text-on-surface">{ev.actor}</strong></div>
      ) : null}
      {ev.body && ev.body !== ev.label ? (
      <p className="mt-space-sm font-body-sm text-body-sm text-on-surface leading-relaxed bg-surface-container-lowest/80 p-space-sm rounded-lg">{ev.body}</p>
      ) : null}
      </div>
      </div>
      ))
      )}
      </div>
      </div>

      {!readOnly ? (
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-space-md">
      <input type="text" className="flex-1 bg-surface-container-low rounded-lg px-space-md py-2 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant" placeholder="Add a note (inspection, cable check…)" value={form.incidentNote} onChange={(e) => form.setIncidentNote(e.target.value)} aria-label="Note"/>
      <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-60" disabled={!form.incidentNote.trim()} onClick={() => void form.addIncidentNote().catch(() => undefined)}>
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">edit_note</span>
      <span>Add note</span>
      </button>
      </div>
      ) : null}
      </div>

      <div className="lg:col-span-4 space-y-space-lg">
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm space-y-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
      <span aria-hidden="true" className="material-symbols-outlined text-primary text-xl">folder_open</span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Documents</h3>
      </div>
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">{form.documents.length}</span>
      </div>
      <div className="space-y-space-xs">
      {form.documents.length === 0 ? (
      <div className="font-body-sm text-body-sm text-on-surface-variant py-space-sm">No documents yet.</div>
      ) : (
      form.documents.map((doc) => {
        const docId = form.strField(doc, 'id', form.strField(doc, 'name', 'doc'));
        const docTitle = form.strField(doc, 'name', form.strField(doc, 'title', 'Document'));
        const hasUrl = Boolean(form.strField(doc, 'signed_url', form.strField(doc, 'url', '')));
        return (
      <div key={docId} className="flex items-center justify-between p-space-sm bg-surface-container-low rounded-lg">
      <div className="font-body-md text-body-md text-on-surface font-bold truncate">{docTitle}</div>
      {hasUrl ? (
      <div className="flex items-center gap-1 shrink-0">
      <button type="button" className="w-8 h-8 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center" title="View" aria-label="View document" onClick={() => form.openDocument(doc)}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">visibility</span>
      </button>
      <button type="button" className="w-8 h-8 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center" title="Download" aria-label="Download document" onClick={() => form.downloadDocument(doc)}>
      <span aria-hidden="true" className="material-symbols-outlined text-[18px]">download</span>
      </button>
      </div>
      ) : null}
      </div>
        );
      })
      )}
      </div>
      </div>

      <div className="p-space-md rounded-xl bg-surface-container-lowest shadow-sm flex items-center justify-between">
      <div className="flex items-center gap-space-sm min-w-0">
      <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
      <span aria-hidden="true" className="material-symbols-outlined text-primary text-xl">{plate ? 'directions_car' : 'warehouse'}</span>
      </div>
      <div className="min-w-0">
      <div className="font-caption text-caption uppercase text-on-surface-variant font-semibold">{plate ? 'Car' : 'Location'}</div>
      <div className="font-body-md text-body-md font-bold text-on-surface truncate">{plate || locationName}</div>
      </div>
      </div>
      {vehicleId ? (
      <button type="button" onClick={() => goToFleetPath(vehiclePath(vehicleId))} className="px-space-sm py-1.5 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container font-body-sm text-body-sm font-semibold transition-colors flex items-center gap-1 shadow-sm shrink-0">
      <span>View Car</span>
      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
      </button>
      ) : null}
      </div>
      </div>
      </div>
      </div></div></div>
    </div>
  );
}
