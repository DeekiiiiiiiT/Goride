// Stitch: dominion-redesign/3f31fb6d053542b798ef7d3da76c4f29
import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Hourglass,
  Info,
  Loader2,
  Lock,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { gctAdminService } from '../../../services/gctAdminService';

function money(n: unknown) {
  return `J$${Number(n ?? 0).toLocaleString('en-JM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function GctRemittancePage() {
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [assignPeriodId, setAssignPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, orphans] = await Promise.all([
        gctAdminService.periods(),
        gctAdminService.orphans(),
      ]);
      setPeriods(data.periods);
      setOrphanCount(orphans.outputCount + orphans.inputCount);
      const open = data.periods.find((p) => p.status === 'open');
      if (open) setAssignPeriodId(String(open.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load periods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function ensureCurrent() {
    setBusy(true);
    try {
      await gctAdminService.ensureMonth();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function closePeriod(id: string) {
    if (orphanCount > 0) {
      if (
        !confirm(
          `${orphanCount} ledger row(s) have no period (orphans). Assign them before closing, or continue anyway?`,
        )
      ) {
        return;
      }
    }
    if (!confirm('Close and lock this period? Totals will freeze.')) return;
    setBusy(true);
    try {
      await gctAdminService.closePeriod(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Close failed');
    } finally {
      setBusy(false);
    }
  }

  async function assignOrphans() {
    if (!assignPeriodId) return;
    setBusy(true);
    try {
      await gctAdminService.assignOrphans(assignPeriodId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  function exportCsv(p: Record<string, unknown>) {
    const lines = [
      'Form,Period start,Period end,Output tax,Input tax,Net payable,Status',
      [
        '4A-shaped',
        p.period_start,
        p.period_end,
        p.output_total_jmd,
        p.input_total_jmd,
        p.net_payable_jmd,
        p.status,
      ].join(','),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gct-form4a-${p.period_start}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const openPeriod = periods.find((p) => p.status === 'open');

  return (
    <div className="space-y-6 overflow-y-auto p-8 text-slate-900">
      <div className="flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 font-mono text-xs text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Back office</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-blue-600">Remittance</span>
        </nav>
        <div className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-slate-600 shadow-sm">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          <span>JMD TAX COMPLIANCE ACT (S34)</span>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-2 md:flex-row md:items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Remittance</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 font-mono text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              Owner only
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">
            Filing periods and orphans, in JMD. This is Roam&apos;s own filing, not a customer list.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          <button
            type="button"
            onClick={() => openPeriod && void closePeriod(String(openPeriod.id))}
            disabled={busy || !openPeriod}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void ensureCurrent()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden />}
            <span>File</span>
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-blue-600" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">Filing periods</h2>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-500">
            JMD FISCAL LEDGER
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr>
                <th className="px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500" scope="col">
                  Period
                </th>
                <th className="px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-slate-500" scope="col">
                  Status
                </th>
                <th className="px-6 py-3 text-right font-mono text-xs font-semibold uppercase tracking-wider text-slate-500" scope="col">
                  Amount JMD
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-14 text-center">
                    <Loader2 className="inline h-5 w-5 animate-spin text-slate-400" />
                  </td>
                </tr>
              ) : periods.length === 0 ? (
                <tr>
                  <td className="py-14 text-center" colSpan={3}>
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <Hourglass className="h-5 w-5" aria-hidden />
                      </div>
                      <p className="text-sm font-medium text-slate-500">The data is not in yet</p>
                      <p className="font-mono text-xs text-slate-400">
                        Awaiting Kingston GCT tax return closure cycle.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                periods.map((p) => (
                  <tr key={String(p.id)} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-medium text-slate-800">
                      {String(p.period_start)} → {String(p.period_end)}
                      <button
                        type="button"
                        className="ml-3 text-[11px] text-blue-600 hover:underline"
                        onClick={() => exportCsv(p)}
                      >
                        Export CSV
                      </button>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600">{String(p.status)}</td>
                    <td className="px-6 py-3 text-right font-mono text-slate-700">
                      {money(p.net_payable_jmd)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-6 py-3 font-mono text-xs text-slate-400">
          <span>STATUTORY RECORD: SECTION 34 GCT ACT</span>
          <span>REMITTANCE TYPE: DIRECT FISCAL</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <Hourglass className="h-5 w-5 text-amber-600" aria-hidden />
            <h2 className="text-base font-semibold text-slate-900">Orphans</h2>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-500">
            UNRECONCILED
          </span>
        </div>
        <div className="p-8">
          {orphanCount > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
              <span className="text-sm font-medium text-slate-800">
                {orphanCount} orphan ledger row(s)
              </span>
              <select
                className="h-9 rounded-md border border-slate-200 px-2 text-sm"
                value={assignPeriodId}
                onChange={(e) => setAssignPeriodId(e.target.value)}
              >
                {periods
                  .filter((p) => p.status === 'open')
                  .map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {String(p.period_start)} → {String(p.period_end)}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => void assignOrphans()}
                disabled={busy || !assignPeriodId}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Assign orphans to open period
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/30 p-8 text-center">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Hourglass className="h-4 w-4" aria-hidden />
              </div>
              <p className="text-sm font-medium text-slate-900">The data is not in yet.</p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                No unmatched tax-invoice remittances detected in parish pool.
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="space-y-3 pt-2">
        <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          <div className="flex flex-1 flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-medium text-slate-900">The data is not in yet.</p>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                Parish filing batches settle at 23:59:59 EST.
              </p>
            </div>
            <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
              LOC: KINGSTON / PARISH REGISTRY JMD
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-100/60 px-4 py-2.5 font-mono text-[11px] text-slate-600">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            <span>
              Restricted to Dominion fiscal administrators. Statutory remittance register under General
              Consumption Tax regime.
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            <span className="font-semibold text-slate-900">NODE-AUTH: VERIFIED</span>
          </div>
        </div>
      </div>
    </div>
  );
}
