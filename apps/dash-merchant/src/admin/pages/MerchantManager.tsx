import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { MerchantStatusBadge } from '../components/MerchantStatusBadge';
import { listMerchants, type DashMerchant, type MerchantVerificationStatus } from '../services/dashAdminService';
import type { AdminOutletContext } from '../DashAdminPortal';

type TabId = 'all' | MerchantVerificationStatus;

export function MerchantManager() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const accessToken = session.access_token;

  const [tab, setTab] = useState<TabId>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<DashMerchant[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({
    pending: 0, in_review: 0, docs_requested: 0, approved: 0, rejected: 0,
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMerchants(accessToken, {
        status: tab,
        search: debouncedSearch || undefined,
        limit: 100,
      });
      setItems(res.merchants);
      setTotal(res.total);
      setCounts(res.counts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load merchants');
    } finally {
      setLoading(false);
    }
  }, [accessToken, tab, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'pending', label: 'Pending' },
    { id: 'in_review', label: 'In Review' },
    { id: 'docs_requested', label: 'Docs Requested' },
    { id: 'approved', label: 'Approved' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Merchants</h2>
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
            {t.id !== 'all' && counts[t.id as keyof typeof counts] != null && (
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
          placeholder="Search name, email, phone, address..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No merchants found.</p>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Restaurant</th>
                <th className="px-4 py-3 font-medium">Verification</th>
                <th className="px-4 py-3 font-medium">Operations</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {items.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => navigate(`/merchants/${m.id}`)}
                  className="hover:bg-slate-800/50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{m.name}</p>
                    <p className="text-slate-500 text-xs">{m.email || m.phone || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <MerchantStatusBadge status={m.verification_status} />
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
