/** Ported from Stitch gap screen — panel only. Real settings only (IV-13, IV-14, IV-16). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapInventorySettingsForm } from './useGapInventorySettingsForm';
import { useInventoryShell } from '../InventoryShellContext';
import { useFleetTimezone, formatInFleetTz } from '../../../utils/timezoneDisplay';

const navBtn =
  'w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant bg-surface-container-low hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm';

export function GapInventorySettings(p: { onClose?: () => void }) {
  const shell = useInventoryShell();
  const timezone = useFleetTimezone();
  const form = useGapInventorySettingsForm(p.onClose);
  const readOnly = shell.readOnly;
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="Inventory settings">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-xl">
        <div className="flex flex-col gap-space-xs">
        <button type="button" onClick={() => p.onClose?.()} className="self-start inline-flex items-center gap-space-xs px-space-sm py-1 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_back</span>
        <span>Back</span>
        </button>
        <div className="flex items-center gap-space-md mt-space-xs">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shadow-sm">
        <span aria-hidden="true" className="material-symbols-outlined text-[22px]">settings</span>
        </div>
        <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Inventory settings</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">What drivers see, item categories, and links to the other setup screens.</p>
        </div>
        </div>
        </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

        <aside className="lg:col-span-3 flex flex-col gap-space-sm">
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-1">
        <button className={navBtn} type="button" onClick={() => shell.openGap('locations-bins')}>
        <span className="flex items-center gap-space-sm"><span aria-hidden="true" className="material-symbols-outlined text-[18px]">warehouse</span>Locations</span>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
        <button className={navBtn} type="button" onClick={() => shell.openGap('snooze-settings')}>
        <span className="flex items-center gap-space-sm"><span aria-hidden="true" className="material-symbols-outlined text-[18px]">notifications_active</span>Alerts &amp; Escalation</span>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
        <button className={navBtn} type="button" onClick={() => shell.openGap('opening-balances')}>
        <span className="flex items-center gap-space-sm"><span aria-hidden="true" className="material-symbols-outlined text-[18px]">account_balance_wallet</span>Opening Balances</span>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
        </div>
        </aside>

        <main className="lg:col-span-9 flex flex-col gap-space-xl">

        <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">What drivers see</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface" htmlFor="fleet-phone">Fleet support phone for drivers</label>
        <input className="w-full px-space-md py-2 rounded-lg bg-surface font-label-code text-label-code text-on-surface outline-none focus:ring-1 focus:ring-primary" id="fleet-phone" type="text" readOnly={readOnly} value={form.fleetPhone} onChange={(e) => form.setFleetPhone(e.target.value)}/>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Shown on the driver&apos;s kit check screen.</p>
        </div>
        <div className="flex flex-col gap-space-xs md:col-span-2">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface" htmlFor="safety-prompt">Driver safety notice</label>
        <textarea className="w-full p-space-md rounded-lg bg-surface font-body-md text-body-md text-on-surface outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed" id="safety-prompt" rows={3} readOnly={readOnly} value={form.safetyNotice} onChange={(e) => form.setSafetyNotice(e.target.value)} />
        </div>
        </div>
        <div className="flex items-center justify-between bg-surface-container-low p-space-md rounded-lg">
        <span className="font-label-code text-caption text-on-surface-variant" id="general-save-status">
        {form.updatedAt ? `Last saved ${formatInFleetTz(form.updatedAt, timezone, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not saved yet'}
        </span>
        {!readOnly ? (
        <button type="button" disabled={!form.canSaveGeneral} className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-space-xs disabled:opacity-60" onClick={() => void form.saveGeneral().catch(() => undefined)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{form.submit.saving ? 'progress_activity' : 'save'}</span>
        <span>{form.submit.saving ? 'Saving…' : 'Save'}</span>
        </button>
        ) : null}
        </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Item categories</h2>
        {!readOnly ? (
        <div className="flex items-center gap-space-sm">
        <input className="px-space-md py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm" placeholder="New category name" value={form.newCategoryName} onChange={(e) => form.setNewCategoryName(e.target.value)} aria-label="New category name" />
        <button className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs disabled:opacity-60" type="button" disabled={!form.newCategoryName.trim() || form.submit.saving} onClick={() => void form.createCategory().catch(() => undefined)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>
        <span>Add category</span>
        </button>
        </div>
        ) : null}
        </div>
        <div className="flex flex-col gap-space-xs">
        {form.categories.length === 0 ? (
        <div className="p-space-md rounded-lg bg-surface font-body-sm text-body-sm text-on-surface-variant">No categories yet.</div>
        ) : form.categories.map((cat) => {
          const id = String(cat.id ?? cat.name ?? '');
          const active = cat.archived !== true && cat.is_active !== false;
          return (
        <div key={id} className="flex items-center justify-between p-space-md rounded-lg bg-surface">
        <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{String(cat.name ?? '—')}</span>
        {!readOnly ? (
        <div className="flex items-center gap-space-sm">
        <button className="w-8 h-8 rounded bg-surface-container-low hover:bg-surface-container flex items-center justify-center" title="Move up" aria-label="Move up" type="button" onClick={() => void form.moveCategory(id, 'up').catch(() => undefined)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_upward</span>
        </button>
        <button className="w-8 h-8 rounded bg-surface-container-low hover:bg-surface-container flex items-center justify-center" title="Move down" aria-label="Move down" type="button" onClick={() => void form.moveCategory(id, 'down').catch(() => undefined)}>
        <span aria-hidden="true" className="material-symbols-outlined text-[18px]">arrow_downward</span>
        </button>
        <button className="px-space-sm py-1 rounded bg-error-container text-error font-body-sm text-body-sm font-semibold" type="button" onClick={() => void form.toggleCategory(id, active).catch(() => undefined)}>
        {active ? 'Archive' : 'Restore'}
        </button>
        </div>
        ) : null}
        </div>
          );
        })}
        </div>
        </section>
        </main>
        </div>
        </div>
        </div></div>
      </div>
      </GapLoadState>
    </GapModalShell>
  );
}
