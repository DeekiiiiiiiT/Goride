/** Ported from Stitch gap screen — panel only (audit R16-01). */
import { GapLoadState, GapSubmitError } from './GapLoadState';
import { GapModalShell } from './GapModalShell';
import { useGapCountSessionForm } from './useGapCountSessionForm';
import { useInventoryShell } from '../InventoryShellContext';
import { useAuth } from '../../auth/AuthContext';

export function GapCountSession(p: { onClose?: () => void }) {
  const shell = useInventoryShell();
  const form = useGapCountSessionForm(p.onClose);
  const { user } = useAuth();
  const operatorLabel =
    user?.user_metadata?.full_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Operator';
  const operatorInitials = operatorLabel
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hubLabel = shell.overview?.hub_code ? String(shell.overview.hub_code) : '—';
  const sessionCode = form.activeSession ? String(form.activeSession.code ?? '—') : '—';
  const sessionStatus = form.activeSession ? String(form.activeSession.status ?? 'open').toUpperCase() : '—';
  return (
    <GapModalShell onClose={p.onClose} ariaLabel="CountSession">
      <GapSubmitError message={form.submit.error} />
      <GapLoadState loading={form.load.loading} error={form.load.error} onRetry={form.load.reload}>
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
        <span className="font-caption text-caption uppercase tracking-wider text-secondary">Warehouse Registry: {hubLabel}</span>
        <div className="h-3 w-px bg-surface-variant"></div>
        <button type="button" className="flex items-center gap-space-xs px-space-md py-1.5 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors shadow-sm text-body-sm font-medium" id="toggle-dialog-btn" onClick={() => form.setShowParams(true)}>
        <span className="material-symbols-outlined text-[16px]">tune</span>
        <span>Count Parameters</span>
        </button>
        </div>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg bg-surface-container-lowest p-space-xl rounded-xl shadow-sm">
        <div className="flex flex-col gap-space-xs">
        <div className="flex items-center gap-space-md flex-wrap">
        <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">Count {sessionCode}</h1>
        <span className="h-2 w-2 rounded-full bg-secondary-container"></span>
        <span className="font-body-lg text-body-lg text-secondary">{form.locationLabel}</span>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold bg-surface-container text-on-surface tracking-wide">
                      {sessionStatus}
                    </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-primary text-on-primary">
        <span className="material-symbols-outlined text-[13px]">visibility_off</span>
                      BLIND MODE ACTIVE
                    </span>
        </div>
        <p className="font-body-sm text-body-sm text-secondary">Physical cycle audit · {form.stockCount} stock lines · {form.sessionCount} sessions on record</p>
        </div>
        <div className="flex items-center gap-space-xl bg-surface-container-low px-space-xl py-space-md rounded-xl">
        <div className="flex flex-col">
        <span className="font-caption text-caption text-secondary uppercase tracking-wider">Progress</span>
        <span className="font-headline-sm text-headline-sm font-bold text-on-surface">3 of 5 lines</span>
        </div>
        <div className="w-32 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-caption font-medium text-secondary">
        <span>{form.progressPct}%</span>
        <span className="font-label-code text-caption">{form.pendingLineCount} pending</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-variant overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${form.progressPct}%` }}></div>
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
        <input className="w-full pl-11 pr-24 py-2.5 bg-surface-container-low rounded-lg text-body-md text-on-surface placeholder:text-secondary focus:bg-surface-container-lowest focus:outline-none transition-all font-label-code" placeholder="Scan handheld terminal or type SKU / bin code…" type="text" value={form.scanQuery} onChange={(e) => form.setScanQuery(e.target.value)}/>
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
        {form.filteredLines.length === 0 ? (
        <tr>
        <td colSpan={7} className="py-8 px-4 text-center text-secondary font-body-sm">No count lines loaded for this location.</td>
        </tr>
        ) : form.filteredLines.map((line) => {
          const diff = form.lineDiff(line);
          const impact = diff != null ? diff * line.unit_cost : 0;
          return (
        <tr key={line.key} className="hover:bg-surface-container-low/50 transition-colors">
        <td className="py-3.5 px-4 font-label-code font-bold text-on-surface">{line.bin_code}</td>
        <td className="py-3.5 px-4">
        <div className="flex flex-col">
        <span className="font-medium text-on-surface">{line.name}</span>
        <span className="font-label-code text-caption text-secondary">{line.sku}</span>
        </div>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="font-label-code font-semibold text-secondary bg-surface-container px-2 py-0.5 rounded">{line.expected_qty}</span>
        </td>
        <td className="py-3.5 px-4 text-center">
        <input className="w-16 h-10 text-center font-label-code font-bold text-body-lg bg-surface-container-low rounded-lg focus:bg-surface-container-lowest focus:outline-none transition-all shadow-inner text-on-surface" type="number" value={line.counted_qty} onChange={(e) => form.setLineCountedQty(line.key, e.target.value)}/>
        </td>
        <td className="py-3.5 px-4 text-center">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-label-code font-semibold bg-surface-container text-secondary">
                              {diff == null ? '—' : diff}
                            </span>
        </td>
        <td className="py-3.5 px-4 text-right font-label-price text-secondary">
                            {form.lineImpactLabel(line)}
                          </td>
        <td className="py-3.5 px-4">
        {diff === 0 || diff == null ? (
        <span className="text-secondary font-body-sm italic">— (Matched)</span>
        ) : (
        <select className="w-full py-1.5 px-2.5 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none cursor-pointer" value={line.reason || 'lost'} onChange={(e) => form.setLineReason(line.key, e.target.value)}>
        <option value="lost">Lost</option>
        <option value="damaged">Damaged in Hub</option>
        <option value="theft">Suspected Shrinkage</option>
        <option value="misplaced">Misplaced Bin</option>
        <option value="unrecorded">Found (Unrecorded return)</option>
        <option value="wrong_item">Incorrect Labeling</option>
        <option value="vendor_overage">Supplier Overage</option>
        </select>
        )}
        </td>
        </tr>
          );
        })}
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
        <span className="font-body-sm text-body-sm text-secondary">{form.discrepancyCount} discrepancies detected across completed rows</span>
        </div>
        </div>
        <div className="flex flex-col items-start md:items-end">
        <span className="font-caption text-caption text-secondary uppercase tracking-wider">Net Variance Impact</span>
        <span className="font-headline-sm text-headline-sm font-bold font-label-price text-error">{form.netVarianceLabel}</span>
        </div>
        </div>
        <div className="flex items-start gap-space-md bg-surface-container p-space-lg rounded-xl">
        <span className="material-symbols-outlined text-primary text-[22px] shrink-0 mt-0.5">policy</span>
        <div className="flex flex-col gap-0.5">
        <span className="font-body-sm text-body-sm font-bold text-on-surface">Operational Dual-Approval Governance Triggered</span>
        <span className="font-body-sm text-body-sm text-secondary">
                        Net loss threshold exceeds {form.depotToleranceLabel} standard depot tolerance. Submission will initiate an automated review packet requiring authorization from Store Lead <strong className="text-on-surface">—</strong> and Platform Auditor before adjustments post to Movements ledger.
                      </span>
        </div>
        </div>
        <div className="flex items-center justify-end gap-space-md pt-space-xs">
        <button type="button" className="px-space-xl py-2.5 rounded-lg bg-surface-container text-on-surface hover:bg-surface-variant font-body-sm font-medium transition-colors shadow-sm" onClick={() => void form.saveAndExit()}>
                      Save & Finish Later
                    </button>
        <button type="button" disabled={!form.canSubmitCount || form.submit.saving} onClick={() => void form.countSubmit()} className="flex items-center gap-space-xs px-space-xl py-2.5 rounded-lg bg-primary text-on-primary hover:bg-secondary transition-colors font-body-sm font-semibold shadow-md active:scale-95 disabled:opacity-60">
        <span>{form.submit.saving ? 'Submitting…' : 'Submit Count'}</span>
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
        <select className="bg-transparent font-medium focus:outline-none" value={form.locationId} onChange={(e) => form.setLocationId(e.target.value)}>
        <option value="">Choose location…</option>
        {form.locations.map((loc) => (
          <option key={String(loc.id)} value={String(loc.id)}>{String(loc.name ?? loc.code ?? '—')}</option>
        ))}
        </select>
        </div>
        <span className="font-caption text-caption font-label-code text-secondary">{form.locationId ? form.locationId.slice(0, 8) : '—'}</span>
        </div>
        </div>
        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Count note</label>
        <textarea className="w-full min-h-[72px] px-space-md py-2 bg-surface-container-low rounded-lg text-body-sm text-on-surface focus:outline-none focus:bg-surface-container-lowest" value={form.note} onChange={(e) => form.setNote(e.target.value)} placeholder="Optional note for auditors" />
        </div>
        <div className="flex flex-col gap-1.5">
        <label className="font-caption text-caption text-secondary uppercase tracking-wider font-semibold">Bins to count</label>
        <div className="grid grid-cols-2 gap-space-sm">
        <button type="button" className={`py-2 px-3 rounded-lg text-body-sm font-medium text-center transition-colors ${form.binScope === 'all' ? 'font-semibold text-on-primary bg-primary shadow-sm' : 'text-secondary bg-surface-container-low hover:bg-surface-container'}`} onClick={() => form.setBinScope('all')}>
                        All bins
                      </button>
        <button type="button" className={`py-2 px-3 rounded-lg text-body-sm font-medium text-center transition-colors ${form.binScope === 'specific' ? 'font-semibold text-on-primary bg-primary shadow-sm' : 'text-secondary bg-surface-container-low hover:bg-surface-container'}`} onClick={() => form.setBinScope('specific')}>
                        Specific bins
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
        <button type="button" className="px-2 py-1 rounded bg-surface-container-low hover:bg-surface-container text-caption font-medium text-secondary flex items-center gap-0.5" onClick={() => form.setShowParams(true)}>
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
        <div className="w-6 h-6 rounded-full bg-primary-container text-on-primary text-[11px] font-label-code flex items-center justify-center font-bold">{operatorInitials}</div>
        <span className="text-on-surface font-medium">{operatorLabel}</span>
        </div>
        <span className="text-caption text-secondary">Platform Owner</span>
        </div>
        <div className="flex items-center justify-between p-2 bg-surface-container-low rounded-lg text-body-sm">
        <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-secondary text-on-secondary text-[11px] font-label-code flex items-center justify-center font-bold">KP</div>
        <span className="text-on-surface font-medium">—</span>
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
        <button type="button" className="px-space-lg py-2 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-variant font-body-sm font-medium transition-colors" onClick={() => { form.setShowParams(false); p.onClose?.(); }}>
                    Cancel
                  </button>
        <button type="button" disabled={!form.canStartCount || form.submit.saving} onClick={() => void form.startCount()} className="px-space-xl py-2 rounded-lg bg-primary text-on-primary hover:bg-secondary font-body-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-60">
                    {form.submit.saving ? 'Starting…' : 'Start count'}
                  </button>
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
