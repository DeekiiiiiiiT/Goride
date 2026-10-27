// Stitch: dominion-redesign/18ac5b8fa8c24887bc95b30f1283b9a0
import { useCallback, useEffect, useState } from 'react';
import { Calendar, Info, Loader2, Lock, Upload } from 'lucide-react';
import { gctAdminService } from '../../../services/gctAdminService';

function parseInputTaxCsv(text: string): Array<Record<string, unknown>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return {
      tax_point: row.tax_point || row.date || new Date().toISOString(),
      supplier_trn: row.supplier_trn || row.trn || null,
      base_amount_jmd: Number(row.base_amount_jmd || row.base || 0),
      rate_percent: Number(row.rate_percent || row.rate || 15),
      tax_amount_jmd: Number(row.tax_amount_jmd || row.tax || 0),
      credit_restriction: row.credit_restriction || row.restriction || 'none',
      source_ref: row.source_ref || row.ref || null,
    };
  });
}

export function GctLedgerPage() {
  const [kind, setKind] = useState<'output' | 'input'>('output');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [periods, setPeriods] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [periodId, setPeriodId] = useState('');

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, p] = await Promise.all([
        gctAdminService.ledger(kind),
        gctAdminService.periods(),
      ]);
      setRows(data.rows);
      setPeriods(p.periods);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCsvFile(file: File | null) {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const text = await file.text();
      const parsed = parseInputTaxCsv(text);
      if (!parsed.length) throw new Error('No data rows in CSV');
      await gctAdminService.importInputTaxBatch(parsed, periodId || undefined);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CSV import failed');
    } finally {
      setSaving(false);
    }
  }

  const outputTotal = rows
    .filter(() => kind === 'output')
    .reduce((s, r) => s + Number(r.tax_amount_jmd || 0), 0);
  const inputTotal = rows
    .filter(() => kind === 'input')
    .reduce((s, r) => s + Number(r.creditable_amount_jmd ?? r.tax_amount_jmd ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 overflow-y-auto px-8 py-6 text-slate-900">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 font-mono text-xs text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-300">/</span>
          <span>Back office</span>
          <span className="text-slate-300">/</span>
          <span className="font-medium text-slate-900">Ledger</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-3 py-1 font-mono text-xs font-medium text-slate-700">
          <span className="text-blue-600">✓</span>
          <span>JMD TAX COMPLIANCE ACT</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Ledger</h2>
          <span className="inline-flex items-center rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-800">
            Owner only
          </span>
        </div>
        <p className="max-w-3xl text-sm text-slate-600">
          Output tax and input tax, in JMD. This is Roam&apos;s own books, not a customer list.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="flex items-center gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800">
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
            <span>{monthLabel}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-md border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-500">
            <span>CURRENCY:</span>
            <span className="font-semibold text-slate-700">JMD ($)</span>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setKind('output')}
              className={`px-3 py-1.5 ${kind === 'output' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
            >
              Output
            </button>
            <button
              type="button"
              onClick={() => setKind('input')}
              className={`px-3 py-1.5 ${kind === 'input' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
            >
              Input
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {kind === 'input' ? (
            <>
              <select
                className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
                value={periodId || '__none'}
                onChange={(e) => setPeriodId(e.target.value === '__none' ? '' : e.target.value)}
              >
                <option value="__none">Period (optional)</option>
                {periods
                  .filter((p) => p.status === 'open')
                  .map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {String(p.period_start)} → {String(p.period_end)}
                    </option>
                  ))}
              </select>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Upload className="h-4 w-4" aria-hidden />
                <span>{saving ? 'Importing…' : 'CSV import'}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
              <Upload className="h-4 w-4" aria-hidden />
              CSV import
            </span>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-6 py-4">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-slate-700">
            LEDGER SUMMARY - {monthLabel.toUpperCase()}
          </h3>
          <span className="font-mono text-[11px] tracking-tight text-slate-400">JAD-LEDGER-SPEC 1991</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/30">
                <th className="w-2/3 px-6 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-slate-400" scope="col">
                  LINE
                </th>
                <th className="w-1/3 px-6 py-3 text-right font-mono text-xs font-semibold uppercase tracking-wider text-slate-400" scope="col">
                  AMOUNT JMD
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              <tr className="transition-colors hover:bg-slate-50/50">
                <td className="flex items-center gap-2 px-6 py-4 font-medium text-slate-800">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  <span>Output tax</span>
                </td>
                <td className="px-6 py-4 text-right font-mono font-medium text-slate-500">
                  {loading ? '—' : kind === 'output' && rows.length ? outputTotal.toFixed(2) : '—'}
                </td>
              </tr>
              <tr className="transition-colors hover:bg-slate-50/50">
                <td className="flex items-center gap-2 px-6 py-4 font-medium text-slate-800">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  <span>Input tax</span>
                </td>
                <td className="px-6 py-4 text-right font-mono font-medium text-slate-500">
                  {loading ? '—' : kind === 'input' && rows.length ? inputTotal.toFixed(2) : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {!loading && rows.length > 0 ? (
          <div className="max-h-64 overflow-y-auto border-t border-slate-100">
            <table className="w-full text-left text-xs">
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-t border-slate-50">
                    <td className="px-6 py-2 text-slate-600">
                      {String(r.tax_point)}
                      {kind === 'output'
                        ? ` · ${String(r.source_doc_type)}/${String(r.source_doc_id)}`
                        : ` · ${String(r.supplier_trn || '—')}`}
                    </td>
                    <td className="px-6 py-2 text-right font-mono text-slate-700">
                      {kind === 'input'
                        ? Number(r.creditable_amount_jmd ?? r.tax_amount_jmd).toFixed(2)
                        : Number(r.tax_amount_jmd).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 p-5">
          <div className="flex items-start gap-3">
            {loading ? (
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-slate-400" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 text-blue-600" aria-hidden />
            )}
            <div>
              <p className="text-xs font-semibold leading-tight text-slate-800">The data is not in yet.</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Official General Consumption Tax ledger sync pending reconciliation for period {monthLabel}.
              </p>
            </div>
          </div>
          <span className="rounded border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-500">
            LOC: KINGSTON / PARISH REGISTRY JMD
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-slate-400" aria-hidden />
          <span>
            Restricted to Dominion fiscal administrators. Statutory ledger record under General Consumption
            Tax regime.
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">NODE-AUTH: VERIFIED</div>
      </div>
    </div>
  );
}
