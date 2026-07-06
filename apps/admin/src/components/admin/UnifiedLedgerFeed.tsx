import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import {
  fetchUnifiedLedgerFeed,
  fetchUnifiedLedgerReconciliation,
  type IslandReconciliation,
  type UnifiedLedgerEntry,
} from '../../services/unifiedLedgerService';

type Props = {
  onBack: () => void;
};

function formatMinor(amount: number, currency: string): string {
  const major = amount / 100;
  return `${currency} ${major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function UnifiedLedgerFeed({ onBack }: Props) {
  const { session } = useAuth();
  const token = session?.access_token ?? '';

  const [entries, setEntries] = useState<UnifiedLedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [product, setProduct] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [islands, setIslands] = useState<IslandReconciliation[]>([]);
  const [reconHealthy, setReconHealthy] = useState<boolean | null>(null);
  const [reconError, setReconError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUnifiedLedgerFeed(token, {
        page,
        limit: 50,
        product: product || undefined,
      });
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load unified ledger');
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [token, page, product]);

  const loadReconciliation = useCallback(async () => {
    if (!token) return;
    setReconError(null);
    try {
      const data = await fetchUnifiedLedgerReconciliation(token);
      setIslands(data.islands);
      setReconHealthy(data.healthy);
    } catch (e) {
      setReconError(e instanceof Error ? e.message : 'Reconciliation failed');
      setIslands([]);
      setReconHealthy(null);
    }
  }, [token]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    void loadReconciliation();
  }, [loadReconciliation]);

  const refreshAll = () => {
    void loadFeed();
    void loadReconciliation();
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex-1">
          Unified Ledger Feed
        </h2>
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Platform-wide double-entry ledger across rides, fleet, and Dash. Feed requires{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">LEDGER_READ_UNIFIED=1</code>{' '}
        on the rides Edge function; dual-write requires{' '}
        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1 rounded">LEDGER_DUAL_WRITE_ENABLED=1</code>.
      </p>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          {reconHealthy === true && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          {reconHealthy === false && <AlertTriangle className="w-5 h-5 text-amber-500" />}
          <h3 className="font-medium text-slate-900 dark:text-white">Island reconciliation</h3>
        </div>
        {reconError && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{reconError}</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-4">Source system</th>
                <th className="py-2 pr-4">Unified receipts</th>
                <th className="py-2 pr-4">Legacy count</th>
                <th className="py-2">Delta</th>
              </tr>
            </thead>
            <tbody>
              {islands.map((row) => (
                <tr key={row.source_system} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-4 font-mono text-xs">{row.source_system}</td>
                  <td className="py-2 pr-4">{row.unified_count}</td>
                  <td className="py-2 pr-4">{row.legacy_count}</td>
                  <td className={`py-2 ${row.delta !== 0 ? 'text-amber-600 font-medium' : ''}`}>
                    {row.delta}
                  </td>
                </tr>
              ))}
              {islands.length === 0 && !reconError && (
                <tr>
                  <td colSpan={4} className="py-4 text-slate-500">No reconciliation data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-4">
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="text-sm">
            <span className="block text-slate-500 mb-1">Product</span>
            <select
              value={product}
              onChange={(e) => { setProduct(e.target.value); setPage(1); }}
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
            >
              <option value="">All</option>
              <option value="rides">Rides</option>
              <option value="fleet">Fleet</option>
              <option value="dash">Dash</option>
              <option value="platform">Platform</option>
            </select>
          </label>
          <p className="text-sm text-slate-500 ml-auto">{total} entries</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
            {error.includes('feature_disabled') && (
              <span> — enable LEDGER_READ_UNIFIED on the rides function.</span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-700">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(row.effective_at)}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{row.entry_type}</td>
                  <td className="py-2 pr-3">{row.product}</td>
                  <td className="py-2 pr-3">{formatMinor(row.amount_minor, row.currency)}</td>
                  <td className="py-2 pr-3 font-mono text-xs truncate max-w-[12rem]">
                    {row.reference_type ? `${row.reference_type}:${row.reference_id ?? ''}` : '—'}
                  </td>
                </tr>
              ))}
              {!loading && entries.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    No unified ledger entries yet. Turn on dual-write to populate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 50 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500 self-center">Page {page}</span>
            <button
              type="button"
              disabled={page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border text-sm disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
