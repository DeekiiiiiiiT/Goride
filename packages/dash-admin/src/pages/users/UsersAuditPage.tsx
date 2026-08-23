import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { listIdentityAuditEvents, type AuditEvent } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const PAGE_SIZE = 50;

export function UsersAuditPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    setLoading(true);
    void listIdentityAuditEvents(session.access_token, {
      page,
      limit: PAGE_SIZE,
      action: actionFilter || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((res) => {
        setEvents(res.events ?? []);
        setTotal(res.total);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load audit'))
      .finally(() => setLoading(false));
  }, [session.access_token, page, actionFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = () => {
    const headers = ['created_at', 'action', 'actor_id', 'target_id', 'reason', 'permission_key'];
    const lines = events.map((e) => [
      e.created_at,
      e.action,
      e.actor_user_id ?? e.actor_id ?? '',
      e.target_user_id ?? e.target_id ?? '',
      e.reason ?? '',
      e.permission_key ?? '',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Audit log</h2>
        <p className="text-sm text-slate-400">Unified permission audit trail for admin actions.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          placeholder="Filter by action…"
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
        />
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-slate-800 text-slate-300"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      <p className="text-xs text-slate-500">{total} events · page {page} of {totalPages}</p>

      {loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                    {(e.actor_user_id ?? e.actor_id ?? '').slice(0, 8)}…
                  </td>
                  <td className="px-4 py-3 text-slate-300">{e.action}</td>
                  <td className="px-4 py-3">
                    {(e.target_user_id ?? e.target_id) ? (
                      <Link
                        to={`/users/${e.target_user_id ?? e.target_id}`}
                        className="text-emerald-400 hover:underline font-mono text-xs"
                      >
                        {(e.target_user_id ?? e.target_id ?? '').slice(0, 8)}…
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 max-w-xs truncate">{e.reason ?? '—'}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No events</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
