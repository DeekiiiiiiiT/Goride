/** Ported from Stitch gap screen — drawer only, real report + timeline (IV-11, IV-14, IV-15). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapDriverReportUpdateForm } from './useGapDriverReportUpdateForm';
import { useInventoryShell } from '../InventoryShellContext';
import { useFleetTimezone, formatInFleetTz } from '../../../utils/timezoneDisplay';

const ISSUE_WORD: Record<string, string> = { missing: 'Missing', damaged: 'Broken', not_working: 'Not working' };
const KIND_WORD: Record<string, string> = {
  replacement_en_route: 'Replacement on the way',
  hub_collection_ready: 'Ready to collect at the hub',
  urgent_safety_item: 'Urgent safety item',
};

export function GapDriverReportUpdate(p: { reportId?: string | null; onClose?: () => void }) {
  const shell = useInventoryShell();
  const timezone = useFleetTimezone();
  const form = useGapDriverReportUpdateForm(p.reportId, p.onClose);
  const report = form.report;
  const when = (iso: unknown) =>
    iso ? formatInFleetTz(String(iso), timezone, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
  const reportRef = report ? String(report.report_no ?? String(report.id ?? '').slice(0, 8)) : '—';
  const itemLabel = report ? String(report.item_name ?? 'Kit item') : '—';
  const issue = report ? String(report.issue ?? 'missing') : 'missing';
  const plate = report ? String(report.license_plate ?? report.vehicle_id ?? '—') : '—';
  const status = report ? String(report.status ?? 'sent') : 'sent';
  const photos = Array.isArray(report?.photo_paths) ? (report!.photo_paths as unknown[]).map(String) : [];
  const hasGps = report?.gps_lat != null && report?.gps_lng != null;
  const steps: { key: string; label: string; at: unknown }[] = [
    { key: 'sent', label: 'Sent', at: report?.created_at },
    { key: 'seen', label: 'Seen', at: report?.seen_at },
    { key: 'fixed', label: 'Fixed', at: report?.fixed_at },
  ];
  const readOnly = shell.readOnly || form.isFixed;
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Driver report">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="fixed inset-0 bg-primary/30 backdrop-blur-[2px] z-50 transition-opacity" id="drawer-backdrop" onClick={p.onClose}></div>

        <aside aria-labelledby="drawer-title" aria-modal="true" className="fixed top-0 right-0 bottom-0 w-full max-w-[580px] bg-surface-container-lowest z-50 flex flex-col shadow-2xl overflow-hidden" id="report-drawer" role="dialog">

        <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest flex items-start justify-between">
        <div className="flex flex-col gap-1 min-w-0 pr-space-md">
        <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant uppercase tracking-wider">
        <span className="inline-block w-2 h-2 rounded-full bg-on-tertiary-container"></span>
        <span>Driver report</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight" id="drawer-title">Update reported item</h2>
        </div>
        <button type="button" onClick={p.onClose} aria-label="Close drawer" className="w-9 h-9 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors focus:outline-none" id="btn-close-drawer">
        <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        {!report ? (
        <div className="px-space-xl py-space-lg font-body-md text-on-surface-variant">This report could not be found.</div>
        ) : (
        <>
        <div className="px-space-xl py-space-md bg-surface-container-low flex flex-col gap-space-md">
        <div className="flex items-center justify-between gap-space-sm flex-wrap">
        <div className="flex items-baseline gap-space-xs flex-wrap">
        <span className="font-label-code text-label-code font-bold text-on-surface">Report {reportRef}</span>
        <span className="text-on-surface-variant font-caption text-caption">·</span>
        <span className="font-body-md text-body-md font-semibold text-on-surface">{itemLabel}</span>
        <span className="text-on-surface-variant font-caption text-caption">·</span>
        <span className="px-1.5 py-0.5 rounded text-caption font-caption font-bold bg-error-container text-on-error-container uppercase tracking-wide">{ISSUE_WORD[issue] ?? issue}</span>
        </div>
        <div className="font-label-code text-caption text-on-surface-variant">{when(report.created_at)}</div>
        </div>

        <div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col">
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Vehicle Plate</span>
        <span className="font-label-plate text-label-plate px-2 py-0.5 mt-0.5 rounded bg-surface-container-high text-on-surface tracking-widest font-bold self-start">{plate}</span>
        </div>
        </div>

        <div className="flex items-center justify-between pt-space-xs flex-wrap gap-space-sm">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Report Lifecycle</span>
        <div className="flex items-center p-0.5 rounded-lg bg-surface-container">
        {steps.map((s) => (
        <div key={s.key} className={`px-space-md py-1 rounded text-caption font-caption flex items-center gap-1.5 ${status === s.key ? 'font-semibold bg-surface-container-lowest text-on-surface shadow-sm' : s.at ? 'font-medium text-on-surface-variant' : 'font-medium text-on-surface-variant opacity-60'}`}>
        <span>{s.label}</span>
        {s.at ? <span className="text-[10px] font-label-code">{when(s.at)}</span> : null}
        </div>
        ))}
        </div>
        </div>
        </div>

        <div className="flex-1 overflow-y-auto px-space-xl py-space-lg flex flex-col gap-space-xl">

        <div className="flex flex-col gap-space-sm p-space-lg rounded-xl bg-surface-container-low shadow-sm">
        <div className="flex items-center gap-space-xs text-on-surface">
        <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-on-surface-variant">quickreply</span>
        <span className="font-headline-sm text-body-lg font-semibold text-on-surface">Driver&apos;s Submission</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface leading-relaxed bg-surface-container-lowest p-space-md rounded-lg">
                  {report.note ? String(report.note) : 'No note added.'}
                </p>
        {photos.length || hasGps ? (
        <div className="flex flex-wrap gap-space-sm font-caption text-caption text-on-surface-variant">
        {photos.length ? (
        <span className="inline-flex items-center gap-1 bg-surface-container-lowest px-2 py-1 rounded">
        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">photo_camera</span>
        {photos.length} photo{photos.length === 1 ? '' : 's'} attached
        </span>
        ) : null}
        {hasGps ? (
        <span className="inline-flex items-center gap-1 bg-surface-container-lowest px-2 py-1 rounded font-label-code">
        <span aria-hidden="true" className="material-symbols-outlined text-[14px]">location_on</span>
        GPS {Number(report.gps_lat).toFixed(4)}, {Number(report.gps_lng).toFixed(4)}
        </span>
        ) : null}
        </div>
        ) : null}
        </div>

        <div className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Activity log</span>
        <span className="font-label-code text-caption text-on-surface-variant">{form.updates.length + 1} event{form.updates.length === 0 ? '' : 's'}</span>
        </div>
        <div className="relative pl-6 flex flex-col gap-space-md before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container-high">
        <div className="relative flex flex-col">
        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-error ring-4 ring-surface-container-lowest"></span>
        <div className="flex items-baseline justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Driver</span>
        <span className="font-label-code text-caption text-on-surface-variant">{when(report.created_at)}</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Reported {itemLabel} {(ISSUE_WORD[issue] ?? issue).toLowerCase()}.</p>
        </div>
        {form.updates.map((u) => {
          const byFleet = String(u.by_role ?? '') === 'fleet';
          const kind = String(u.kind ?? '');
          return (
        <div key={String(u.id)} className="relative flex flex-col">
        <span className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ring-4 ring-surface-container-lowest ${byFleet ? 'bg-on-surface' : 'bg-error'}`}></span>
        <div className="flex items-baseline justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">{byFleet ? 'Fleet' : 'Driver'}</span>
        <span className="font-label-code text-caption text-on-surface-variant">{when(u.created_at)}</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{u.note ? String(u.note) : KIND_WORD[kind] ?? kind}</p>
        </div>
          );
        })}
        </div>
        </div>

        {!readOnly ? (
        <>
        <div className="flex flex-col gap-space-sm pt-space-xs">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Quick replies</label>
        <div className="flex flex-wrap gap-space-sm" id="quick-choices-group">
        <button type="button" onClick={() => void form.applyChip('replacement').catch(() => undefined)} disabled={form.submit.saving} className="px-space-md py-1.5 rounded-full text-body-sm font-body-sm font-semibold transition-all bg-primary text-on-primary shadow-xs flex items-center gap-1.5">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
        <span>Replacement on the way</span>
        </button>
        <button type="button" onClick={() => void form.applyChip('hub-pickup').catch(() => undefined)} disabled={form.submit.saving} className="px-space-md py-1.5 rounded-full text-body-sm font-body-sm transition-all bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1.5">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">warehouse</span>
        <span>Ready to collect at the hub</span>
        </button>
        <button type="button" onClick={() => void form.applyChip('urgent').catch(() => undefined)} disabled={form.submit.saving} className="px-space-md py-1.5 rounded-full text-body-sm font-body-sm transition-all bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1.5">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-error">warning</span>
        <span>Urgent safety item</span>
        </button>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant flex items-center gap-1" htmlFor="driver-message-input">
        <span aria-hidden="true" className="material-symbols-outlined text-[15px]">send_to_mobile</span>
                    Message to the Driver
                  </label>
        <textarea className="w-full p-space-md rounded-lg bg-surface-container-lowest text-body-md font-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm resize-none" id="driver-message-input" rows={3} value={form.driverMessage} onChange={(e) => form.setDriverMessage(e.target.value)} />
        <span className="font-caption text-caption text-on-surface-variant">Shown to the driver in the driver app.</span>
        </div>

        <div className="p-space-lg rounded-xl bg-surface-container-low flex flex-col gap-space-md shadow-sm">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">How was it fixed?</span>
        <div aria-label="Resolution" className="flex flex-col gap-space-sm" role="radiogroup">
        <label className="flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-lowest cursor-pointer shadow-xs">
        <input checked={form.resolutionType === 'stock'} onChange={() => form.setResolutionType('stock')} className="mt-1 accent-primary" name="resolution_type" type="radio" value="stock"/>
        <div className="flex flex-col flex-1">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Mark fixed — issue from stock</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Then opens the Issue dialog for <span className="font-label-plate text-caption font-bold">{plate}</span> with {itemLabel} ticked.</p>
        </div>
        </label>
        <label className="flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-lowest cursor-pointer shadow-xs">
        <input checked={form.resolutionType === 'nostock'} onChange={() => form.setResolutionType('nostock')} className="mt-1 accent-primary" name="resolution_type" type="radio" value="nostock"/>
        <div className="flex flex-col flex-1">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Mark fixed — no stock used</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">The driver found the item, or it was fixed without the store.</p>
        </div>
        </label>
        </div>
        <div className="pt-space-xs flex items-start justify-between gap-space-md">
        <div className="flex flex-col">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Driver is responsible</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">Recorded on this report.</span>
        </div>
        <button type="button" aria-checked={form.driverLiable} onClick={() => form.setDriverLiable(!form.driverLiable)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${form.driverLiable ? 'bg-primary' : 'bg-surface-container-highest'}`} id="cost-deduction-toggle" role="switch">
        <span className="sr-only">Toggle driver responsibility</span>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow ring-0 transition duration-200 ease-in-out mt-0.5 ${form.driverLiable ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
        </button>
        </div>
        </div>
        </>
        ) : null}
        </div>

        <div className="px-space-xl py-space-lg bg-surface-container-lowest flex items-center justify-end gap-space-md shadow-md">
        <button onClick={p.onClose} className="px-space-lg py-2 rounded-lg bg-error-container text-error hover:bg-error-container/80 font-body-sm text-body-sm font-semibold transition-colors" id="btn-close-action" type="button">
                  Close
                </button>
        {!readOnly ? (
        <button type="button" disabled={!form.canSend || form.submit.saving} onClick={() => void form.sendUpdate().catch(() => undefined)} className="px-space-xl py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-body-sm text-body-sm font-semibold shadow-md flex items-center gap-space-xs transition-transform active:scale-95 disabled:opacity-60" id="btn-send-update">
        <span>{form.submit.saving ? 'Sending…' : 'Send & mark fixed'}</span>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
        ) : null}
        </div>
        </>
        )}
        </aside>
        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
