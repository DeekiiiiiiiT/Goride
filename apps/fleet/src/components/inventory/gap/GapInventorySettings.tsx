/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapInventorySettings(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="InventorySettings">
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
        <p className="font-body-sm text-body-sm text-on-surface-variant">System policies, approval governance, fiscal definitions, and hardware telemetry parameters for Jamaica hubs.</p>
        </div>
        </div>
        </div>
        <div className="flex items-center gap-space-sm self-start md:self-auto">
        <div className="inline-flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container text-on-surface-variant font-label-code text-caption">
        <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
        <span>Hub Policy Config #JM-9021</span>
        </div>
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs shadow-sm" type="button">
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

        <button type="button" className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg bg-primary text-on-primary transition-all text-left font-body-sm text-body-sm font-semibold group" type="button">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">tune</span>
        <span className="truncate">General</span>
        </div>
        <span className="material-symbols-outlined text-[16px] text-surface-dim opacity-75">chevron_right</span>
        </button>

        <button type="button" className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" type="button">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">verified_user</span>
        <span className="truncate">Approvals & Governance</span>
        </div>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-medium">3 rules</span>
        </button>

        <a className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" href="#">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">warehouse</span>
        <span className="truncate">Locations & Bins</span>
        </div>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-semibold">Screen 14 ↗</span>
        </a>

        <button type="button" className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" type="button">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">category</span>
        <span className="truncate">Item Categories</span>
        </div>
        <span className="font-label-code text-caption text-secondary">4 root</span>
        </button>

        <a className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" href="#">
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
        <span className="truncate">Hardware Scanners</span>
        </div>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-primary font-semibold">Screen 8 ↗</span>
        </a>

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

        <button type="button" className="w-full flex items-center justify-between px-space-md py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-all text-left font-body-sm text-body-sm group" type="button">
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
        <input className="w-full pl-10 pr-space-md py-2 rounded-lg bg-surface font-label-code text-label-code text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all" id="fleet-phone" type="text" value="876-555-0100"/>
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
        <select className="w-full pl-10 pr-10 py-2 rounded-lg bg-surface font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary appearance-none cursor-pointer" id="fiscal-year">
        <option selected="">January</option>
        <option>April (UK/Carib Standard)</option>
        <option>July</option>
        <option>October</option>
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
        <textarea className="w-full p-space-md rounded-lg bg-surface font-body-md text-body-md text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all resize-none leading-relaxed" id="safety-prompt" rows="3">All safety gear (Spare tyre, Warning triangle, First-aid kit) must be verified prior to vehicle dispatch.</textarea>
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
        <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:bg-inverse-surface active:scale-[0.98] transition-all text-on-primary font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-space-xs" onclick="const el = document.getElementById('general-save-status'); el.textContent = 'Saved just now'; el.classList.add('text-primary');" type="button">
        <span className="material-symbols-outlined text-[16px]">save</span>
        <span>Save General</span>
        </button>
        </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-caption text-caption text-secondary uppercase font-bold tracking-wider">Module 02</span>
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        <span className="font-caption text-caption text-on-surface-variant">Financial Safeguards</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Approvals & Governance Limits</h2>
        </div>
        <span className="font-label-code text-caption px-2 py-1 rounded bg-secondary-container text-on-secondary-fixed font-medium">CURRENCY: JMD</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg pt-space-xs">

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between" htmlFor="approval-threshold">
        <span>Dual-approval threshold</span>
        <span className="font-caption text-caption text-secondary">Second person over limit</span>
        </label>
        <div className="relative flex items-center">
        <span className="absolute left-3 font-label-code text-caption font-bold text-on-surface-variant">J$</span>
        <input className="w-full pl-9 pr-space-md py-2 rounded-lg bg-surface font-label-price text-label-price text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all tabular-nums" id="approval-threshold" type="text" value="20,000.00"/>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Part purchase requisitions exceeding this amount require dispatch manager counter-signature.
                      </p>
        </div>

        <div className="flex flex-col gap-space-xs">
        <label className="font-body-sm text-body-sm font-semibold text-on-surface flex items-center justify-between" htmlFor="monthly-cap">
        <span>Monthly discretionary inventory cap</span>
        <span className="font-caption text-caption text-secondary">Depot aggregate</span>
        </label>
        <div className="relative flex items-center">
        <span className="absolute left-3 font-label-code text-caption font-bold text-on-surface-variant">J$</span>
        <input className="w-full pl-9 pr-space-md py-2 rounded-lg bg-surface font-label-price text-label-price text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all tabular-nums" id="monthly-cap" type="text" value="150,000.00"/>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Exceeding this requires CFO review and regional procurement board authorization.
                      </p>
        </div>

        <div className="md:col-span-2 p-space-md rounded-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
        <div className="flex items-start gap-space-md">
        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0 mt-0.5 sm:mt-0">
        <span className="material-symbols-outlined text-[18px]">gavel</span>
        </div>
        <div>
        <h4 className="font-body-md text-body-md font-semibold text-on-surface">Write-off Threshold Rule</h4>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Write-offs exceeding <span className="font-label-price text-body-sm font-bold text-on-surface">J$ 5,000.00</span> require secondary manager sign-off prior to stock ledger removal.</p>
        </div>
        </div>
        <div className="flex items-center gap-space-sm shrink-0">
        <span className="font-label-code text-caption text-on-surface bg-surface-container px-2 py-1 rounded">Rule #WO-5K-SEC</span>
        </div>
        </div>
        </div>

        <div className="flex items-center justify-between pt-space-md mt-space-xs bg-surface-container-low p-space-md rounded-lg">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
        <span className="material-symbols-outlined text-[16px] text-primary">check_circle</span>
        <span id="approvals-save-status">Saved 08:15 AM</span>
        </div>
        <button type="button" className="px-space-lg py-2 rounded-lg bg-primary hover:bg-inverse-surface active:scale-[0.98] transition-all text-on-primary font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-space-xs" onclick="const el = document.getElementById('approvals-save-status'); el.textContent = 'Saved just now'; el.classList.add('text-primary');" type="button">
        <span className="material-symbols-outlined text-[16px]">save</span>
        <span>Save Approvals</span>
        </button>
        </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-space-sm">
        <span className="font-caption text-caption text-secondary uppercase font-bold tracking-wider">Module 03</span>
        <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
        <span className="font-caption text-caption text-on-surface-variant">Taxonomy Tree</span>
        </div>
        <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight">Item Categories & Asset Classification</h2>
        </div>
        <div className="flex items-center gap-space-sm">
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-space-xs" type="button">
        <span className="material-symbols-outlined text-[16px]">add</span>
        <span>+ Add category</span>
        </button>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">

        <div className="flex items-center justify-between p-space-md rounded-lg bg-surface hover:bg-surface-container transition-colors group">
        <div className="flex items-center gap-space-md min-w-0">
        <button type="button" className="cursor-grab active:cursor-grabbing text-secondary hover:text-primary transition-colors flex items-center" title="Drag to reorder" type="button">
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>
        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
        <span className="material-symbols-outlined text-[18px]">emergency</span>
        </div>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Vehicle Safety</span>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-secondary">3 items</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <label className="flex items-center gap-space-xs cursor-pointer select-none">
        <input checked="" className="sr-only peer" type="checkbox"/>
        <div className="w-7 h-4 bg-surface-variant peer-checked:bg-primary rounded-full relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
        <span className="font-caption text-caption text-on-surface-variant">Active</span>
        </label>
        <div className="h-4 w-px bg-surface-variant"></div>
        <button type="button" className="text-on-surface-variant hover:text-primary transition-colors font-body-sm text-body-sm" title="Archive category" type="button">
                          Archive
                        </button>
        </div>
        </div>

        <div className="flex items-center justify-between p-space-md pl-12 rounded-lg bg-surface/60 hover:bg-surface-container transition-colors group">
        <div className="flex items-center gap-space-md min-w-0">
        <button type="button" className="cursor-grab active:cursor-grabbing text-secondary hover:text-primary transition-colors flex items-center" title="Drag to reorder" type="button">
        <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>
        <div className="w-2 h-2 rounded-full bg-secondary shrink-0"></div>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="font-body-sm text-body-sm text-on-surface font-medium truncate">Mandatory Incident Kits</span>
        <span className="font-label-code text-caption text-secondary">Sub-tier</span>
        </div>
        </div>
        <div className="flex items-center gap-space-sm">
        <span className="font-label-code text-caption text-secondary">SKU-SAF-01..03</span>
        </div>
        </div>

        <div className="flex items-center justify-between p-space-md rounded-lg bg-surface hover:bg-surface-container transition-colors group">
        <div className="flex items-center gap-space-md min-w-0">
        <button type="button" className="cursor-grab active:cursor-grabbing text-secondary hover:text-primary transition-colors flex items-center" title="Drag to reorder" type="button">
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>
        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
        <span className="material-symbols-outlined text-[18px]">airline_seat_recline_normal</span>
        </div>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="font-body-md text-body-md font-semibold text-on-surface truncate">In-Cabin Accessories</span>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-secondary">4 items</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <label className="flex items-center gap-space-xs cursor-pointer select-none">
        <input checked="" className="sr-only peer" type="checkbox"/>
        <div className="w-7 h-4 bg-surface-variant peer-checked:bg-primary rounded-full relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
        <span className="font-caption text-caption text-on-surface-variant">Active</span>
        </label>
        <div className="h-4 w-px bg-surface-variant"></div>
        <button type="button" className="text-on-surface-variant hover:text-primary transition-colors font-body-sm text-body-sm" title="Archive category" type="button">
                          Archive
                        </button>
        </div>
        </div>

        <div className="flex items-center justify-between p-space-md rounded-lg bg-surface hover:bg-surface-container transition-colors group">
        <div className="flex items-center gap-space-md min-w-0">
        <button type="button" className="cursor-grab active:cursor-grabbing text-secondary hover:text-primary transition-colors flex items-center" title="Drag to reorder" type="button">
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>
        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
        <span className="material-symbols-outlined text-[18px]">build</span>
        </div>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Mechanical Spares & Maintenance</span>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-secondary">8 items</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <label className="flex items-center gap-space-xs cursor-pointer select-none">
        <input checked="" className="sr-only peer" type="checkbox"/>
        <div className="w-7 h-4 bg-surface-variant peer-checked:bg-primary rounded-full relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
        <span className="font-caption text-caption text-on-surface-variant">Active</span>
        </label>
        <div className="h-4 w-px bg-surface-variant"></div>
        <button type="button" className="text-on-surface-variant hover:text-primary transition-colors font-body-sm text-body-sm" title="Archive category" type="button">
                          Archive
                        </button>
        </div>
        </div>

        <div className="flex items-center justify-between p-space-md rounded-lg bg-surface hover:bg-surface-container transition-colors group">
        <div className="flex items-center gap-space-md min-w-0">
        <button type="button" className="cursor-grab active:cursor-grabbing text-secondary hover:text-primary transition-colors flex items-center" title="Drag to reorder" type="button">
        <span className="material-symbols-outlined text-[18px]">drag_indicator</span>
        </button>
        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
        <span className="material-symbols-outlined text-[18px]">sensors</span>
        </div>
        <div className="flex items-center gap-space-sm min-w-0">
        <span className="font-body-md text-body-md font-semibold text-on-surface truncate">Telematics & Hardware</span>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-secondary">2 items</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md">
        <label className="flex items-center gap-space-xs cursor-pointer select-none">
        <input checked="" className="sr-only peer" type="checkbox"/>
        <div className="w-7 h-4 bg-surface-variant peer-checked:bg-primary rounded-full relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-on-primary after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
        <span className="font-caption text-caption text-on-surface-variant">Active</span>
        </label>
        <div className="h-4 w-px bg-surface-variant"></div>
        <button type="button" className="text-on-surface-variant hover:text-primary transition-colors font-body-sm text-body-sm" title="Archive category" type="button">
                          Archive
                        </button>
        </div>
        </div>
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
                        Manage 3 storage depots and 24 bins distributed across Kingston Central Hub, Spanish Town Staging Yard, and Montego Bay Outpost.
                      </p>
        </div>
        <div className="pt-space-xs">
        <a className="inline-flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-primary hover:underline" href="#">
        <span>Open Locations</span>
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </a>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col justify-between gap-space-md">
        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded bg-surface-container flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
        </div>
        <span className="font-label-code text-caption text-secondary">SCREEN 8</span>
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold tracking-tight mt-space-xs">Mobile Scanners</h3>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        3 paired terminals (1 phone, 2 laser scanners) actively polling Kingston Hub bay reception point.
                      </p>
        </div>
        <div className="pt-space-xs">
        <a className="inline-flex items-center gap-space-xs font-body-sm text-body-sm font-semibold text-primary hover:underline" href="#">
        <span>Pair scanner</span>
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
        <textarea className="w-full p-space-md rounded-lg bg-surface font-label-code text-label-code text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary transition-all resize-none leading-relaxed" id="default-scrap-note" rows="3">Device verified damaged beyond economical repair. Certified scrap.</textarea>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Pre-populated into the audit trail certificate when a lead technician flags an asset as decommissioned or scrap tier 5.
                      </p>
        </div>
        <div className="flex items-center justify-between pt-space-xs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-code text-caption">
        <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
        <span>Mandatory regulatory phrase lock enabled</span>
        </div>
        <button type="button" className="px-space-md py-1.5 rounded-lg bg-primary hover:bg-inverse-surface transition-colors text-on-primary font-body-sm text-body-sm font-medium shadow-sm flex items-center gap-space-xs" type="button">
        <span>Save Template</span>
        </button>
        </div>
        </div>
        </section>
        </main>
        </div>
        </div>
        </div></div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
