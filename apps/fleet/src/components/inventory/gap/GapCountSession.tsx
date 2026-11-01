/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapModalShell } from './GapModalShell';
import { useGapCompliance } from './useGapCompliance';

export function GapCountSession(p: { onClose?: () => void }) {
  const compliance = useGapCompliance();
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="CountSession">
      <div className="fleet-inventory-stitch inventory-stitch-root">
        <div className="inventory-stitch-main"><div className="flex flex-col w-full">
        <div className="relative w-full max-w-[1440px] mx-auto px-margin-desktop py-space-xl">
        <div className="flex flex-col gap-space-lg mb-space-xl">
        <div className="flex items-center justify-between">
        <div className="flex items-center gap-space-sm text-secondary hover:text-on-surface transition-colors cursor-pointer group">
        <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="font-body-md text-body-md font-medium">Counts</span>
        </div>
        <div className="flex items-center gap-space-md">
        <span className="font-caption text-caption uppercase tracking-wider text-secondary">Warehouse Registry: JM-KIN-01</span>
        <div className="h-3 w-px bg-surface-variant"></div>
        <button type="button" className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors shadow-sm text-body-sm font-medium" id="toggle-dialog-btn">
        <span className="material-symbols-outlined text-[16px]">tune</span>
        <span>Count Parameters</span>
        </button>
        </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-lowest p-space-xl rounded-xl shadow-sm">
        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-md flex-wrap">
        <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Count CNT-0003</h1>
        <span className="h-2 w-2 rounded-full bg-secondary-container"></span>
        <span className="font-body-lg text-body-lg text-secondary">Main store — Kingston</span>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold bg-surface-container text-on-surface tracking-wide">
                      OPEN
                    </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-primary text-on-primary">
        <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                      BLIND MODE ACTIVE
                    </span>
        </div>
        <p className="font-body-sm text-body-sm text-secondary">Physical cycle audit initiated by D. Townsend · Kingston Central Depot Storage Annex A</p>
        </div>
        <div className="flex items-center gap-space-xl bg-surface-container-low px-space-xl py-space-md rounded-xl">
        <div className="flex flex-col">
        <span className="font-caption text-caption text-secondary uppercase tracking-wider">Progress</span>
        <span className="font-headline-sm text-headline-sm font-bold text-on-surface">3 of 5 lines</span>
        </div>
        <div className="w-32 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-caption font-medium text-secondary">
        <span>60%</span>
        <span className="font-label-code text-caption">2 pending</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-variant overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style="width: 60%"></div>
        </div>
        </div>
        </div>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm mb-space-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-space-lg">
        <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-secondary">
        <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
        </div>
        <input className="w-full pl-11 pr-24 py-2.5 bg-surface-container-low rounded-lg text-body-md text-on-surface placeholder:text-secondary focus:bg-surface-container-lowest focus:outline-none transition-all font-label-code" placeholder="Scan handheld terminal or type SKU / Bin (e.g. TYR-SPR-01)..." type="text"/>
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
        <kbd className="px-2 py-0.5 text-[11px] font-label-code bg-surface-container rounded text-secondary font-semibold">ENTER</kbd>
        <span className="material-symbols-outlined text-[18px] text-secondary cursor-pointer hover:text-on-surface" title="Open camera scanner">photo_camera</span>
        </div>
        </div>
        <div className="flex items-center gap-space-md text-body-sm text-secondary bg-surface-container-low px-space-lg py-2 rounded-lg">
        <span className="material-symbols-outlined text-[18px] text-on-surface">cell_tower</span>
        <span>Device: <span className="font-medium text-on-surface font-label-code">HH-KIN-01 (Store 1)</span></span>
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
        <span className="font-caption text-caption text-on-surface font-medium">READY</span>
        </div>
        </div>
        <div className="bg-surface-container-lowest px-space-xl py-space-md rounded-xl shadow-sm mb-space-xl overflow-x-auto">
        <div className="flex items-center justify-between min-w-[720px] py-space-xs">
        <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center font-label-code text-caption font-bold shadow-sm">1</div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-bold text-on-surface leading-tight">Open</span>
        <span className="font-caption text-caption text-secondary">In progress</span>
        </div>
        </div>
        <div className="flex-1 h-0.5 mx-4 bg-primary/20"></div>
        <div className="flex items-center gap-3 opacity-60">
        <div className="w-7 h-7 rounded-full bg-surface-container text-secondary flex items-center justify-center font-label-code text-caption font-bold">2</div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-medium text-secondary leading-tight">Submitted</span>
        <span className="font-caption text-caption text-secondary">Freeze check</span>
        </div>
        </div>
        <div className="flex-1 h-0.5 mx-4 bg-surface-variant"></div>
        <div className="flex items-center gap-3 opacity-60">
        <div className="w-7 h-7 rounded-full bg-surface-container text-secondary flex items-center justify-center font-label-code text-caption font-bold">3</div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-medium text-secondary leading-tight">Under Review</span>
        <span className="font-caption text-caption text-secondary">Dual sign-off</span>
        </div>
        </div>
        <div className="flex-1 h-0.5 mx-4 bg-surface-variant"></div>
        <div className="flex items-center gap-3 opacity-60">
        <div className="w-7 h-7 rounded-full bg-surface-container text-secondary flex items-center justify-center font-label-code text-caption font-bold">4</div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-medium text-secondary leading-tight">Reconciled</span>
        <span className="font-caption text-caption text-secondary">Ledger post</span>
        </div>
        </div>
        <div className="flex-1 h-0.5 mx-4 bg-surface-variant"></div>
        <div className="flex items-center gap-3 opacity-60">
        <div className="w-7 h-7 rounded-full bg-surface-container text-secondary flex items-center justify-center font-label-code text-caption font-bold">5</div>
        <div className="flex flex-col">
        <span className="font-body-sm text-body-sm font-medium text-secondary leading-tight">Closed</span>
        <span className="font-caption text-caption text-secondary">Archive lock</span>
        </div>
        </div>
        </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl items-start">
        <div className="xl:col-span-8 flex flex-col gap-space-lg">
        <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <div className="px-space-xl py-space-lg bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-space-md">
        <span className="material-symbols-outlined text-[20px] text-secondary">table_view</span>
        <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Physical Count Matrix</h2>
        </div>
        <div className="flex items-center gap-space-sm text-caption text-secondary">
        <span className="material-symbols-outlined text-[16px]">info</span>
        <span>Ledger obscured by Blind Count protocol (Supervisor View Unlocked)</span>
        </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-left">
        <thead>
        <tr className="bg-surface-container text-secondary text-caption uppercase tracking-wider font-semibold">
        <th className="py-3 px-4">Bin</th>
        <th className="py-3 px-4 min-w-[200px]">Item & SKU</th>
        <th className="py-3 px-4 text-center">Expected</th>
        <th className="py-3 px-4 text-center min-w-[110px]">Counted</th>
        <th className="py-3 px-4 text-center">Difference</th>
        <th className="py-3 px-4 text-right">Impact (JMD)</th>
        <th className="py-3 px-4 min-w-[190px]">Discrepancy Reason</th>
        </tr>
        </thead>
        <tbody className="divide-y divide-surface-container text-body-sm">
        <tr className="hover:bg-surface-container-low/50 transition-colors">
        <td className="py-3.5 px-4 font-label-code font-bold text-on-surface">A-01</td>
        <td className="py-3.5 px-4">
        <div className="flex flex-col">
        <span className="font-medium text-on-surface">Spare tyre 195/65 R15</span>
        <span className="font-label-code text-caption text-secondary">TYR-SPR-01</span>
        </div>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="font-label-code font-semibold text-secondary bg-surface-container px-2 py-0.5 rounded">1</span>
        </td>
        <td className="py-3.5 px-4 text-center">
        <input className="w-16 h-10 text-center font-label-code font-bold text-body-lg bg-surface-container-low rounded-lg focus:bg-surface-container-lowest focus:outline-none transition-all shadow-inner text-on-surface" type="number" value="1"/>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-label-code font-semibold bg-surface-container text-secondary">
                              0
                            </span>
        </td>
        <td className="py-3.5 px-4 text-right font-label-price text-secondary">
                            J$ 0.00
                          </td>
        <td className="py-3.5 px-4">
        <span className="text-secondary font-body-sm italic">— (Matched)</span>
        </td>
        </tr>
        <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
        <td className="py-3.5 px-4 font-label-code font-bold text-on-surface">A-02</td>
        <td className="py-3.5 px-4">
        <div className="flex flex-col">
        <span className="font-medium text-on-surface">Phone Holder Mount</span>
        <span className="font-label-code text-caption text-secondary">ACC-PHM-01</span>
        </div>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="font-label-code font-semibold text-secondary bg-surface-container px-2 py-0.5 rounded">1</span>
        </td>
        <td className="py-3.5 px-4 text-center">
        <input className="w-16 h-10 text-center font-label-code font-bold text-body-lg bg-error-container text-on-error-container rounded-lg focus:bg-surface-container-lowest focus:outline-none transition-all shadow-inner" type="number" value="0"/>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-label-code font-bold bg-error-container text-on-error-container">
                              −1
                            </span>
        </td>
        <td className="py-3.5 px-4 text-right font-label-price font-bold text-error">
                            −J$ 5,400.00
                          </td>
        <td className="py-3.5 px-4">
        <select className="w-full py-1.5 px-2.5 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none cursor-pointer">
        <option selected="" value="lost">Lost</option>
        <option value="damaged">Damaged in Hub</option>
        <option value="theft">Suspected Shrinkage</option>
        <option value="misplaced">Misplaced Bin</option>
        </select>
        </td>
        </tr>
        <tr className="bg-surface-container-lowest hover:bg-surface-container-low/50 transition-colors">
        <td className="py-3.5 px-4 font-label-code font-bold text-on-surface">A-03</td>
        <td className="py-3.5 px-4">
        <div className="flex flex-col">
        <span className="font-medium text-on-surface">Lug wrench 19mm</span>
        <span className="font-label-code text-caption text-secondary">ACC-LGW-02</span>
        </div>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="font-label-code font-semibold text-secondary bg-surface-container px-2 py-0.5 rounded">3</span>
        </td>
        <td className="py-3.5 px-4 text-center">
        <input className="w-16 h-10 text-center font-label-code font-bold text-body-lg bg-secondary-container text-on-secondary-fixed rounded-lg focus:bg-surface-container-lowest focus:outline-none transition-all shadow-inner" type="number" value="4"/>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-label-code font-bold bg-secondary-container text-on-secondary-fixed">
                              +1
                            </span>
        </td>
        <td className="py-3.5 px-4 text-right font-label-price font-bold text-on-surface">
                            +J$ 2,805.00
                          </td>
        <td className="py-3.5 px-4">
        <select className="w-full py-1.5 px-2.5 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none cursor-pointer">
        <option selected="" value="unrecorded">Found (Unrecorded return)</option>
        <option value="wrong_item">Incorrect Labeling</option>
        <option value="vendor_overage">Supplier Overage</option>
        </select>
        </td>
        </tr>
        <tr className="opacity-50 bg-surface-container-low/30">
        <td className="py-3.5 px-4 font-label-code text-secondary">A-04</td>
        <td className="py-3.5 px-4">
        <div className="flex flex-col">
        <span className="font-medium text-secondary">Hydraulic Jack 3-Ton</span>
        <span className="font-label-code text-caption text-secondary">TLS-HJK-03</span>
        </div>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="material-symbols-outlined text-[16px] text-secondary">lock</span>
        </td>
        <td className="py-3.5 px-4 text-center">
        <input className="w-16 h-10 text-center font-label-code bg-surface-container rounded-lg focus:bg-surface-container-lowest focus:outline-none text-secondary" placeholder="—" type="text"/>
        </td>
        <td className="py-3.5 px-4 text-center font-label-code text-secondary">—</td>
        <td className="py-3.5 px-4 text-right font-label-price text-secondary">—</td>
        <td className="py-3.5 px-4 text-caption text-secondary italic">Awaiting scan...</td>
        </tr>
        <tr className="opacity-50 bg-surface-container-low/30">
        <td className="py-3.5 px-4 font-label-code text-secondary">A-05</td>
        <td className="py-3.5 px-4">
        <div className="flex flex-col">
        <span className="font-medium text-secondary">Warning Triangle Reflector</span>
        <span className="font-label-code text-caption text-secondary">SFT-TRG-01</span>
        </div>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="material-symbols-outlined text-[16px] text-secondary">lock</span>
        </td>
        <td className="py-3.5 px-4 text-center">
        <input className="w-16 h-10 text-center font-label-code bg-surface-container rounded-lg focus:bg-surface-container-lowest focus:outline-none text-secondary" placeholder="—" type="text"/>
        </td>
        <td className="py-3.5 px-4 text-center font-label-code text-secondary">—</td>
        <td className="py-3.5 px-4 text-right font-label-price text-secondary">—</td>
        <td className="py-3.5 px-4 text-caption text-secondary italic">Awaiting scan...</td>
        </tr>
        </tbody>
        </table>
        </div>
        </div>
        <div className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm flex flex-col gap-space-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md pb-space-md bg-surface-container-low p-space-lg rounded-xl">
        <div className="flex items-center gap-space-md">
        <span className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface">
        <span className="material-symbols-outlined text-[22px]">analytics</span>
        </span>
        <div className="flex flex-col">
        <span className="font-body-md text-body-md font-semibold text-on-surface">Reconciliation Variance Assessment</span>
        <span className="font-body-sm text-body-sm text-secondary">2 discrepancies detected across completed rows</span>
        </div>
        </div>
        <div className="flex flex-col items-start md:items-end">
        <span className="font-caption text-caption text-secondary uppercase tracking-wider">Net Variance Impact</span>
        <span className="font-headline-sm text-headline-sm font-bold font-label-price text-error">−J$ 2,595.00</span>
        </div>
        </div>
        <div className="flex items-start gap-space-md bg-surface-container p-space-lg rounded-xl">
        <span className="material-symbols-outlined text-primary text-[22px] shrink-0 mt-0.5">policy</span>
        <div className="flex flex-col gap-0.5">
        <span className="font-body-sm text-body-sm font-bold text-on-surface">Operational Dual-Approval Governance Triggered</span>
        <span className="font-body-sm text-body-sm text-secondary">
                        Net loss threshold exceeds J$ 2,500.00 standard depot tolerance. Submission will initiate an automated review packet requiring authorization from Store Lead <strong className="text-on-surface">K. Patterson</strong> and Platform Auditor before adjustments post to Movements ledger.
                      </span>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-md pt-space-xs">
        <button type="button" className="px-space-xl py-2.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-variant font-body-sm font-medium transition-colors shadow-sm">
                      Save & Finish Later
                    </button>
        <button type="button" className="flex items-center gap-space-xs px-space-xl py-2.5 rounded-lg bg-primary text-on-primary hover:bg-secondary transition-colors font-body-sm font-semibold shadow-md active:scale-95">
        <span>Submit Count</span>
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
        </div>
        </div>
        </div>
        <div className="xl:col-span-4 bg-surface-container-lowest rounded-xl shadow-xl p-space-xl flex flex-col gap-space-lg sticky top-28" id="start-count-card">
        <div className="flex items-center justify-between pb-space-sm">
        <div className="flex items-center gap-space-sm">
        <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-[20px]">inventory_2</span>
        </div>
        <div>
        <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Workflow Setup</span>
        <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Start a count</h3>
        </div>
        </div>
        <span className="px-2 py-0.5 rounded bg-surface-container text-caption font-label-code font-bold text-secondary">
                    DIALOG
                  </span>
        </div>
        <p className="font-body-sm text-body-sm text-secondary leading-relaxed">
                  Freeze inventory bins to reconcile physical units against ledger balances without halting dispatch operations outside target sector.
                </p>
        <div className="flex flex-col gap-space-md">
        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Location</label>
        <div className="flex items-center justify-between px-space-md py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface font-medium">
        <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-secondary">warehouse</span>
        <span>Main store — Kingston</span>
        </div>
        <span className="font-caption text-caption font-label-code text-secondary">DEPOT-01</span>
        </div>
        </div>
        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Bins to count</label>
        <div className="grid grid-cols-2 gap-space-sm">
        <button type="button" className="py-2 px-3 rounded-lg text-body-sm font-medium text-secondary bg-surface-container-low hover:bg-surface-container text-center transition-colors">
                        All bins (24)
                      </button>
        <button type="button" className="py-2 px-3 rounded-lg text-body-sm font-semibold text-on-primary bg-primary text-center shadow-sm">
                        Specific bins (2)
                      </button>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-caption font-label-code font-bold text-on-surface">
                        BIN A-01
                        <span className="material-symbols-outlined text-[13px] text-secondary cursor-pointer hover:text-error">close</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-caption font-label-code font-bold text-on-surface">
                        BIN A-02
                        <span className="material-symbols-outlined text-[13px] text-secondary cursor-pointer hover:text-error">close</span>
        </span>
        <button type="button" className="px-2 py-1 rounded bg-surface-container-low hover:bg-surface-container text-caption font-medium text-secondary flex items-center gap-0.5">
        <span className="material-symbols-outlined text-[14px]">add</span>
        <span>Add Bin</span>
        </button>
        </div>
        </div>
        <div className="bg-surface-container-low p-space-md rounded-xl flex items-start justify-between gap-space-md">
        <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
        <span className="font-body-sm text-body-sm font-bold text-on-surface">Blind count enabled</span>
        <span className="material-symbols-outlined text-[15px] text-secondary">help_outline</span>
        </div>
        <p className="font-caption text-caption text-secondary leading-snug">
                        Counters won't see expected quantities on handheld terminals to prevent confirmation bias.
                      </p>
        </div>
        <div className="pt-1">
        <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer p-0.5 transition-colors">
        <div className="w-5 h-5 bg-on-primary rounded-full absolute right-0.5 shadow-sm"></div>
        </div>
        </div>
        </div>
        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Assign to Counters</label>
        <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between p-2 bg-surface-container-low rounded-lg text-body-sm">
        <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary text-[11px] font-label-code flex items-center justify-center font-bold">DT</div>
        <span className="text-on-surface font-medium">Deeki T</span>
        </div>
        <span className="text-caption text-secondary">Platform Owner</span>
        </div>
        <div className="flex items-center justify-between p-2 bg-surface-container-low rounded-lg text-body-sm">
        <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-secondary text-on-secondary text-[11px] font-label-code flex items-center justify-center font-bold">KP</div>
        <span className="text-on-surface font-medium">K. Patterson</span>
        </div>
        <span className="text-caption text-secondary">Store Lead</span>
        </div>
        </div>
        </div>
        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Hardware Scanner Route</label>
        <div className="flex items-center justify-between px-space-md py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface">
        <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-secondary">devices</span>
        <span className="font-label-code">Handheld — Store 1</span>
        </div>
        <span className="inline-flex items-center gap-1 font-caption text-caption font-bold text-on-surface">
        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        PAIRED
                      </span>
        </div>
        </div>
        <div className="bg-surface-container p-space-md rounded-xl flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">lock_clock</span>
        <div className="flex flex-col">
        <span className="font-caption text-caption uppercase tracking-wider font-bold text-on-surface">What will change</span>
        <p className="font-body-sm text-body-sm text-secondary leading-snug">
                        Stock at Main store is frozen for counting. Issues, transfers, and work order picking from these bins wait until the count is submitted.
                      </p>
        </div>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-sm pt-space-sm">
        <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-variant font-body-sm font-medium transition-colors">
                    Cancel
                  </button>
        <button type="button" className="px-space-xl py-2 rounded-lg bg-primary text-on-primary hover:bg-secondary font-body-sm font-bold shadow-md transition-all active:scale-95">
                    Start count
                  </button>
        </div>
        </div>
        </div>
        </div>
        </div>
        </div>
        {compliance.safetyNotice ? (
          <div className="mt-space-md rounded-lg border border-outline-variant/30 bg-surface-container-low p-space-md font-body-sm text-body-sm text-on-surface-variant">
            {compliance.safetyNotice}
          </div>
        ) : null}
      </div>
    </GapModalShell>
  );
}
