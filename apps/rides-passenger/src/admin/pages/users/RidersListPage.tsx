import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { RiderAccountStatus, RiderDirectoryRow } from '@roam/types/rides';
import { listRiders } from '../../services/ridesAdminService';

const PAGE_SIZE = 50;

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'banned', label: 'Banned' },
];

interface OutletContext {
  session: Session;
  role: string | undefined;
}

function StatusBadge({ status }: { status: RiderAccountStatus }) {
  const styles =
    status === 'active'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'suspended'
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : 'bg-red-500/15 text-red-300 border-red-500/30';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {status}
    </span>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-JM', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function RidersListPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;

  const [riders, setRiders] = useState<RiderDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('last_ride');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await listRiders(accessToken, {
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        sort,
        page,
        limit: PAGE_SIZE,
      });
      setRiders(res.riders);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load riders');
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, status, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">User Management</h2>
        <p className="text-sm text-slate-400 mt-1">
          Search riders, view trip history, and manage account status.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
            placeholder="Email, phone, name, or user ID…"
            className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>
        <button
          type="button"
          onClick={applySearch}
          className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500"
        >
          Search
        </button>
        <select
          value={sort}
          onChange={(e) => {
            setPage(1);
            setSort(e.target.value);
          }}
          className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sm text-white"
        >
          <option value="last_ride">Last ride</option>
          <option value="trips">Total trips</option>
          <option value="signup">Signup date</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(f.id);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              status === f.id
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                : 'border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/40">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading riders…
          </div>
        ) : riders.length === 0 ? (
          <p className="text-center py-16 text-slate-500 text-sm">No riders match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-slate-500">
                  <th className="px-4 py-3 font-medium">Rider</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Trips</th>
                  <th className="px-4 py-3 font-medium">Last ride</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr
                    key={r.user_id}
                    onClick={() => navigate(`/admin/users/${r.user_id}`)}
                    className="border-b border-slate-800/80 hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-white truncate max-w-[200px]">
                        {r.display_name || r.email || 'Unnamed rider'}
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-[220px]">
                        {r.email ?? r.user_id}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{r.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.account_status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-300">{r.total_trips}</td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {formatWhen(r.last_ride_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {formatWhen(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>
            {total} rider{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 disabled:opacity-40 hover:bg-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
