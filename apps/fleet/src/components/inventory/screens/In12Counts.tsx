/** Ported from Stitch — do not simplify layout (audit §0.4). */
import { useInventoryLive } from '../inventoryLive';
import { useInventoryShell } from '../InventoryShellContext';
import { firstAssetSerial, strField } from '../inventoryData';
export function In12Counts() {
  const shell = useInventoryShell();
  const live = useInventoryLive(shell);
  const sessions = live.countSessions;
  const assetSerial = firstAssetSerial(live.assets);
  return (
    <div className="fleet-inventory-stitch inventory-stitch-root">
      <div className="inventory-stitch-main"><div className="flex flex-col w-full">

      <div className="w-full bg-surface-container-lowest px-margin-desktop py-space-xl shadow-sm">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-space-lg">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-xs text-on-surface-variant font-caption text-caption uppercase tracking-wider mb-space-xs">
      <span>Fleet Warehouse</span>
      <span>/</span>
      <span>{live.hubName}</span>
      <span>/</span>
      <span className="text-on-surface font-semibold">Audit Ledger</span>
      </div>
      <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Inventory & Asset Management</h1>
      <p className="font-body-md text-body-md text-on-surface-variant mt-space-xs">What you have, where it is, and what every car is missing.</p>
      </div>
      <div className="flex items-center gap-space-sm bg-surface-container-low p-1 rounded-lg">
      <div className="px-space-md py-1.5 rounded text-on-surface-variant font-caption text-caption flex items-center gap-space-xs">
      <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
      <span>Hub Sync: <strong>Continuous</strong></span>
      </div>
      <div className="h-4 w-px bg-surface-dim"></div>
      <div className="px-space-md py-1.5 font-label-code text-caption text-on-surface">
      <span>Auditor: <strong>Deeki T</strong> (platform_owner)</span>
      </div>
      </div>
      </div>

      <div className="flex items-center gap-space-xs overflow-x-auto pt-space-xs">
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Overview</button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Stock</button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Vehicle kits</button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Assets</button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Movements</button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap">Purchasing</button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm bg-primary text-on-primary font-semibold shadow-sm whitespace-nowrap flex items-center gap-space-xs">
      <span>Counts</span>
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container animate-pulse"></span>
      </button>
      <button type="button" className="px-space-lg py-2 rounded-md font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors whitespace-nowrap flex items-center gap-space-xs">
      <span>Alerts</span>
      <span className="bg-error-container text-on-error-container font-label-code text-caption font-semibold px-1.5 py-0.2 rounded-full">5</span>
      </button>
      </div>
      </div>
      </div>

      <div className="w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl flex flex-col gap-space-xl">

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
      <div>
      <div className="flex items-center gap-space-sm">
      <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Inventory Counts & Physical Audits</h2>
      <span className="bg-surface-container-high px-2 py-0.5 rounded font-label-code text-caption text-on-surface-variant uppercase font-semibold">Strict Blind Protocol</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Blind cycle counts prevent bias. Expected storeroom quantities remain masked until submission.</p>
      </div>
      <div className="flex items-center gap-space-sm">
      <button type="button" className="px-space-lg py-2 bg-surface-container-lowest text-on-surface font-body-sm text-body-sm font-medium rounded-lg shadow-sm hover:bg-surface-container transition-colors flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px]">history</span>
      <span>Count history & logs</span>
      </button>
      <button type="button" onClick={() => shell.openModal('count-session')} className="px-space-lg py-2 bg-primary text-on-primary font-body-sm text-body-sm font-semibold rounded-lg shadow-sm hover:opacity-95 transition-all flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px]">add</span>
      <span>+ Start a count</span>
      </button>
      </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">

      <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-primary text-[20px]">assignment_turned_in</span>
      <span className="font-headline-sm text-headline-sm text-on-surface">Recent Count Batches</span>
      </div>
      <span className="font-label-code text-caption text-on-surface-variant">Q4 Periodic Ledger · {sessions.length} Recorded Sessions</span>
      </div>
      <div className="flex flex-col gap-space-sm">

      <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md transition-all shadow-sm">
      <div className="flex items-start gap-space-md min-w-0">
      <div className="w-2.5 h-10 rounded-full bg-on-tertiary-container shrink-0 mt-0.5"></div>
      <div className="min-w-0">
      <div className="flex items-center gap-space-sm flex-wrap">
      <span className="font-headline-sm text-body-lg font-semibold text-on-surface">Main store — Kingston</span>
      <span className="font-label-code text-caption px-2 py-0.5 bg-surface-container-highest rounded text-on-surface-variant">#{strField(sessions[0] ?? {}, 'code', '—')}</span>
      <span className="bg-surface-container-lowest text-on-tertiary-container font-label-code text-caption font-semibold px-2 py-0.5 rounded shadow-sm flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                          Submitted — 2 differences
                        </span>
      </div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-space-sm">
      <span>Conducted 1 Nov 2026 by Deeki T</span>
      <span>·</span>
      <span className="font-label-price text-on-error font-medium">Needs Approval (Valuation drift: −J$ 15,000.00)</span>
      </div>
      </div>
      </div>
      <div className="flex items-center gap-space-sm self-end md:self-center shrink-0">
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container-lowest px-2 py-1 rounded">Under Audit</span>
      <button type="button" className="px-space-md py-1.5 bg-primary text-on-primary font-body-sm text-caption font-semibold rounded shadow-sm hover:opacity-90">Open Sheet</button>
      </div>
      </div>

      <div className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md transition-all">
      <div className="flex items-start gap-space-md min-w-0">
      <div className="w-2.5 h-10 rounded-full bg-secondary shrink-0 mt-0.5"></div>
      <div className="min-w-0">
      <div className="flex items-center gap-space-sm flex-wrap">
      <span className="font-body-lg text-body-lg font-medium text-on-surface">Kingston Gate 2 Bay</span>
      <span className="font-label-code text-caption px-2 py-0.5 bg-surface-container rounded text-on-surface-variant">#{strField(sessions[1] ?? {}, 'code', '—')}</span>
      <span className="bg-surface-container text-on-surface font-label-code text-caption font-medium px-2 py-0.5 rounded flex items-center gap-1">
      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Reconciled — 0 differences
                        </span>
      </div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-space-sm">
      <span>Conducted 15 Oct 2026 by —</span>
      <span>·</span>
      <span className="font-label-price text-on-surface-variant">J$ 0.00 drift</span>
      </div>
      </div>
      </div>
      <div className="flex items-center gap-space-sm self-end md:self-center shrink-0">
      <span className="font-label-code text-caption text-on-surface-variant">Reconciled</span>
      <button type="button" className="px-space-md py-1.5 bg-surface-container-low text-on-surface font-body-sm text-caption rounded hover:bg-surface-container transition-colors">Audit Hash</button>
      </div>
      </div>

      <div className="bg-surface-container-lowest hover:bg-surface-container-low p-space-md rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md transition-all">
      <div className="flex items-start gap-space-md min-w-0">
      <div className="w-2.5 h-10 rounded-full bg-surface-dim shrink-0 mt-0.5"></div>
      <div className="min-w-0">
      <div className="flex items-center gap-space-sm flex-wrap">
      <span className="font-body-lg text-body-lg font-medium text-on-surface">Main store — Kingston</span>
      <span className="font-label-code text-caption px-2 py-0.5 bg-surface-container rounded text-on-surface-variant">#{strField(sessions[2] ?? {}, 'code', '—')}</span>
      <span className="bg-surface-container text-secondary font-label-code text-caption px-2 py-0.5 rounded">
                          Closed · Approved by Deeki T
                        </span>
      </div>
      <div className="font-body-sm text-body-sm text-on-surface-variant mt-1 flex items-center gap-space-sm">
      <span>Conducted 02 Sep 2026 by Auditor #04</span>
      <span>·</span>
      <span className="font-label-price text-on-surface-variant">Archived Q3</span>
      </div>
      </div>
      </div>
      <div className="flex items-center gap-space-sm self-end md:self-center shrink-0">
      <span className="font-label-code text-caption text-on-surface-variant">Settled</span>
      <button type="button" className="px-space-md py-1.5 bg-surface-container-low text-on-surface font-body-sm text-caption rounded hover:bg-surface-container transition-colors">View Record</button>
      </div>
      </div>
      </div>
      </div>

      <div className="lg:col-span-4 flex flex-col gap-space-md">
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between h-full">
      <div>
      <div className="flex items-center justify-between mb-space-sm">
      <span className="font-caption text-caption uppercase text-on-surface-variant tracking-wider font-semibold">Verification Accuracy</span>
      <span className="font-label-code text-caption text-on-surface bg-surface-container px-2 py-0.5 rounded">98.4% Match</span>
      </div>
      <div className="flex items-baseline gap-space-sm">
      <span className="font-headline-xl text-headline-xl text-on-surface">98.4%</span>
      <span className="font-caption text-caption text-on-surface-variant">across 124 stock references</span>
      </div>

      <div className="w-full mt-space-md pt-space-xs">
      <svg className="w-full h-8 text-primary overflow-visible" viewBox="0 0 320 40">
      <path d="M 0,32 Q 40,28 80,30 T 160,18 T 240,12 T 320,8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.5"></path>
      <circle cx="320" cy="8" fill="currentColor" r="4"></circle>
      </svg>
      <div className="flex justify-between items-center font-label-code text-caption text-on-surface-variant mt-1">
      <span>Aug 2026 (94.1%)</span>
      <span>Nov 2026 (98.4%)</span>
      </div>
      </div>
      </div>

      <div className="mt-space-md pt-space-md bg-surface-container-low rounded-lg p-space-md flex items-center gap-space-md">
      <img className="w-16 h-16 rounded-md object-cover shadow-sm shrink-0" data-alt="High-density industrial warehouse storeroom in Kingston Jamaica, organized metal shelving with barcoded auto parts, commercial LED lighting, crisp clean logistics atmosphere." src="https://lh3.googleusercontent.com/aida-public/AB6AXuArblssfq1DYsXnq_AM_ptvWaEqBTUvi7bGX4mPzW4LnBE0HdRBLMLZddB8wQ4nLFl5OqfPMK3L16dj1LUpi4UpvIyl64MT2OeOsWt6sxW3N4viv0r4NYr64n39I65YonzOYjt_Qjbc98KTGENEm4N4_ZJ3PpktMfOgeDACmLK3Cy-rFtLOiea8WzmM0oVYWQxbhaquVC2rx7oAxCXnimKbh9-iUo31vCYcRrfxyPc"/>
      <div className="min-w-0">
      <span className="font-body-sm text-body-sm font-semibold text-on-surface truncate block">Kingston Main Storeroom</span>
      <span className="font-caption text-caption text-on-surface-variant block mt-0.5">Bays A-D · 1,420 bin allocations</span>
      <span className="font-label-code text-caption text-primary mt-1 inline-flex items-center gap-1 font-medium">
      <span className="material-symbols-outlined text-[13px]">lock</span>
                      Blind masking enforced
                    </span>
      </div>
      </div>
      </div>
      </div>
      </div>

      <div className="bg-primary-container text-on-primary rounded-xl p-space-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-lg bg-surface-container-highest/20 flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-on-primary text-[22px]">visibility_off</span>
      </div>
      <div>
      <div className="flex items-center gap-space-sm flex-wrap">
      <span className="font-headline-sm text-headline-sm text-on-primary">Main store — Kingston // Bay A & B Storeroom</span>
      <span className="bg-surface-container-highest/30 text-surface-dim font-label-code text-caption px-2 py-0.5 rounded">Session #{strField(sessions[0] ?? {}, 'code', '—')}</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-primary-container mt-0.5">
                  Blind Count Mode: Expected quantities were hidden during the physical count to ensure impartial verification. Quantities revealed automatically upon floor supervisor submission.
                </p>
      </div>
      </div>
      <div className="flex items-center gap-space-md shrink-0">
      <div className="text-right hidden lg:block">
      <div className="font-caption text-caption text-on-primary-container">Audit Submission Time</div>
      <div className="font-label-code text-label-code text-on-primary">1 Nov 2026 · 14:32:08 EST</div>
      </div>
      <div className="h-8 w-px bg-surface-container-highest/20 hidden lg:block"></div>
      <span className="bg-tertiary-container text-on-tertiary-fixed font-label-code text-caption px-space-md py-1.5 rounded-md font-semibold flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[16px]">verified</span>
                Verified by Hash #9b3d
              </span>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
      <div className="p-space-lg bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
      <div>
      <span className="font-headline-sm text-headline-sm text-on-surface">Floor Verification Results (5 Items Audited)</span>
      <p className="font-caption text-caption text-on-surface-variant mt-0.5">Review captured counts, assign mandatory variance rationale, and forward to multi-sig approval ledger.</p>
      </div>
      <div className="flex items-center gap-space-sm">
      <div className="bg-surface-container-lowest px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-space-xs font-label-code text-caption">
      <span className="text-on-surface-variant">Total Lines:</span>
      <span className="font-bold text-on-surface">5</span>
      <span className="text-surface-dim">/</span>
      <span className="text-on-error font-bold">1 Deficit</span>
      <span className="text-surface-dim">/</span>
      <span className="text-secondary font-bold">1 Surplus</span>
      </div>
      </div>
      </div>

      <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse">
      <thead>
      <tr className="bg-surface-container text-on-surface-variant font-caption text-caption uppercase tracking-wider">
      <th className="py-space-md px-space-lg font-semibold">Item & SKU</th>
      <th className="py-space-md px-space-md font-semibold text-center">Expected (Post-Reveal)</th>
      <th className="py-space-md px-space-md font-semibold text-center">Physical Counted</th>
      <th className="py-space-md px-space-md font-semibold">Difference</th>
      <th className="py-space-md px-space-md font-semibold text-right">Unit Value</th>
      <th className="py-space-md px-space-md font-semibold text-right">Variance Value</th>
      <th className="py-space-md px-space-lg font-semibold">Reason (Mandatory for Diff)</th>
      <th className="py-space-md px-space-lg font-semibold text-right">Approval Status</th>
      </tr>
      </thead>
      <tbody className="divide-y divide-surface-container font-body-sm text-body-sm">

      <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">tire_repair</span>
      </div>
      <div>
      <div className="font-semibold text-on-surface">Spare tyre</div>
      <div className="font-label-code text-caption text-on-surface-variant">TYR-SPR-01 · 195/65 R15 Steel Rim</div>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code text-body-md text-on-surface">
      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface">1</span>
      <span className="block font-caption text-[10px] text-on-surface-variant line-through">••• masked</span>
      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="inline-flex items-center justify-center w-10 h-8 rounded font-label-code text-body-md font-bold bg-error-container text-on-error-container">
                        0
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <span className="font-label-code text-body-sm text-on-error font-semibold bg-error-container/40 px-2 py-0.5 rounded">
                        −1 Spare tyre
                      </span>
      </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface">
                      J$ 20,000.00
                    </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-error font-bold">
                      −J$ 20,000.00
                    </td>
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-on-error text-[16px]">warning</span>
      <select className="bg-surface-container-low text-on-surface font-body-sm text-caption px-space-sm py-1 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[220px]">
      <option>Lost / Missing from depot</option>
      <option>Damaged & Scrapped in bay</option>
      <option>Dispatched without invoice</option>
      <option>Mislabeled SKU</option>
      </select>
      </div>
      </td>
      <td className="py-space-md px-space-lg text-right">
      <span className="inline-flex items-center gap-1 font-caption text-caption px-2 py-1 rounded bg-tertiary-container text-on-tertiary-fixed font-semibold">
      <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container"></span>
                        Needs approval ({'>'}J$ 20k)
                      </span>
      </td>
      </tr>

      <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">stay_current_portrait</span>
      </div>
      <div>
      <div className="font-semibold text-on-surface">Phone Holder Mount</div>
      <div className="font-label-code text-caption text-on-surface-variant">ACC-PHM-01 · MagVent Universal Pro</div>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code text-body-md text-on-surface">
      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface">1</span>
      <span className="block font-caption text-[10px] text-on-surface-variant line-through">••• masked</span>
      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="inline-flex items-center justify-center w-10 h-8 rounded font-label-code text-body-md font-bold bg-secondary-container text-on-secondary-fixed">
                        2
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <span className="font-label-code text-body-sm text-secondary font-semibold bg-secondary-container/50 px-2 py-0.5 rounded">
                        +1 Phone holder
                      </span>
      </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface">
                      J$ 5,400.00
                    </td>
      <td className="py-space-md px-space-md text-right font-label-price text-secondary font-bold">
                      +J$ 5,400.00
                    </td>
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-secondary text-[16px]">info</span>
      <select className="bg-surface-container-low text-on-surface font-body-sm text-caption px-space-sm py-1 rounded shadow-sm focus:outline-none focus:ring-1 focus:ring-primary w-full max-w-[220px]">
      <option>Found / Unlogged return</option>
      <option>Over-delivery by supplier</option>
      <option>Recovered from loan fleet</option>
      </select>
      </div>
      </td>
      <td className="py-space-md px-space-lg text-right">
      <span className="inline-flex items-center gap-1 font-caption text-caption px-2 py-1 rounded bg-surface-container text-on-surface font-medium">
      <span className="material-symbols-outlined text-[14px]">done</span>
                        Pre-approved ({'<'}{'J$ 20k'})
                      </span>
      </td>
      </tr>

      <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">build</span>
      </div>
      <div>
      <div className="font-semibold text-on-surface">Car jack</div>
      <div className="font-label-code text-caption text-on-surface-variant">TLS-JCK-01 · 2.5T Hydraulic Scissor Unit</div>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code text-body-md text-on-surface">
      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface">1</span>
      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="inline-flex items-center justify-center w-10 h-8 rounded font-label-code text-body-md text-on-surface bg-surface-container-low">
                        1
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                        0 OK
                      </span>
      </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface">
                      J$ 11,200.00
                    </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface-variant">
                      J$ 0.00
                    </td>
      <td className="py-space-md px-space-lg font-label-code text-caption text-on-surface-variant">
                      —
                    </td>
      <td className="py-space-md px-space-lg text-right">
      <span className="inline-flex items-center gap-1 font-caption text-caption px-2 py-1 rounded bg-surface-container-low text-on-surface font-medium">
      <span className="material-symbols-outlined text-[13px] text-on-surface">check</span>
                        Audited Exact
                      </span>
      </td>
      </tr>

      <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">handyman</span>
      </div>
      <div>
      <div className="font-semibold text-on-surface">Lug wrench</div>
      <div className="font-label-code text-caption text-on-surface-variant">TLS-WRN-01 · 21mm Telescopic Chrome-V</div>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code text-body-md text-on-surface">
      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface">1</span>
      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="inline-flex items-center justify-center w-10 h-8 rounded font-label-code text-body-md text-on-surface bg-surface-container-low">
                        1
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                        0 OK
                      </span>
      </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface">
                      J$ 3,100.00
                    </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface-variant">
                      J$ 0.00
                    </td>
      <td className="py-space-md px-space-lg font-label-code text-caption text-on-surface-variant">
                      —
                    </td>
      <td className="py-space-md px-space-lg text-right">
      <span className="inline-flex items-center gap-1 font-caption text-caption px-2 py-1 rounded bg-surface-container-low text-on-surface font-medium">
      <span className="material-symbols-outlined text-[13px] text-on-surface">check</span>
                        Audited Exact
                      </span>
      </td>
      </tr>

      <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
      <td className="py-space-md px-space-lg">
      <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[20px] text-on-surface-variant">videocam</span>
      </div>
      <div>
      <div className="font-semibold text-on-surface">Dash camera</div>
      <div className="font-label-code text-caption text-on-surface-variant">ELC-DCM-01 · 4K Dual Sensor Fleet Cam</div>
      <div className="font-label-code text-[11px] text-primary flex items-center gap-1 mt-0.5">
      <span className="material-symbols-outlined text-[12px]">qr_code_2</span>
                            S/N: {assetSerial} verified
                          </div>
      </div>
      </div>
      </td>
      <td className="py-space-md px-space-md text-center font-label-code text-body-md text-on-surface">
      <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface">1</span>
      </td>
      <td className="py-space-md px-space-md text-center">
      <span className="inline-flex items-center justify-center w-10 h-8 rounded font-label-code text-body-md text-on-surface bg-surface-container-low">
                        1
                      </span>
      </td>
      <td className="py-space-md px-space-md">
      <span className="font-label-code text-caption text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                        0 OK
                      </span>
      </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface">
                      J$ 34,500.00
                    </td>
      <td className="py-space-md px-space-md text-right font-label-price text-on-surface-variant">
                      J$ 0.00
                    </td>
      <td className="py-space-md px-space-lg font-label-code text-caption text-on-surface-variant">
                      —
                    </td>
      <td className="py-space-md px-space-lg text-right">
      <span className="inline-flex items-center gap-1 font-caption text-caption px-2 py-1 rounded bg-surface-container-low text-on-surface font-medium">
      <span className="material-symbols-outlined text-[13px] text-on-surface">check</span>
                        Audited Exact
                      </span>
      </td>
      </tr>
      </tbody>
      </table>
      </div>

      <div className="p-space-md bg-surface-container flex flex-col sm:flex-row items-center justify-between text-on-surface-variant font-caption text-caption gap-space-sm">
      <div className="flex items-center gap-space-md">
      <span>Storeroom Clerk ID: <strong>JM-CK-8812</strong></span>
      <span>·</span>
      <span>Timestamped at Device Terminal 03 (Kingston Depot)</span>
      </div>
      <div className="flex items-center gap-space-sm font-label-code">
      <span>Net Raw Variance:</span>
      <span className="font-label-price text-on-error font-bold">−J$ 14,600.00</span>
      </div>
      </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-xl shadow-sm flex flex-col gap-space-lg">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-lg">
      <div className="max-w-3xl">
      <div className="flex items-center gap-space-sm mb-space-xs">
      <span className="w-3 h-3 rounded-full bg-on-tertiary-container shrink-0"></span>
      <h3 className="font-headline-sm text-headline-sm text-on-surface">Approve 2 inventory changes · Net valuation impact: −J$ 14,600.00</h3>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Write-off of 1× Spare tyre (<span className="font-label-price text-on-error font-semibold">−J$ 20,000.00</span>) meets statutory approval threshold. Approval will generate permanent <span className="font-label-code text-caption px-1.5 py-0.5 bg-surface-container rounded font-bold text-on-surface">COUNT</span> movement records with non-reversible audit hashes across the Jamaica Fleet Asset Register.
                </p>

      <div className="mt-space-md flex flex-wrap items-center gap-space-md">
      <div className="bg-surface-container-low px-space-md py-space-sm rounded-lg flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[18px] text-on-surface">verified_user</span>
      <div className="font-caption text-caption">
      <span className="text-on-surface-variant block">Count submitted by:</span>
      <span className="font-semibold text-on-surface">Deeki T (Shift Lead)</span>
      </div>
      </div>
      <div className="bg-surface-container px-space-md py-space-sm rounded-lg flex items-center gap-space-sm">
      <span className="material-symbols-outlined text-[18px] text-on-tertiary-container animate-pulse">pending</span>
      <div className="font-caption text-caption">
      <span className="text-on-surface-variant block">Secondary platform approver:</span>
      <span className="font-semibold text-on-tertiary-fixed">Pending platform_owner sign-off</span>
      </div>
      </div>
      </div>
      </div>

      <div className="flex flex-wrap lg:flex-nowrap items-center gap-space-sm self-start lg:self-center shrink-0">
      <button type="button" className="px-space-md py-2.5 bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[18px]">replay</span>
      <span>Recount line</span>
      </button>
      <button type="button" className="px-space-md py-2.5 bg-surface-container hover:bg-surface-container-high text-on-error font-body-sm text-body-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[18px]">close</span>
      <span>Reject audit</span>
      </button>
      <button type="button" className="px-space-xl py-2.5 bg-primary text-on-primary font-body-sm text-body-sm font-bold rounded-lg shadow-sm hover:opacity-95 transition-all flex items-center gap-2" data-stitch-data-stitch-id="approveBtn">
      <span className="material-symbols-outlined text-[18px]">check</span>
      <span>Approve & update stock</span>
      </button>
      </div>
      </div>

      <div className="pt-space-md bg-surface-container-low rounded-lg p-space-md flex items-center justify-between font-caption text-caption text-on-surface-variant">
      <div className="flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[16px]">info</span>
      <span>Complies with JMD Commercial Fleet Accounting Standard #8 (Periodic Cycle Audit Reconciliation).</span>
      </div>
      <span className="font-label-code text-caption">HASH: SHA256-8A39E1-KGN-2026</span>
      </div>
      </div>
      </div>


      </div></div>
    </div>
  );
}
