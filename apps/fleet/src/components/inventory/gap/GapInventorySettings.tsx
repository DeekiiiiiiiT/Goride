/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapInventorySettingsForm } from './useGapInventorySettingsForm';
import { useInventoryShell } from '../InventoryShellContext';
import { formatJmd } from '../inventoryFormat';

export function GapInventorySettings(p: { onClose?: () => void }) {
  const shell = useInventoryShell();
  const form = useGapInventorySettingsForm(p.onClose);
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="InventorySettings">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="max-w-[1440px] w-full mx-auto px-margin-desktop py-space-xl">

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md mb-space-xl">
        <div className="flex flex-col gap-space-xs">
        <a className="inline-flex items-center gap-space-xs text-on-surface-variant hover:text-primary transition-colors font-body-sm text-body-sm group" href="#">
        <span className="material-symbols-outlined text-[16px] transition-transform group-hover:-translate-x-0.5">arrow_back</span>
        <span>Back to Inventory</span>
        </a>
        <div className="flex items-center gap-space-md mt-space-xs">
        <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shadow-sm">
        <span className="material-symbols-outlined text-[22px]">settings</span>
        </div>
        <div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold">Inventory & Asset Management — Settings</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Depot policies, categories, and write-off defaults for Jamaica hubs.</p>
        </div>
        </div>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto">
        <div className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container text-on-surface-variant font-label-code text-caption">
        <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
        <span>{form.categoryCount} categories</span>
        </div>
        <button className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm" type="button" onClick={() => shell.openGap('import-items')}>
        <span className="material-symbols-outlined text-[16px]">history</span>
        <span>Audit Log</span>
        </button>
        </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">

        <aside className="lg:col-span-3 flex flex-col gap-space-sm sticky top-36">
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-1">
        <div className="px-space-sm py-1 mb-space-xs">
        <span className="font-caption text-caption text-secondary uppercase font-semibold tracking-wider">Configuration Tree</span>
        </div>

        <button className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg bg-primary text-on-primary transition-all text-left font-body-sm text-body-sm font-semibold group" type="button" onClick={() => form.setSettingsSection('general')}>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">tune</span>
        <span className="truncate">General</span>
        </div>
        <span className="material-symbols-outlined text-[16px] text-surface-dim opacity-75">chevron_right</span>
        </button>

        <button
          type="button"
          className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group"
          onClick={() => shell.openGap('locations-bins')}
        >
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">warehouse</span>
        <span className="truncate">Locations & Bins</span>
        </div>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-semibold">Open ↗</span>
        </button>

        <button className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" type="button" onClick={() => form.setSettingsSection('categories')}>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">category</span>
        <span className="truncate">Item Categories</span>
        </div>
        <span className="font-label-code text-caption text-secondary">{form.categoryCount} root</span>
        </button>

        <a className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" href="#">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">notifications_active</span>
        <span className="truncate">Alerts & Escalations</span>
        </div>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-semibold">Screen 11 ↗</span>
        </a>

        <a className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" href="#">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">account_balance_wallet</span>
        <span className="truncate">Opening Balances</span>
        </div>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-semibold">Screen 1 ↗</span>
        </a>

        <button className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" type="button" onClick={() => form.setSettingsSection('scrap')}>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
        <span className="truncate">Write-off & Scrap Notes</span>
        </div>
        <span className="material-symbols-outlined text-[16px] text-secondary opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
        </button>
        </div>

        <div className="bg-surface-container rounded-xl p-space-md flex flex-col gap-space-xs text-on-surface">
        <div className="flex items-center gap-space-xs text-primary">
        <span className="material-symbols-outlined text-[18px]">shield</span>
        <span className="font-caption text-caption uppercase font-bold tracking-wider">Regulatory Compliance</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant"></p>
        <div className="mt-space-xs pt-space-xs flex items-center justify-between font-label-code text-caption text-secondary">
        <span>Audit: PASS</span>
        <span>Ref: JM-INV-2025</span>
        </div>
        </div>
        </aside>

        <main className="lg:col-span-9 flex flex-col gap-space-xl">

        <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-caption text-caption text-secondary uppercase font-bold tracking-wider">Module 01</span>
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        <span className="font-caption text-caption text-on-surface-variant">Operational Base</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">General Dispatch & Operations</h2>
        </div>
        <span className="font-label-code text-caption px-2 py-1 rounded bg-surface-container text-on-surface-variant">ENV: PRODUCTION</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg pt-space-xs">

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface" htmlFor="fleet-phone">
                        Fleet support emergency phone for drivers
                      </label>
        <div className="relative flex items-center">
        <span className="absolute left-3 material-symbols-outlined text-[18px] text-secondary">call</span>
        <input className="w-full pl-10 pr-space-md py-2 rounded-lg bg-surface font-label-code text-label-code text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all" id="fleet-phone" type="text" value={form.fleetPhone} onChange={(e) => form.setFleetPhone(e.target.value)}/>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Displayed on mobile driver kit check screen for rapid depot dispatch.
                      </p>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface" htmlFor="fiscal-year">
                        Fiscal year starting month
                      </label>
        <div className="relative flex items-center">
        <span className="absolute left-3 material-symbols-outlined text-[18px] text-secondary">calendar_today</span>
        <select className="w-full pl-10 pr-10 py-2 rounded-lg bg-surface font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary appearance-none cursor-pointer" id="fiscal-year" value={form.fiscalYear} onChange={(e) => { form.setFiscalYear(e.target.value); void form.saveFiscalYear(); }}>
        <option value="1">January</option>
        <option value="4">April (UK/Carib Standard)</option>
        <option value="7">July</option>
        <option value="10">October</option>
        </select>
        <span className="absolute right-3 material-symbols-outlined text-[18px] text-secondary pointer-events-none">expand_more</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Defines inventory carryover accounting reconciliation periods for JMD books.
                      </p>
        </div>

        <div className="flex flex-col gap-space-xs md:col-span-2">
        <div className="flex items-center justify-between">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface" htmlFor="safety-prompt">
                          Driver safety notice prompt
                        </label>
        <span className="font-caption text-caption text-secondary">Markdown supported</span>
        </div>
        <textarea className="w-full p-space-md rounded-lg bg-surface font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all resize-none leading-relaxed" id="safety-prompt" rows={3} value={form.safetyNotice} onChange={(e) => form.setSafetyNotice(e.target.value)} />
        <div className="flex items-center gap-space-xs mt-1 text-on-surface-variant font-caption text-caption">
        <span className="material-symbols-outlined text-[14px]">info</span>
        <span>Mandatory gate sign-off requirement presented during morning handheld scan-out.</span>
        </div>
        </div>
        </div>

        <div className="flex items-center justify-between pt-space-md mt-space-xs bg-surface-container-low p-space-md rounded-lg">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
        <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
        <span id="general-save-status">Saved 08:20 AM</span>
        </div>
        <button type="button" disabled={!form.canSaveGeneral || form.submit.saving} className="px-space-lg py-2 rounded-lg bg-primary hover:bg-inverse-surface active:scale-[0.98] transition-all text-on-primary font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-space-xs" onClick={() => void form.saveGeneral()}>
        <span className="material-symbols-outlined text-[16px]">{form.submit.saving ? 'progress_activity' : 'save'}</span>
        <span>{form.submit.saving ? 'Saving…' : 'Save General'}</span>
        </button>
        </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-caption text-caption text-secondary uppercase font-bold tracking-wider">Module 02</span>
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        <span className="font-caption text-caption text-on-surface-variant">Taxonomy Tree</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Item Categories & Asset Classification</h2>
        </div>
        <div className="flex items-center gap-space-sm">
        <input className="px-space-md py-1.5 rounded-lg bg-surface-container-low text-on-surface font-body-sm text-body-sm" placeholder="New category name" value={form.newCategoryName} onChange={(e) => form.setNewCategoryName(e.target.value)} />
        <button className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs disabled:opacity-60" type="button" disabled={!form.newCategoryName.trim() || form.submit.saving} onClick={() => void form.createCategory()}>
        <span className="material-symbols-outlined text-[16px]">add</span>
        <span>+ Add category</span>
        </button>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        {form.categories.length === 0 ? (
        <div className="p-space-md rounded-lg bg-surface font-body-sm text-body-sm text-on-surface-variant">No categories yet.</div>
        ) : form.categories.map((cat) => {
          const id = String(cat.id ?? cat.name ?? '');
          const active = cat.archived !== true && cat.is_active !== false;
          const itemCount = Number(cat.item_count ?? cat.items_count ?? 0);
          return (
        <div key={id} className="flex items-center justify-between p-space-md rounded-lg bg-surface hover:bg-surface-container transition-colors group">
        <div className="flex items-center gap-space-md min-w-0">
        <button className="cursor-grab active:cursor-grabbing text-secondary hover:text-primary transition-colors flex items-center" title="Drag to reorder" type="button" onClick={() => void form.moveCategory(id, 'up')}>
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>
        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
        <span className="material-symbols-outlined text-[18px]">category</span>
        </div>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{String(cat.name ?? '—')}</span>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-secondary">{itemCount} items</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <span className="font-caption text-caption text-on-surface-variant">{active ? 'Active' : 'Archived'}</span>
        <div className="h-4 w-px bg-surface-variant"></div>
        <button className="text-on-surface-variant hover:text-primary transition-colors font-body-sm text-body-sm" title="Archive category" type="button" onClick={() => void form.toggleCategory(id, active)}>
                          Archive
                        </button>
        </div>
        </div>
          );
        })}
        </div>

        <div className="flex items-center justify-between pt-space-xs text-on-surface-variant font-caption text-caption">
        <span>Reordering category tree automatically syncs POS hand terminal catalog hierarchy.</span>
        <span className="font-label-code">Synced: 4/4 nodes</span>
        </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">

        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[18px]">location_on</span>
        </div>
        <span className="font-label-code text-caption text-secondary">SCREEN 14</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight mt-space-xs">Locations & Bins</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Manage storage depots and bins across your fleet locations.
                      </p>
        </div>
        <div className="pt-space-xs">
        <a className="inline-flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-primary hover:underline" href="#">
        <span>Open Locations</span>
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </a>
        </div>
        </div>

        <div className="md:col-span-2 bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-caption text-caption text-secondary uppercase font-bold tracking-wider">Module 04</span>
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        <span className="font-caption text-caption text-on-surface-variant">Decommission Policy</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Default Scrap & Write-off Note</h3>
        </div>
        <span className="font-label-code text-caption text-secondary">AUTO-INJECT ON DECOMMISSION</span>
        </div>
        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface" htmlFor="default-scrap-note">
                        Standard Decommission & Disposal Boilerplate
                      </label>
        <textarea className="w-full p-space-md rounded-lg bg-surface font-label-code text-label-code text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all resize-none leading-relaxed" id="default-scrap-note" rows={3} value={form.scrapNote} onChange={(e) => form.setScrapNote(e.target.value)} />
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Pre-populated into the audit trail certificate when a lead technician flags an asset as decommissioned or scrap tier 5.
                      </p>
        </div>
        <div className="flex items-center justify-between pt-space-xs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
        <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
        <span>Mandatory regulatory phrase lock enabled</span>
        </div>
        <button type="button" disabled={!form.canSaveScrapNote || form.submit.saving} onClick={() => void form.saveScrapNote()} className="px-space-md py-1.5 rounded-lg bg-primary hover:bg-inverse-surface transition-colors text-on-primary font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-space-xs disabled:opacity-60">
        <span>{form.submit.saving ? 'Saving…' : 'Save Template'}</span>
        </button>
        </div>
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
