/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapSnoozeSettingsForm } from './useGapSnoozeSettingsForm';
import { useGapAlertSnoozePopover } from './useGapAlertSnoozePopover';
import { useInventoryShell } from '../InventoryShellContext';

export function GapSnoozeSettings(p: { alertId?: string | null; onClose?: () => void }) {
  const shell = useInventoryShell();
  const form = useGapSnoozeSettingsForm(p.onClose);
  const popover = useGapAlertSnoozePopover(p.alertId, p.onClose);
  const hubLabel = shell.overview?.hub_code ? String(shell.overview.hub_code) : '—';
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="SnoozeSettings">
      <GapSubmitError message={form.submit.error ?? popover.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
        <span className="hover:text-on-surface cursor-pointer">Hub Configuration</span>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="hover:text-on-surface cursor-pointer">Telemetry & Notifications</span>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface font-semibold">Alerts & Escalation Governance</span>
        </div>
        <div className="flex items-center gap-space-sm bg-surface-container px-space-md py-1 rounded">
        <span className="w-2 h-2 rounded-full bg-primary"></span>
        <span className="font-label-code text-label-code text-on-surface">Ruleset Version: 2026.Q4-Rev9</span>
        <span className="text-outline-variant">•</span>
        <span className="font-label-code text-caption text-on-surface-variant">Active across {hubLabel}</span>
        </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter-desktop items-start">

        <div className="col-span-12 xl:col-span-4 flex flex-col gap-space-lg">

        <div className="bg-surface-container-lowest rounded-lg p-space-md shadow-sm">
        <div className="flex items-center justify-between pb-space-xs">
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider font-semibold">Triggered Alert In-Flight</span>
        <span className="font-label-code text-caption text-on-error bg-error-container/40 px-1.5 py-0.5 rounded font-bold">CRITICAL DEFICIT</span>
        </div>
        <div className="flex items-start gap-space-sm pt-space-xs">
        <span className="material-symbols-outlined text-[20px] text-error">warning</span>
        <div className="flex-1 min-w-0">
        <p className="font-body-md text-body-md text-on-surface font-semibold truncate">Low stock: Tyre pump at Main store</p>
        <p className="font-label-code text-body-sm text-on-surface-variant">1 on hand · Reorder threshold: 2 units</p>
        </div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden">

        <div className="bg-surface-container-low px-space-lg py-space-md flex items-center justify-between">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[18px] text-primary">snooze</span>
        <span className="font-headline-sm text-[15px] text-on-surface font-semibold">Snooze alert · Tyre pump</span>
        </div>
        <button type="button" aria-label="Close snooze popover" className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-variant transition-colors" onClick={() => p.onClose?.()}>
        <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
        </div>
        <div className="p-space-lg flex flex-col gap-space-lg">

        <div className="flex flex-col gap-space-xs">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Snooze Interval</label>
        <div className="flex flex-col gap-1.5" id="duration-group">

        <label className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
        <div className="flex items-center gap-space-sm">
        <input checked={popover.duration === '1d'} onChange={() => popover.setDuration('1d')} className="accent-primary w-4 h-4 cursor-pointer" name="snooze_duration" type="radio" value="1d"/>
        <span className="font-body-md text-body-md text-on-surface font-medium">1 day</span>
        </div>
        <span className="font-label-code text-caption text-on-surface-variant">Tomorrow 08:00 AM</span>
        </label>

        <label className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-lowest shadow-sm cursor-pointer">
        <div className="flex items-center gap-space-sm">
        <input checked={popover.duration === '3d'} onChange={() => popover.setDuration('3d')} className="accent-primary w-4 h-4 cursor-pointer" name="snooze_duration" type="radio" value="3d"/>
        <span className="font-body-md text-body-md text-primary font-semibold">3 days</span>
        </div>
        <span className="font-label-code text-caption text-primary font-semibold">Until 4 Nov · 08:00 AM</span>
        </label>

        <label className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
        <div className="flex items-center gap-space-sm">
        <input checked={popover.duration === '7d'} onChange={() => popover.setDuration('7d')} className="accent-primary w-4 h-4 cursor-pointer" name="snooze_duration" type="radio" value="7d"/>
        <span className="font-body-md text-body-md text-on-surface font-medium">1 week</span>
        </div>
        <span className="font-label-code text-caption text-on-surface-variant">Until 8 Nov 2026</span>
        </label>

        <label className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors">
        <div className="flex items-center gap-space-sm">
        <input checked={popover.duration === 'custom'} onChange={() => popover.setDuration('custom')} className="accent-primary w-4 h-4 cursor-pointer" name="snooze_duration" type="radio" value="custom"/>
        <span className="font-body-md text-body-md text-on-surface font-medium">Until a date…</span>
        </div>
        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">calendar_today</span>
        </label>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Assign Follow-Up To</label>
        <div className="relative">
        <select className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md rounded-lg py-2 pl-3 pr-8 appearance-none focus:outline-none focus:bg-surface-container cursor-pointer" value={popover.assignee} onChange={(e) => popover.setAssignee(e.target.value)}>
        <option value="">Unassigned (General Queue)</option>
        <option value="platform_owner">Platform owner</option>
        <option value="procurement">Procurement officer</option>
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-[18px]">unfold_more</span>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Audit Reason / Ticket Reference</label>
        <textarea className="w-full bg-surface-container-low text-on-surface placeholder:text-on-surface-variant/60 font-body-sm text-body-sm rounded-lg p-2.5 resize-none focus:outline-none focus:bg-surface-container" placeholder="e.g. Purchase order purchase order already placed with supplier" rows={3} value={popover.reason} onChange={(e) => popover.setReason(e.target.value)} />
        <span className="font-caption text-[10px] text-on-surface-variant">Logged in Hub Activity Ledger for safety audits.</span>
        </div>

        <div className="flex items-center justify-end gap-space-sm pt-space-xs">
        <button type="button" className="px-space-md py-1.5 rounded-lg text-on-surface font-body-md text-body-md font-medium hover:bg-surface-container transition-colors" onClick={() => p.onClose?.()}>
                        Cancel
                      </button>
        <button type="button" disabled={!popover.canSnooze || popover.submit.saving} onClick={() => void popover.snooze()} className="px-space-lg py-1.5 rounded-lg bg-primary text-on-primary font-body-md text-body-md font-medium shadow hover:opacity-90 active:scale-95 transition-all disabled:opacity-60">
                        {popover.submit.saving ? 'Snoozing…' : `Snooze for ${popover.durationLabel}`}
                      </button>
        </div>
        </div>

        <div className="bg-surface-container px-space-lg py-space-sm flex items-center justify-between text-on-surface-variant font-caption text-caption">
        <span>Escalates automatically if not fulfilled</span>
        <span className="font-label-code text-on-surface font-semibold">Tier 2 SLA</span>
        </div>
        </div>

        <div className="bg-surface-container-low rounded-lg p-space-md flex gap-space-sm">
        <span className="material-symbols-outlined text-[18px] text-primary">info</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                    Snoozed notifications continue to log metric readings. When the interval lapses, alerts re-trigger directly to the assigned officer's mobile terminal.
                  </p>
        </div>
        </div>

        <div className="col-span-12 xl:col-span-8 flex flex-col gap-space-lg">

        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-1">
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-bold">Alerts & Escalations Configuration</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">Control alert thresholds, default snoozes, and escalation rules. Safety-critical items cannot be muted.</p>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
        <span className="font-label-code text-caption text-on-surface-variant">Saved 08:20 AM</span>
        <button type="button" disabled={!form.canSave || form.submit.saving} onClick={() => void form.save()} className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-md text-body-md font-semibold shadow hover:opacity-90 active:scale-95 transition-all flex items-center gap-space-xs disabled:opacity-60">
        <span className="material-symbols-outlined text-[16px]">check</span>
        <span>{form.submit.saving ? 'Saving…' : 'Save alert rules'}</span>
        </button>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
        <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col gap-1">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Mute Permitted</span>
        <span className="font-label-plate text-headline-sm text-on-surface">{form.snoozeAllowedCount} of {form.ruleCount} Types</span>
        <span className="font-body-sm text-[12px] text-on-surface-variant">Configurable by Store Leads</span>
        </div>
        <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col gap-1">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Strict Locks</span>
        <span className="font-label-plate text-headline-sm text-error">{form.lockedCount} Rules Locked</span>
        <span className="font-body-sm text-[12px] text-on-surface-variant">Mandatory transport safety code</span>
        </div>
        <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col gap-1">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Escalation Timeout</span>
        <span className="font-label-plate text-headline-sm text-on-surface">24 Hours</span>
        <span className="font-body-sm text-[12px] text-on-surface-variant">Default jump to Platform Owner</span>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">

        <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-sm w-full sm:w-auto">
        <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-1.5 rounded-lg shadow-sm text-on-surface-variant w-full sm:w-64">
        <span className="material-symbols-outlined text-[16px]">filter_list</span>
        <input className="bg-transparent text-on-surface font-body-sm text-body-sm focus:outline-none w-full placeholder:text-on-surface-variant/60" placeholder="Filter alert rules..." type="text" value="" readOnly aria-label="Filter alert rules"/>
        </div>
        </div>
        <div className="flex items-center gap-space-xs self-end sm:self-auto font-label-code text-caption text-on-surface-variant">
        <span>Showing {form.ruleCount} of {form.ruleCount} rules</span>
        </div>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full text-left font-body-sm text-body-sm">
        <thead className="bg-surface-container text-on-surface-variant font-caption text-caption uppercase tracking-wider">
        <tr>
        <th className="py-space-md px-space-lg font-semibold">Alert Type</th>
        <th className="py-space-md px-space-md font-semibold">Target Scope</th>
        <th className="py-space-md px-space-md font-semibold">Default Snooze</th>
        <th className="py-space-md px-space-md font-semibold">Who is Notified</th>
        <th className="py-space-md px-space-lg font-semibold text-right">Can Be Snoozed</th>
        </tr>
        </thead>
        <tbody className="text-on-surface">
        {form.rules.length === 0 ? (
        <tr><td colSpan={5} className="py-space-lg px-space-lg text-center text-on-surface-variant">No alert rules loaded.</td></tr>
        ) : form.rules.map((rule) => {
          const alertType = String(rule.alert_type ?? '');
          const canSnooze = rule.can_snooze !== false;
          const days = Number(rule.default_snooze_days ?? 0);
          const roles = Array.isArray(rule.notify_roles) ? rule.notify_roles : [];
          return (
        <tr key={alertType} className="hover:bg-surface-container-low transition-colors bg-surface-container-lowest">
        <td className="py-space-md px-space-lg font-medium">
        <div className="flex items-center gap-space-sm">
        <span className={`w-2 h-2 rounded-full ${canSnooze ? 'bg-primary' : 'bg-error'}`}></span>
        <span className="font-semibold text-on-surface">{form.humanAlertType(alertType)}</span>
        </div>
        </td>
        <td className="py-space-md px-space-md text-on-surface-variant">{alertType}</td>
        <td className="py-space-md px-space-md">
        <input type="number" min={0} className="w-20 rounded bg-surface-container px-2 py-0.5 font-label-code text-label-code" value={days} onChange={(e) => form.patchRule(alertType, { default_snooze_days: Number(e.target.value) || 0 })} disabled={!canSnooze} />
        <span className="ml-1 font-caption text-caption text-on-surface-variant">days</span>
        </td>
        <td className="py-space-md px-space-md">
        <span className="font-label-code text-caption text-on-surface-variant">{roles.length ? roles.join(', ') : '—'}</span>
        </td>
        <td className="py-space-md px-space-lg text-right">
        <button type="button" aria-label="Toggle snooze" className={`relative inline-flex h-6 w-11 items-center rounded-full ${canSnooze ? 'bg-primary' : 'bg-surface-container-highest'}`} onClick={() => form.patchRule(alertType, { can_snooze: !canSnooze })}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest transition-transform ${canSnooze ? 'translate-x-6' : 'translate-x-1'}`}></span>
        </button>
        </td>
        </tr>
          );
        })}
</tbody>
        </table>
        </div>

        <div className="p-space-md bg-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-space-sm font-caption text-caption text-on-surface-variant">
        <div className="flex items-center gap-space-xs">
        <span className="material-symbols-outlined text-[15px] text-primary">verified_user</span>
        <span></span>
        </div>
        <div className="flex items-center gap-space-md">
        <button type="button" className="hover:text-on-surface transition-colors font-medium" onClick={() => p.onClose?.()}>Export Rule Audit Log</button>
        <button type="button" className="hover:text-on-surface transition-colors font-medium" onClick={() => p.onClose?.()}>Restore Defaults</button>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
