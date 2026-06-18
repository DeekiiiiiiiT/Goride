import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { listDrivers } from '../../../services/platform/driverPlatformService';

interface DriverUsersPageProps {
  onOpenUser: (userId: string) => void;
}

export function DriverUsersPage({ onOpenUser }: DriverUsersPageProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, isLoading, error } = useQuery({
    queryKey: ['platformDriverUsers', token, q, page],
    queryFn: () =>
      listDrivers(token!, {
        q: q.trim() || undefined,
        page,
        limit,
        sort: 'created_at',
      }),
    enabled: !!token,
    staleTime: 30_000,
  });

  const rows = data?.drivers ?? [];

  const errMsg = useMemo(() => (error instanceof Error ? error.message : null), [error]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Roam Driver product directory (driver Edge function). Open a profile for lifecycle actions or fleet linking.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, phone…"
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-sm text-slate-900 placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-600"
          />
        </div>
      </div>

      {errMsg && (
        <div className="text-sm text-red-400 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2">
          {errMsg}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-12">No drivers match this query.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 dark:bg-slate-900/90 dark:border-slate-800">
              <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Status</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Mode</th>
                <th className="px-4 py-3 font-medium text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {rows.map((d) => (
                <tr key={d.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <p className="text-slate-900 dark:text-slate-900 dark:text-slate-900 dark:text-white font-medium">{d.display_name || '—'}</p>
                    <p className="text-xs text-slate-500">{d.email}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span
                      className={`text-xs ${
                        d.status === 'active' ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs capitalize">{d.mode}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenUser(d.user_id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300"
                    >
                      Details
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(data?.total ?? 0) > limit && (
        <div className="flex justify-between items-center text-xs text-slate-500">
          <span>
            Page {page} · {data?.total ?? 0} total
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 dark:border-slate-800"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page * limit >= (data?.total ?? 0)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40 dark:border-slate-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
