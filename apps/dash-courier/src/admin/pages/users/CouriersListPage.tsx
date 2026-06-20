import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, Search, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { CourierAccountStatus, CourierDirectoryRow, CourierLiveStatus } from '@roam/types/courier';
import { listCouriers } from '../../services/courierAdminService';

const PAGE_SIZE = 50;

interface OutletContext {
  session: Session;
}

function AccountBadge({ status }: { status: CourierAccountStatus }) {
  const styles =
    status === 'active'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : status === 'pending'
        ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
        : status === 'suspended'
          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
          : 'bg-red-500/15 text-red-300 border-red-500/30';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border ${styles}`}>
      {status}
    </span>
  );
}

function LiveDot({ status }: { status: CourierLiveStatus }) {
  const color =
    status === 'online' ? 'bg-emerald-400' : status === 'on_delivery' ? 'bg-amber-400' : 'bg-slate-600';
  const label = status === 'on_delivery' ? 'On delivery' : status === 'online' ? 'Online' : 'Offline';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function CouriersListPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<OutletContext>();
  const accessToken = session.access_token;

  const [couriers, setCouriers] = useState<CourierDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [liveStatus, setLiveStatus] = useState('all');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await listCouriers(accessToken, {
        q: search || undefined,
        status: status === 'all' ? undefined : status,
        live_status: liveStatus === 'all' ? undefined : liveStatus,
        page,
        limit: PAGE_SIZE,
      });
      setCouriers(res.couriers);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load couriers');
      setCouriers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, status, liveStatus, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">User Management</h2>
        <p className="text-sm text-slate-400 mt-1">Courier directory, live status, and account actions.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="search"
            placeholder="Search name, email, phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setPage(1);
                setSearch(searchInput.trim());
              }
            }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
        >
          <option value="all">All accounts</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <select
          value={liveStatus}
          onChange={(e) => {
            setPage(1);
            setLiveStatus(e.target.value);
          }}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
        >
          <option value="all">Any live status</option>
          <option value="online">Online</option>
          <option value="on_delivery">On delivery</option>
          <option value="offline">Offline</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Courier</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Live</th>
                <th className="px-4 py-3 font-medium">Deliveries</th>
                <th className="px-4 py-3 font-medium w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {couriers.map((c) => (
                <tr key={c.user_id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-left text-white hover:text-emerald-300"
                      onClick={() => navigate(`/users/${c.user_id}`)}
                    >
                      {c.display_name || c.email || 'Unnamed courier'}
                      <p className="text-xs text-slate-500">{c.email}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <AccountBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3">
                    <LiveDot status={c.live_status} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">{c.total_deliveries}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      title="View detail"
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
                      onClick={() => navigate(`/users/${c.user_id}`)}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          {total} courier{total === 1 ? '' : 's'} · page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 rounded border border-slate-700 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 rounded border border-slate-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
