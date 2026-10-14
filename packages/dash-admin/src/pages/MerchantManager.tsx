import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  getMerchantHealth,
  listIncompleteSetup,
  listMerchants,
  type DashMerchant,
  type IncompleteSetupRow,
  type MerchantVerificationStatus,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../DashAdminPortal';

type TabId = 'all' | MerchantVerificationStatus | 'incomplete_setup' | 'regulated' | 'live' | 'suspended' | 'deactivated';

export function MerchantManager({ mode = 'applications' }: { mode?: 'directory' | 'applications' }) {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const accessToken = session.access_token;

  const [params, setParams] = useSearchParams();
  const defaultTab: TabId = mode === 'directory' ? 'live' : 'pending';
  const tab = (params.get('status') as TabId | null) || defaultTab;
  const searchInput = params.get('q') || '';
  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set('status', id);
    setParams(next, { replace: true });
  };
  const setSearchInput = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('q', value);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<DashMerchant[]>([]);
  const [incompleteItems, setIncompleteItems] = useState<IncompleteSetupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    pending: 0, in_review: 0, docs_requested: 0, approved: 0, rejected: 0,
  });
  const [orders7d, setOrders7d] = useState<Record<string, number>>({});
  const [incompleteCount, setIncompleteCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void listIncompleteSetup(accessToken, { limit: 1 })
      .then((res) => setIncompleteCount(res.counts.total))
      .catch(() => setIncompleteCount(0));
  }, [accessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'incomplete_setup') {
        const res = await listIncompleteSetup(accessToken, {
          q: debouncedSearch || undefined,
          limit: 100,
        });
        setIncompleteItems(res.items);
        setTotal(res.total);
        setIncompleteCount(res.counts.total);
        setItems([]);
      } else {
        const res = await listMerchants(accessToken, {
          status: tab === 'regulated' || tab === 'live' || tab === 'deactivated' || tab === 'suspended' ? (tab === 'live' || tab === 'deactivated' || tab === 'suspended' ? 'approved' : 'all') : tab,
          operational_status: tab === 'suspended' ? 'suspended' : tab === 'deactivated' ? 'deactivated' : tab === 'live' ? 'active' : undefined,
          vertical_in: tab === 'regulated' ? 'pharmacy,alcohol' : undefined,
          search: debouncedSearch || undefined,
          limit: 100,
        });
        setItems(res.merchants);
        setTotal(res.total);
        setCounts(res.counts);
        setIncompleteItems([]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load merchants');
    } finally {
      setLoading(false);
    }
  }, [accessToken, tab, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (mode !== 'directory' || items.length === 0) return;
    void getMerchantHealth(accessToken, items.map((item) => item.id))
      .then((res) => {
        const next: Record<string, number> = {};
        for (const [id, row] of Object.entries(res.health || {})) next[id] = row.orders7d;
        setOrders7d(next);
      })
      .catch(() => setOrders7d({}));
  }, [accessToken, items, mode]);

  const tabs: { id: TabId; label: string }[] = mode === 'directory'
    ? [
        { id: 'live', label: 'Live' },
        { id: 'suspended', label: 'Suspended' },
        { id: 'deactivated', label: 'Deactivated' },
      ]
    : [
        { id: 'incomplete_setup', label: 'Unfinished setup' },
        { id: 'regulated', label: 'Regulated' },
        { id: 'pending', label: 'Pending' },
        { id: 'in_review', label: 'In review' },
        { id: 'docs_requested', label: 'Docs requested' },
        { id: 'rejected', label: 'Rejected' },
      ];

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{total} total</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
            {t.id === 'incomplete_setup' && incompleteCount > 0 && (
              <span className="ml-1.5 opacity-70">({incompleteCount})</span>
            )}
            {t.id !== 'all' && t.id !== 'incomplete_setup' && counts[t.id as keyof typeof counts] != null && (
              <span className="ml-1.5 opacity-70">({counts[t.id as keyof typeof counts]})</span>
            )}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={
            tab === 'incomplete_setup'
              ? 'Search email or restaurant name...'
              : 'Search name, email, phone, address...'
          }
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : tab === 'incomplete_setup' ? (
        incompleteItems.length === 0 ? (
          <p className="text-slate-400 text-center py-12">
            No unfinished partner signups. Only users who sign into the partner portal appear here — not riders or drivers.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Restaurant</th>
                  <th className="px-4 py-3 font-medium">Verification</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Missing steps</th>
                  <th className="px-4 py-3 font-medium">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {incompleteItems.map((row) => (
                  <tr
                    key={row.merchantId ?? row.userId}
                    onClick={() => {
                      if (row.merchantId) navigate(`/merchants/${row.merchantId}`);
                    }}
                    className={row.merchantId ? 'hover:bg-slate-800/50 cursor-pointer' : ''}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">
                        {row.merchantName || row.ownerEmail || 'Unknown'}
                      </p>
                      <p className="text-slate-500 text-xs">
                        {row.kind === 'draft' ? 'Draft application' : row.ownerEmail || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {row.kind === 'draft' ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">
                          Draft
                        </span>
                      ) : row.verificationStatus ? (
                        <StatusBadge value={row.verificationStatus as MerchantVerificationStatus} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{row.setupStage}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {row.missingSteps.length ? (
                        <ul className="list-disc list-inside space-y-0.5 text-xs">
                          {row.missingSteps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(row.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : items.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No merchants found.</p>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">Verification</th>
                <th className="px-4 py-3 font-medium">Operations</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                {mode === 'directory' && (
                  <>
                    <th className="px-4 py-3 font-medium">Online</th>
                    <th className="px-4 py-3 font-medium">Prep</th>
                    <th className="px-4 py-3 font-medium">Orders 7d</th>
                    <th className="px-4 py-3 font-medium">Rating</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950">
              {items.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/merchants/${m.id}`)}
                  className="hover:bg-slate-800/50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{m.name}</p>
                    <p className="text-slate-500 text-xs">{m.email || m.phone || '—'}</p>
                    {m.vertical_type && (
                      <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">
                        {m.vertical_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={m.verification_status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      m.operational_status === 'suspended'
                        ? 'bg-red-500/15 text-red-300'
                        : m.operational_status === 'deactivated'
                        ? 'bg-slate-600/30 text-slate-400'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}>
                      {m.operational_status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {m.submitted_at ? new Date(m.submitted_at).toLocaleDateString() : '—'}
                  </td>
                  {mode === 'directory' && (
                    <>
                      <td className="px-4 py-3 text-slate-300">{m.is_accepting_orders ? 'Yes' : 'No'}</td>
                      <td className="px-4 py-3 text-slate-300">{m.avg_prep_time_mins != null ? `${m.avg_prep_time_mins} min` : '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{orders7d[m.id] ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{m.rating != null ? Number(m.rating).toFixed(1) : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
