/**
 * BudgetsTab.tsx
 *
 * Per-provider monthly / daily budget caps with a "hard stop when exceeded"
 * switch. Enforced server-side by `checkProviderGuards()` before each
 * outbound call.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, Save, CheckCircle2, ShieldAlert, Info } from 'lucide-react';
import { useBudgets, useSaveBudget } from './hooks';
import type { BudgetRow, Provider } from './hooks';
import { PROVIDER_META, PROVIDER_ORDER, fmtUSD } from './providers';

export function BudgetsTab() {
  const { data, isLoading, error } = useBudgets();
  const save = useSaveBudget();

  // local dirty state keyed by provider
  const [draft, setDraft] = useState<Record<string, BudgetRow>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, BudgetRow> = {};
    for (const b of data) next[b.provider] = b;
    setDraft(next);
  }, [data]);

  const rows = useMemo(() => PROVIDER_ORDER.map((p) => draft[p] || { provider: p, monthlyBudgetUSD: 0, dailyBudgetUSD: 0, hardStop: false }), [draft]);

  const update = (provider: Provider, patch: Partial<BudgetRow>) => {
    setDraft((d) => ({ ...d, [provider]: { ...d[provider], provider, ...patch, monthlyBudgetUSD: d[provider]?.monthlyBudgetUSD ?? 0, dailyBudgetUSD: d[provider]?.dailyBudgetUSD ?? 0, hardStop: d[provider]?.hardStop ?? false, ...patch } as BudgetRow }));
  };

  const saveRow = async (row: BudgetRow) => {
    try {
      await save.mutateAsync(row);
      setSavedId(row.provider);
      setTimeout(() => setSavedId(null), 2500);
    } catch {
      // surfaced via save.error
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 flex items-start gap-2.5 text-sm text-slate-400">
        <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
        <p>
          Budgets are evaluated against the <strong className="text-slate-200">local cost estimate</strong> computed by
          the logger. When <strong className="text-slate-200">Hard stop</strong> is enabled and the limit is exceeded,
          outbound provider calls for that provider return <span className="font-mono text-amber-300">503 PROVIDER_BLOCKED_BUDGET_*</span>.
          Leave a limit at <span className="font-mono">0</span> to disable that cap.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const meta = PROVIDER_META[row.provider];
            const Icon = meta.icon;
            const server = (data || []).find((b) => b.provider === row.provider);
            const dirty = JSON.stringify(server) !== JSON.stringify(row);
            return (
              <div key={row.provider} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-slate-800/80 p-2 rounded-lg">
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white">{meta.label}</h3>
                    <p className="text-[11px] text-slate-500">{meta.description}</p>
                  </div>
                  {savedId === row.provider && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                  <Field
                    label="Monthly cap (USD)"
                    hint={row.monthlyBudgetUSD > 0 ? fmtUSD(row.monthlyBudgetUSD) : 'No cap'}
                    value={row.monthlyBudgetUSD}
                    onChange={(v) => update(row.provider, { monthlyBudgetUSD: v })}
                  />
                  <Field
                    label="Daily cap (USD)"
                    hint={row.dailyBudgetUSD > 0 ? fmtUSD(row.dailyBudgetUSD) : 'No cap'}
                    value={row.dailyBudgetUSD}
                    onChange={(v) => update(row.provider, { dailyBudgetUSD: v })}
                  />
                  <div className="flex flex-col">
                    <label className="block text-[11px] font-medium text-slate-400 mb-1.5">Hard stop</label>
                    <button
                      onClick={() => update(row.provider, { hardStop: !row.hardStop })}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors
                        ${row.hardStop
                          ? 'bg-red-500/10 border-red-500/30 text-red-300'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'}
                      `}
                    >
                      <span className="inline-flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {row.hardStop ? 'Enforced (blocks when exceeded)' : 'Off (log only)'}
                      </span>
                      <span className={`w-8 h-4 rounded-full p-0.5 transition-colors ${row.hardStop ? 'bg-red-500/50' : 'bg-slate-700'}`}>
                        <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${row.hardStop ? 'translate-x-4' : ''}`} />
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => saveRow(row)}
                    disabled={!dirty || save.isPending}
                    className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${dirty
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-slate-800/60 text-slate-500 border border-slate-800 cursor-not-allowed'}
                    `}
                  >
                    {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {save.isPending ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 text-xs">$</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-full pl-6 pr-3 py-2 bg-slate-900/60 border border-slate-800 text-slate-200 text-sm rounded-lg focus:outline-none focus:border-amber-500/50 font-mono"
        />
      </div>
      <div className="text-[10px] text-slate-500 mt-1">{hint}</div>
    </div>
  );
}
