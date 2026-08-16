import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Search, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { listActivityLog, type ActivityLogRow } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

const PAGE_SIZE = 50;

function when(iso: string) {
  return new Intl.DateTimeFormat('en-JM', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function ActivityLogPage() {
  const { session } = useOutletContext<AdminOutletContext>();

  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listActivityLog(session.access_token, {
        q: q || undefined,
        page,
        limit: PAGE_SIZE,
      });
      setRows(res.events);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load activity');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [session.access_token, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          Activity Log
        </h2>
        <p className="text-sm text-slate-400 mt-1">Audit trail of admin actions across the Rush console.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="search"
          placeholder="Search actor, action, entity…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1);
              setQ(input.trim());
            }
          }}
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center text-slate-500 text-sm">
          No activity recorded.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{when(r.created_at)}</td>
                  <td className="px-4 py-3 text-slate-300">{r.actor_email ?? r.actor_id ?? 'system'}</td>
                  <td className="px-4 py-3 text-white capitalize">{r.action.replace(/[_.]/g, ' ')}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {r.entity_type
                      ? `${r.entity_type}${r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}`
                      : r.target_id
                        ? String(r.target_id).slice(0, 12)
                        : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{r.notes ?? r.details ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm text-slate-500">
        <span>{total} events · page {page} of {totalPages}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border border-slate-700 rounded disabled:opacity-40">Prev</button>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border border-slate-700 rounded disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
