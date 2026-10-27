// Stitch: dominion-redesign/fbf8c52f2d084548bcd49d5121bac668
import { useCallback, useEffect, useState } from 'react';
import { Eye, FolderX, Info, Loader2, ShieldCheck } from 'lucide-react';
import { gctAdminService } from '../../../services/gctAdminService';

export function GctEntitiesPage() {
  const [entities, setEntities] = useState<Array<Record<string, unknown>>>([]);
  const [watchlist, setWatchlist] = useState<Array<Record<string, unknown>>>([]);
  const [threshold, setThreshold] = useState(15_000_000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trnEdits, setTrnEdits] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ent, watch] = await Promise.all([
        gctAdminService.entities(),
        gctAdminService.watchlist(),
      ]);
      setEntities(ent.entities);
      setWatchlist(watch.watchlist);
      setThreshold(watch.thresholdJmd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRegistration(id: string, registered: boolean) {
    const trn = trnEdits[id] ?? '';
    try {
      await gctAdminService.patchEntity(id, {
        trn,
        registered,
        needs_review: false,
        registered_from: registered ? new Date().toISOString().slice(0, 10) : null,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1184px] flex-col space-y-6 p-8 text-slate-900">
      <div>
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 font-mono text-xs text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Back office</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-blue-600">GCT registrations</span>
        </nav>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">GCT registrations</h1>
            <span className="inline-flex items-center rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 font-mono text-xs font-medium text-amber-800">
              Owner only
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-500 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-slate-400" aria-hidden />
            <span>JMD TAX COMPLIANCE ACT</span>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-600">TRN registrations for Roam. Not a customer list.</p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registry Index
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
              {entities.length} ENTRIES
            </span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">JAD-GCT-SPEC 1991</div>
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="select-none border-b border-slate-200 bg-slate-50/75 font-mono text-[11px] uppercase tracking-wider text-slate-600">
                <th className="w-1/4 px-6 py-3 font-semibold" scope="col">TRN</th>
                <th className="w-1/2 px-6 py-3 font-semibold" scope="col">NAME</th>
                <th className="w-1/4 px-6 py-3 text-right font-semibold" scope="col">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-20 text-center">
                    <Loader2 className="inline h-5 w-5 animate-spin text-slate-400" />
                  </td>
                </tr>
              ) : entities.length === 0 ? (
                <tr>
                  <td className="px-6 py-20" colSpan={3}>
                    <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200/60 bg-slate-100 text-slate-400">
                        <FolderX className="h-6 w-6" aria-hidden />
                      </div>
                      <p className="text-sm font-medium text-slate-700">The data is not in yet.</p>
                      <p className="mt-1 font-mono text-xs leading-relaxed text-slate-400">
                        Official General Consumption Tax ledger sync pending validation from Kingston Registry.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entities.map((e) => {
                  const id = String(e.id);
                  return (
                    <tr key={id} className="align-top">
                      <td className="px-6 py-3">
                        <input
                          className="h-8 w-full max-w-[160px] rounded-lg border border-slate-200 bg-slate-50 px-2 font-mono text-xs"
                          defaultValue={String(e.trn || '')}
                          onChange={(ev) =>
                            setTrnEdits((prev) => ({ ...prev, [id]: ev.target.value }))
                          }
                        />
                      </td>
                      <td className="px-6 py-3">
                        <div className="text-sm font-medium text-slate-800">
                          {String(e.entity_type)} · {String(e.entity_id)}
                        </div>
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            onClick={() => void saveRegistration(id, true)}
                          >
                            Mark registered
                          </button>
                          <button
                            type="button"
                            className="rounded px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                            onClick={() => void saveRegistration(id, false)}
                          >
                            Clear
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right text-xs text-slate-600">
                        {e.registered ? 'Registered' : 'Not registered'}
                        {e.needs_review ? (
                          <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            review
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-3 font-mono text-xs text-slate-500">
          <span>PARISH: ST. ANDREW / KINGSTON</span>
          <span>CURRENCY CODE: JMD</span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-200/60 bg-amber-50 text-amber-700">
            <Eye className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-slate-900">Watchlist</h2>
              <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                TAJ-RECONCILIATION · J${threshold.toLocaleString()}
              </span>
            </div>
            {watchlist.length === 0 ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 p-4">
                <span className="text-sm font-medium text-slate-600">The data is not in yet.</span>
                <span className="font-mono text-xs text-slate-400">STATUS: IDLE</span>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {watchlist.map((w) => (
                  <div
                    key={String(w.merchantId)}
                    className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 p-3 text-xs"
                  >
                    <span className="font-mono text-slate-700">{String(w.merchantId)}</span>
                    <span>J${Number(w.rollingSuppliesJmd).toLocaleString()}</span>
                    <span className="font-mono text-slate-500">{String(w.advisory)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Info className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
          <span className="text-sm font-medium text-slate-800">The data is not in yet.</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded border border-blue-200/60 bg-white px-3 py-1 font-mono text-[11px] font-semibold text-slate-700 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          LOC: KINGSTON / PARISH REGISTRY JMD
        </span>
      </div>
    </div>
  );
}
