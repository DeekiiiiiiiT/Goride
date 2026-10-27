// Stitch: dominion-redesign/99a841f692104aeb9e98c442c92c5244
import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Info,
  Loader2,
  MemoryStick,
  Percent,
  RefreshCw,
  Search,
} from 'lucide-react';
import { gctAdminService, type GctHealth } from '../../../services/gctAdminService';

export function GctEnginePage() {
  const [health, setHealth] = useState<GctHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await gctAdminService.health());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load GCT health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fromEngine = Boolean(health?.fromDb);
  const gctOn =
    health?.resolverFlags &&
    typeof health.resolverFlags === 'object' &&
    (health.resolverFlags as { gct_enabled?: boolean }).gct_enabled !== false;
  const running = fromEngine && gctOn !== false;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-8 py-7 text-slate-900">
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Master data</span>
          <span className="text-slate-400">/</span>
          <span>Tax and Vendors</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-900">GCT engine</span>
        </nav>
        <div className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-800">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          <span>REGION: JM-KGN</span>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">GCT engine</h1>
            <p className="text-sm text-slate-500">How tax is calculated. The books stay in Back office.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden />
            )}
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-4">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                <MemoryStick className="h-[19px] w-[19px]" aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Engine</h2>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span className="relative flex h-2 w-2">
                    {running ? (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    ) : null}
                    <span
                      className={`relative inline-flex h-2 w-2 rounded-full ${
                        running ? 'bg-emerald-600' : 'bg-slate-400'
                      }`}
                    />
                  </span>
                  <span className={`font-medium ${running ? 'text-emerald-800' : 'text-slate-600'}`}>
                    {loading ? 'Checking…' : running ? 'Running' : 'Standby'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-900">{health?.gctEnabled ? 'On' : 'Off'}</span>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(health?.gctEnabled)}
                className={`flex h-6 w-11 items-center rounded-full p-0.5 shadow-inner transition-colors ${
                  health?.gctEnabled ? 'justify-end bg-blue-600' : 'justify-start bg-slate-200'
                }`}
                title="GCT enable is managed via resolver flags"
              >
                <span className="block h-5 w-5 rounded-full bg-white shadow" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3 font-mono text-xs text-slate-500">
            <div className="flex items-center gap-1.5 rounded border border-slate-200/70 bg-slate-50 px-2.5 py-1">
              <span className="text-[10px] font-semibold text-slate-400">CORE:</span>
              <span className="font-medium text-slate-800">GCT-CALC-V2.1</span>
            </div>
            <div className="flex items-center gap-1.5 rounded border border-slate-200/70 bg-slate-50 px-2.5 py-1">
              <span className="text-[10px] font-semibold text-slate-400">RATE:</span>
              <span className="font-medium text-slate-800">
                {health?.effectiveRatePercent != null ? `${health.effectiveRatePercent}%` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded border border-slate-200/70 bg-slate-50 px-2.5 py-1">
              <span className="text-[10px] font-semibold text-slate-400">LOCALE:</span>
              <span className="font-medium text-slate-800">JMD CURRENCY ENGINE</span>
            </div>
            <div className="flex items-center gap-1.5 rounded border border-slate-200/70 bg-slate-50 px-2.5 py-1">
              <span className="text-[10px] font-semibold text-slate-400">PARISH:</span>
              <span className="font-medium text-slate-800">KINGSTON (JM-01)</span>
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <Percent className="h-[19px] w-[19px]" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Rates and classes</h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-medium text-slate-500">
                <tr>
                  <th className="w-1/2 px-4 py-2.5 font-semibold" scope="col">
                    Class
                  </th>
                  <th className="w-1/2 px-4 py-2.5 font-semibold" scope="col">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Standard</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                    {health?.dbStandardRatePercent != null
                      ? `${health.dbStandardRatePercent}%`
                      : health?.effectiveRatePercent != null
                        ? `${health.effectiveRatePercent}%`
                        : '15%'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <Info className="h-4 w-4 text-slate-400" aria-hidden />
            <span>The data is not in yet</span>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <BookOpen className="h-[19px] w-[19px]" aria-hidden />
            </div>
            <h2 className="text-sm font-semibold text-slate-900">Knowledge base</h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              placeholder="Search tax rules, exemptions, circulars..."
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            <div className="bg-white p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900">Standard GCT</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  REF: TAJ-GCT-01
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">The data is not in yet.</p>
            </div>
            {health?.needsReviewEntities?.length ? (
              <div className="bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">Entities needing review</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {health.needsReviewEntities.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Open periods: {health.openPeriodCount}
                  {(health.orphanOutputCount || health.orphanInputCount)
                    ? ` · Orphans: ${(health.orphanOutputCount ?? 0) + (health.orphanInputCount ?? 0)}`
                    : ''}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <footer className="flex items-center justify-between border-t border-slate-200/80 pb-6 pt-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" aria-hidden />
          <span>The data is not in yet.</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">LOC: KINGSTON / PARISH REGISTRY JMD</div>
      </footer>
    </div>
  );
}
