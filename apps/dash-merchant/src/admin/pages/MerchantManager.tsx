import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Search, Store, Utensils } from 'lucide-react';
import { toast } from 'sonner';
import { MerchantStatusBadge } from '../components/MerchantStatusBadge';
import { MerchantDetailModal } from '../components/MerchantDetailModal';
import {
  listMerchants,
  getMerchantDetail,
  type DashMerchant,
  type MerchantAuditEntry,
  type MerchantHours,
  type MerchantStatusCounts,
  type MerchantVerificationStatus,
} from '../services/dashAdminService';

type TabId = 'all' | MerchantVerificationStatus;

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_review', label: 'In Review' },
  { id: 'docs_requested', label: 'Docs Requested' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface MerchantManagerProps {
  accessToken: string | undefined;
}

export function MerchantManager({ accessToken }: MerchantManagerProps) {
  const [tab, setTab] = useState<TabId>('pending');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [items, setItems] = useState<DashMerchant[]>([]);
  const [counts, setCounts] = useState<MerchantStatusCounts>({
    pending: 0,
    in_review: 0,
    docs_requested: 0,
    approved: 0,
    rejected: 0,
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMerchant, setDetailMerchant] = useState<DashMerchant | null>(null);
  const [detailHours, setDetailHours] = useState<MerchantHours[]>([]);
  const [detailAuditLog, setDetailAuditLog] = useState<MerchantAuditEntry[]>([]);
  const [detailOwnerEmail, setDetailOwnerEmail] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    if (!accessToken) return;
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

  useEffect(() => {
    const interval = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const openDetail = async (merchant: DashMerchant) => {
    if (!accessToken) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailMerchant(merchant);
    setDetailHours([]);
    setDetailAuditLog([]);
    setDetailOwnerEmail('');
    try {
      const res = await getMerchantDetail(accessToken, merchant.id);
      setDetailMerchant(res.merchant);
      setDetailHours(res.hours);
      setDetailAuditLog(res.auditLog);
      setDetailOwnerEmail(res.ownerEmail);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdated = async () => {
    await load();
    if (detailMerchant && accessToken) {
      try {
        const res = await getMerchantDetail(accessToken, detailMerchant.id);
        setDetailMerchant(res.merchant);
        setDetailHours(res.hours);
        setDetailAuditLog(res.auditLog);
        setDetailOwnerEmail(res.ownerEmail);
      } catch {
        // Non-fatal
      }
    }
  };

  const totalAcrossTabs = useMemo(
    () =>
      counts.pending +
      counts.in_review +
      counts.docs_requested +
      counts.approved +
      counts.rejected,
    [counts]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-amber-400/90 mb-1">
            Merchants · Verification
          </p>
          <h1 className="text-2xl font-semibold text-white flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
              <Utensils className="w-5 h-5 text-emerald-400" />
            </span>
            Restaurant applications
          </h1>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Review and approve merchant onboarding. Queue refreshes every minute.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="dash-admin-stat-grid">
        {(
          [
            ['pending', 'Pending', 'pending'],
            ['in_review', 'In Review', 'review'],
            ['docs_requested', 'Docs Requested', 'docs'],
            ['approved', 'Approved', 'approved'],
            ['rejected', 'Rejected', 'rejected'],
          ] as const
        ).map(([key, label, variant]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`dash-admin-stat-card dash-admin-stat-card--${variant} text-left ${
              tab === key ? 'ring-2 ring-white/25 shadow-lg' : ''
            }`}
          >
            <div className="dash-admin-stat-card__label">{label}</div>
            <div className="dash-admin-stat-card__value">{counts[key]}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-slate-800/60 rounded-xl border border-slate-700/50">
        {TABS.map((t) => {
          const count =
            t.id === 'all' ? totalAcrossTabs : counts[t.id as MerchantVerificationStatus] ?? 0;
          const highlightPending = t.id === 'pending' && count > 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                tab === t.id
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {t.label}
              <span
                className={`text-[10px] px-1.5 py-0 h-4 flex items-center rounded-full ${
                  highlightPending
                    ? 'bg-amber-500 text-amber-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          placeholder="Search name, email, phone, address..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden bg-slate-900/50 border-slate-800 shadow-xl shadow-black/20">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/30">
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                Logo
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                Name
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden md:table-cell">
                Cuisine
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden lg:table-cell">
                Address
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase hidden sm:table-cell">
                Submitted
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                Status
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-slate-400">
                  <Store className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                  No merchants in this view.
                  {debouncedSearch && ' Try clearing your search.'}
                </td>
              </tr>
            ) : (
              items.map((m) => (
                <tr
                  key={m.id}
                  className="cursor-pointer hover:bg-slate-800/30 border-t border-slate-800"
                  onClick={() => void openDetail(m)}
                >
                  <td className="px-4 py-3">
                    {m.logo_url ? (
                      <img
                        src={m.logo_url}
                        alt=""
                        className="w-10 h-10 rounded-md object-cover border border-slate-700"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                        <Store className="w-4 h-4" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{m.name}</div>
                    {m.email && <div className="text-xs text-slate-400 mt-0.5">{m.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-300 hidden md:table-cell">
                    {m.cuisine_type || '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-slate-400 max-w-[240px] truncate hidden lg:table-cell"
                    title={m.address || ''}
                  >
                    {m.address || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm hidden sm:table-cell">
                    {fmtRelative(m.submitted_at)}
                  </td>
                  <td className="px-4 py-3">
                    <MerchantStatusBadge status={m.verification_status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void openDetail(m);
                      }}
                      className="px-3 py-1.5 text-sm font-medium border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Showing {items.length} of {total} matching merchants.
      </p>

      <MerchantDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        accessToken={accessToken}
        merchant={detailMerchant}
        hours={detailHours}
        auditLog={detailAuditLog}
        ownerEmail={detailOwnerEmail}
        loading={detailLoading}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
