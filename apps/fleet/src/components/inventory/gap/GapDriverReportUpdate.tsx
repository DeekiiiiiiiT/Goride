/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapDriverReportUpdate(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="DriverReportUpdate">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full relative">

        <div className="w-full filter blur-[1.5px] opacity-40 pointer-events-none select-none transition-all duration-300">
        <div className="flex flex-col gap-space-lg">

        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm font-label-code text-label-code text-on-surface-variant">
        <span>DEPOT_01</span>
        <span>/</span>
        <span>COMPLIANCE & SAFETY KITS</span>
        <span>/</span>
        <span className="text-on-surface font-semibold">ALERTS_QUEUE</span>
        </div>
        <div className="flex items-center gap-space-md">
        <span className="px-space-sm py-0.5 rounded bg-surface-container-high text-caption font-caption text-on-surface">14 Pending Audits</span>
        <span className="px-space-sm py-0.5 rounded bg-error-container text-caption font-caption text-on-error-container font-semibold">3 Critical Items</span>
        </div>
        </div>

        <div className="grid grid-cols-4 gap-space-md">
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Active Kit Discrepancies</div>
        <div className="font-headline-lg text-headline-lg text-on-surface">07 <span className="text-caption font-caption text-error font-semibold">▲ 2 today</span></div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Staged Emergency Kits</div>
        <div className="font-headline-lg text-headline-lg text-on-surface">42 <span className="text-caption font-caption text-on-surface-variant">/ 50 target</span></div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Avg Resolution Time</div>
        <div className="font-headline-lg text-headline-lg text-on-surface">3.8h <span className="text-caption font-caption text-on-surface-variant">Hub SLA: <6h</span></div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm">
        <div className="text-caption font-caption text-on-surface-variant uppercase tracking-wider mb-1">Driver Sign-off Rate</div>
        <div className="font-headline-lg text-headline-lg text-on-surface">98.2% <span className="text-caption font-caption text-on-surface-variant font-label-code">JMD COMPLIANT</span></div>
        </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="px-space-lg py-space-md bg-surface-container-low flex items-center justify-between">
        <div className="font-headline-sm text-headline-sm text-on-surface">Reported Safety & Onboard Items</div>
        <div className="flex items-center gap-space-sm font-label-code text-label-code text-on-surface-variant">
        <span>Filter: Non-Compliant</span>
        </div>
        </div>
        <table className="w-full text-left font-body-sm text-body-sm">
        <thead className="bg-surface-container-high/40 text-caption font-caption uppercase tracking-wider text-on-surface-variant">
        <tr>
        <th className="py-space-sm px-space-lg">Report ID</th>
        <th className="py-space-sm px-space-lg">Plate / Model</th>
        <th className="py-space-sm px-space-lg">Assigned Driver</th>
        <th className="py-space-sm px-space-lg">Reported Missing</th>
        <th className="py-space-sm px-space-lg">Status</th>
        <th className="py-space-sm px-space-lg text-right">Landed Cost</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container">
        <tr className="bg-surface-container-high/20">
        <td className="py-space-md px-space-lg font-label-code text-on-surface">R-0012</td>
        <td className="py-space-md px-space-lg"><span className="font-label-plate text-label-plate px-space-xs py-0.5 rounded bg-surface-container font-bold text-on-surface">5179KZ</span> · Toyota Roomy</td>
        <td className="py-space-md px-space-lg">Marlon Samuels</td>
        <td className="py-space-md px-space-lg font-semibold text-error">Warning Triangle (High-Vis Foldable)</td>
        <td className="py-space-md px-space-lg"><span className="px-2 py-0.5 rounded text-caption font-caption bg-surface-container-high text-on-surface font-semibold">Under Review</span></td>
        <td className="py-space-md px-space-lg text-right font-label-price text-label-price">J$ 2,100</td>
        </tr>
        <tr>
        <td className="py-space-md px-space-lg font-label-code text-on-surface">R-0011</td>
        <td className="py-space-md px-space-lg"><span className="font-label-plate text-label-plate px-space-xs py-0.5 rounded bg-surface-container font-bold text-on-surface">8841JR</span> · Nissan AD Wagon</td>
        <td className="py-space-md px-space-lg">Alwayne Gordon</td>
        <td className="py-space-md px-space-lg">Dry Powder Extinguisher 1.0kg</td>
        <td className="py-space-md px-space-lg"><span className="px-2 py-0.5 rounded text-caption font-caption bg-surface-container-high text-on-surface">Staged in Bin</span></td>
        <td className="py-space-md px-space-lg text-right font-label-price text-label-price">J$ 5,800</td>
        </tr>
        <tr>
        <td className="py-space-md px-space-lg font-label-code text-on-surface">R-0010</td>
        <td className="py-space-md px-space-lg"><span className="font-label-plate text-label-plate px-space-xs py-0.5 rounded bg-surface-container font-bold text-on-surface">3022LE</span> · Suzuki Carry</td>
        <td className="py-space-md px-space-lg">Kadeem Burke</td>
        <td className="py-space-md px-space-lg">First Aid Rapid Kit (MOHW Reg)</td>
        <td className="py-space-md px-space-lg"><span className="px-2 py-0.5 rounded text-caption font-caption bg-surface-container-high text-on-surface">Resolved</span></td>
        <td className="py-space-md px-space-lg text-right font-label-price text-label-price">J$ 3,450</td>
        </tr>
        </tbody>
        </table>
        </div>
        </div>
        </div>

        <div className="fixed inset-0 bg-primary/30 backdrop-blur-[2px] z-50 transition-opacity" id="drawer-backdrop"></div>

        <aside aria-labelledby="drawer-title" aria-modal="true" className="fixed top-0 right-0 bottom-0 w-full max-w-[580px] bg-surface-container-lowest z-50 flex flex-col shadow-2xl overflow-hidden" id="report-drawer" role="dialog">

        <div className="px-space-xl pt-space-lg pb-space-md bg-surface-container-lowest flex items-start justify-between">
        <div className="flex flex-col gap-1 min-w-0 pr-space-md">
        <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant uppercase tracking-wider">
        <span className="inline-block w-2 h-2 rounded-full bg-on-tertiary-container animate-pulse"></span>
        <span>Safety Telemetry Discrepancy</span>
        <span>·</span>
        <span>HUB KINGSTON #01</span>
        </div>
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight" id="drawer-title">Update reported item</h2>
        </div>
        <button type="button" aria-label="Close drawer" className="w-9 h-9 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors focus:outline-none" id="btn-close-drawer">
        <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
        </div>

        <div className="px-space-xl py-space-md bg-surface-container-low flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-space-xs">
        <span className="font-label-code text-label-code font-bold text-on-surface">Report R-0012</span>
        <span className="text-on-surface-variant font-caption text-caption">·</span>
        <span className="font-body-md text-body-md font-semibold text-on-surface">Warning triangle</span>
        <span className="text-on-surface-variant font-caption text-caption">·</span>
        <span className="px-1.5 py-0.5 rounded text-caption font-caption font-bold bg-error-container text-on-error-container uppercase tracking-wide">Missing</span>
        </div>
        <div className="font-label-code text-caption text-on-surface-variant">
                  1 Nov 2026, 08:20 AM
                </div>
        </div>

        <div className="flex items-center justify-between p-space-md rounded-lg bg-surface-container-lowest shadow-sm">
        <div className="flex items-center gap-space-md">
        <div className="flex flex-col">
        <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider">Vehicle Plate</span>
        <div className="flex items-center gap-space-xs mt-0.5">
        <span className="font-label-plate text-label-plate px-2 py-0.5 rounded bg-surface-container-high text-on-surface tracking-widest font-bold">5179KZ</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">Toyota Roomy 1.0L</span>
        </div>
        </div>
        </div>
        <div className="flex items-center gap-space-sm pl-space-md">
        <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center font-label-code text-caption font-bold text-on-surface">MS</div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface leading-tight">Marlon Samuels</span>
        <span className="font-caption text-caption text-on-surface-variant">Route Driver · Fleet A</span>
        </div>
        </div>
        </div>

        <div className="flex items-center justify-between pt-space-xs">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Report Lifecycle</span>
        <div className="flex items-center p-0.5 rounded-lg bg-surface-container">
        <div className="px-space-md py-1 rounded text-caption font-caption font-medium text-on-surface-variant">
                    Sent
                  </div>
        <div className="px-space-md py-1 rounded text-caption font-caption font-semibold bg-surface-container-lowest text-on-surface shadow-sm flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
        <span>Seen</span>
        <span className="text-[10px] text-emerald-700 font-label-code">09:15A</span>
        </div>
        <div className="px-space-md py-1 rounded text-caption font-caption font-medium text-on-surface-variant opacity-60">
                    Fixed
                  </div>
        </div>
        </div>
        </div>

        <div className="flex-1 overflow-y-auto px-space-xl py-space-lg flex flex-col gap-space-xl">

        <div className="flex flex-col gap-space-sm p-space-lg rounded-xl bg-surface-container-low shadow-sm">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-xs text-on-surface">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">quickreply</span>
        <span className="font-headline-sm text-body-lg font-semibold text-on-surface">Driver's Submission</span>
        </div>
        <span className="text-caption font-label-code text-on-surface-variant">Mobile Field Report</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface leading-relaxed bg-surface-container-lowest p-space-md rounded-lg">
                  "Triangle was damaged during roadside tire change on Spanish Town Road, reflector bracket snapped."
                </p>

        <div className="grid grid-cols-2 gap-space-md pt-space-xs">

        <div className="relative group rounded-lg overflow-hidden bg-surface-container-high h-28 flex flex-col justify-end p-space-sm shadow-sm cursor-pointer">
        <img className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" data-alt="Close up photograph of a cracked red plastic automotive emergency warning triangle with a broken black base bracket resting on asphalt in daylight, gritty texture, industrial fleet photo inspection quality" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCajZAU_sgT3q-KlATl8ijg0aB7UWqsuVPPWQs7CeHdJyd9YdBjwVyKCHsIfsQ5o2jNfRPOzPgmjOxuhfRtlS66Q1Epgji1G0VdC70aAFgsajNSspvapkIyMZj7sbcau-1UK81BtbHPjYG_QEkUczFweHC3YThN36q3KDLWvD9A8WJ77lIrfHCaxxs5YGjhHoVdIPIui2t3nnhrMKvxCndsHQn94g8k27hGg-1vM1E"/>
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent"></div>
        <div className="relative z-10 flex items-center justify-between text-on-primary">
        <span className="font-caption text-caption flex items-center gap-1 font-semibold">
        <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                        bracket_damage.jpg
                      </span>
        <span className="font-label-code text-[10px] opacity-80">1.8 MB</span>
        </div>
        </div>

        <div className="relative rounded-lg overflow-hidden h-28 p-space-sm flex flex-col justify-between shadow-sm" data-location="Spanish Town Road, Kingston 11, Jamaica" style="">
        <div className="absolute inset-0 bg-surface-container-high">

        <svg className="w-full h-full opacity-25" preserveaspectratio="none" viewbox="0 0 100 60">
        <path d="M0 20 H100 M0 40 H100 M20 0 V60 M60 0 V60 M80 0 V60" fill="none" stroke="currentColor" stroke-width="0.8"></path>
        <path d="M-10 45 Q 40 10 110 50" fill="none" stroke="currentColor" stroke-width="2.5"></path>
        <path d="M30 60 L75 0" fill="none" stroke="currentColor" stroke-width="1.8"></path>
        </svg>
        </div>
        <div className="relative z-10 flex items-center justify-between">
        <span className="px-1.5 py-0.5 rounded bg-surface-container-lowest/90 font-label-code text-[10px] text-on-surface font-semibold shadow-xs">
                        GPS FIX ±4m
                      </span>
        <span className="material-symbols-outlined text-error text-[18px] drop-shadow-sm">location_on</span>
        </div>
        <div className="relative z-10 bg-surface-container-lowest/95 backdrop-blur-xs p-1.5 rounded">
        <div className="font-caption text-caption font-semibold text-on-surface leading-tight truncate">Spanish Town Road, Kingston 11</div>
        <div className="font-label-code text-[10px] text-on-surface-variant truncate">GPS 17.9942, -76.8211</div>
        </div>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Activity & Exchange Log</span>
        <span className="font-label-code text-caption text-on-surface-variant">4 Events Recorded</span>
        </div>
        <div className="relative pl-6 flex flex-col gap-space-md before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container-high">

        <div className="relative flex flex-col">
        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-error ring-4 ring-surface-container-lowest"></span>
        <div className="flex items-baseline justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Driver (Marlon S.)</span>
        <span className="font-label-code text-caption text-on-surface-variant">1 Nov 08:20 AM</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Reported missing & hardware snapped during roadside deployment.</p>
        </div>

        <div className="relative flex flex-col">
        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-on-surface ring-4 ring-surface-container-lowest"></span>
        <div className="flex items-baseline justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Fleet Ops (Deeki T.)</span>
        <span className="font-label-code text-caption text-on-surface-variant">1 Nov 09:15 AM</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Reviewed photo documentation. Verified chassis compliance stock.</p>
        </div>

        <div className="relative flex flex-col">
        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-on-tertiary-container ring-4 ring-surface-container-lowest"></span>
        <div className="flex items-baseline justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Fleet Ops</span>
        <span className="font-label-code text-caption text-on-surface-variant">2 Nov 08:00 AM</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Replacement on the way · Dispatched replenishment requisition from Main Store.</p>
        </div>

        <div className="relative flex flex-col">
        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-error ring-4 ring-surface-container-lowest"></span>
        <div className="flex items-baseline justify-between">
        <span className="font-body-sm text-body-sm font-semibold text-on-surface">Driver</span>
        <span className="font-label-code text-caption text-on-surface-variant">2 Nov 10:45 AM</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Still missing · Flagged before afternoon depot route start.</p>
        </div>
        </div>
        </div>

        <div className="flex flex-col gap-space-sm pt-space-xs">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">
                  Status Presets & Quick Dispatch Tags
                </label>
        <div className="flex flex-wrap gap-space-sm" id="quick-choices-group">

        <button type="button" className="chip-toggle px-space-md py-1.5 rounded-full text-body-sm font-body-sm font-semibold transition-all bg-primary text-on-primary shadow-xs flex items-center gap-1.5" data-chip="replacement" type="button">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        <span>Replacement on the way</span>
        </button>

        <button type="button" className="chip-toggle px-space-md py-1.5 rounded-full text-body-sm font-body-sm transition-all bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1.5" data-chip="hub-pickup" type="button">
        <span className="material-symbols-outlined text-[16px]">warehouse</span>
        <span>Ready to collect at the hub</span>
        </button>

        <button type="button" className="chip-toggle px-space-md py-1.5 rounded-full text-body-sm font-body-sm transition-all bg-surface-container hover:bg-surface-container-high text-on-surface flex items-center gap-1.5" data-chip="urgent" type="button">
        <span className="material-symbols-outlined text-[16px] text-error">warning</span>
        <span>Urgent safety item</span>
        </button>
        </div>
        </div>

        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between">
        <label className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant flex items-center gap-1" htmlFor="driver-message-input">
        <span className="material-symbols-outlined text-[15px]">send_to_mobile</span>
                    Message to the Driver
                  </label>
        <span className="font-label-code text-caption text-on-surface-variant">Markdown Supported</span>
        </div>
        <textarea className="w-full p-space-md rounded-lg bg-surface-container-lowest text-body-md font-body-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary shadow-sm resize-none" id="driver-message-input" rows="3">New triangle is staged at Kingston Main Store (Bin A-05). Please collect before 4:00 PM dispatch shift.</textarea>
        <div className="flex items-center gap-1 text-caption font-caption text-on-surface-variant">
        <span className="material-symbols-outlined text-[14px] text-emerald-700">bolt</span>
        <span>Shown immediately in Marlon's driver mobile app & vehicle notification log.</span>
        </div>
        </div>

        <div className="p-space-lg rounded-xl bg-surface-container-low flex flex-col gap-space-md shadow-sm">
        <span className="font-caption text-caption uppercase tracking-wider font-semibold text-on-surface-variant">Resolution & Inventory Discharge</span>
        <div aria-label="Resolution triggers" className="flex flex-col gap-space-sm" role="radiogroup">

        <label className="flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-lowest cursor-pointer shadow-xs transition-colors hover:bg-surface-container-lowest/80">
        <input checked="" className="mt-1 text-primary focus:ring-primary accent-primary" name="resolution_type" type="radio" value="stock"/>
        <div className="flex flex-col flex-1">
        <div className="flex items-center justify-between">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Mark fixed — issue from stock</span>
        <span className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface font-semibold">SKU: SFT-TRG-01</span>
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                        Automatically triggers stock issue dialog: reserves item in Bin A-05 and links serial to vehicle <span className="font-label-plate text-caption font-bold">5179KZ</span>.
                      </p>
        </div>
        </label>

        <label className="flex items-start gap-space-md p-space-md rounded-lg bg-surface-container-lowest cursor-pointer shadow-xs transition-colors hover:bg-surface-container-lowest/80">
        <input className="mt-1 text-primary focus:ring-primary accent-primary" name="resolution_type" type="radio" value="nostock"/>
        <div className="flex flex-col flex-1">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Mark fixed — no stock used</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                        Driver recovered original item, resolved off-depot, or sourced externally without deducting depot reserve.
                      </p>
        </div>
        </label>
        </div>

        <div className="pt-space-xs flex items-start justify-between gap-space-md">
        <div className="flex flex-col">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Driver is responsible for the cost</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">If toggled, cost <span className="font-label-price text-caption font-bold text-on-surface">J$ 2,100.00</span> is routed to Driver Payroll Deduction.</span>
        </div>

        <button type="button" aria-checked="false" className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full bg-surface-container-highest transition-colors duration-200 ease-in-out focus:outline-none" id="cost-deduction-toggle" role="switch" type="button">
        <span className="sr-only">Toggle driver cost responsibility</span>
        <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow ring-0 transition duration-200 ease-in-out translate-x-0.5 mt-0.5" id="cost-toggle-thumb"></span>
        </button>
        </div>
        </div>
        </div>

        <div className="px-space-xl py-space-lg bg-surface-container-lowest flex items-center justify-between gap-space-md shadow-md">
        <div className="flex items-center gap-space-xs font-label-code text-caption text-on-surface-variant">
        <span className="material-symbols-outlined text-[16px]">sync</span>
        <span>Auto-sync enabled</span>
        </div>
        <div className="flex items-center gap-space-md">
        <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container hover:bg-surface-container-high font-body-sm text-body-sm font-semibold text-on-surface transition-colors" id="btn-close-action" type="button">
                  Close
                </button>
        <button type="button" className="px-space-xl py-2 rounded-lg bg-primary hover:bg-primary/90 text-on-primary font-body-sm text-body-sm font-semibold shadow-md flex items-center gap-space-xs transition-transform active:scale-95" id="btn-send-update" type="button">
        <span>Send update</span>
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
        </div>
        </div>
        </aside>


        </div></div><aside className="fixed left-0 top-28 bottom-0 w-64 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-40 flex flex-col justify-between py-space-lg"><div className="flex flex-col gap-space-xs px-space-md"><div className="px-space-md py-space-xs text-caption font-caption uppercase tracking-wider text-on-surface-variant font-semibold">Inventory & Asset Scope</div><nav className="flex flex-col gap-1" data-active-classes="bg-surface-container text-on-surface font-semibold"><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="inventory-catalog" href="#"><span className="material-symbols-outlined text-[20px]">category</span>Inventory Stock</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="parts-fitment-crossref" href="#"><span className="material-symbols-outlined text-[20px]">manufacturing</span>Fitment & Compatibility</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="work-orders-repairs" href="#"><span className="material-symbols-outlined text-[20px]">build</span>Work Orders</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="asset-depreciation-tracker" href="#"><span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>Asset Valuation</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="procurement-suppliers" href="#"><span className="material-symbols-outlined text-[20px]">storefront</span>Suppliers & POs</a><a className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg text-body-sm font-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors" data-path="telemetry-diagnostics" href="#"><span className="material-symbols-outlined text-[20px]">sensors</span>Diagnostic Logs</a></nav></div><div className="px-space-lg pt-space-md"><div className="p-space-md rounded-lg bg-surface-container-low shadow-[0_1px_8px_rgba(0,0,0,0.04)]"><div className="flex items-center justify-between text-caption font-caption text-on-surface-variant mb-1"><span>Active Depot Stock</span><span className="font-label-code text-label-code text-on-surface font-semibold">84.6%</span></div><div className="w-full h-1.5 rounded-full bg-surface-container-high overflow-hidden"><div className="h-full bg-primary rounded-full w-[84.6%]"></div></div><div className="mt-space-xs text-caption font-caption text-on-surface-variant">Warehouse A & Yard Kingston</div></div></div></aside>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
