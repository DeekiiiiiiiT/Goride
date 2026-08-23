import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Search, Download } from 'lucide-react';
import { toast } from 'sonner';
import { listIdentities, type IdentityListRow } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { IdentityStatusBadge, PersonaChip } from './components/IdentityStatusBadge';
import { useDashAdminAccess } from '../../hooks/useDashAdminAccess';

const PERSONA_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'customer', label: 'Customers' },
  { id: 'courier', label: 'Couriers' },
  { id: 'merchant_owner', label: 'Merchant owners' },
  { id: 'merchant_staff', label: 'Merchant staff' },
] as const;

const PAGE_SIZE = 50;

export function IdentityDirectoryPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { hasPermission } = useDashAdminAccess();
  const [q, setQ] = useState('');
  const [persona, setPersona] = useState<string>('all');
  const [rows, setRows] = useState<IdentityListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError(null);
      void listIdentities(session.access_token, {
        q: q || undefined,
        persona: persona === 'all' ? undefined : persona,
        page,
        limit: PAGE_SIZE,
        sort: 'updated_at',
        order: 'desc',
      })
        .then((res) => {
          setRows(res.identities);
          setTotal(res.total);
        })
        .catch((e) => {
          setError(e instanceof Error ? e.message : 'Failed to load');
          setRows([]);
          setTotal(0);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [session.access_token, q, persona, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = () => {
    const headers = ['user_id', 'display_name', 'email', 'phone', 'global_status', 'personas'];
    const lines = rows.map((r) => [
      r.user_id,
      r.display_name ?? '',
      r.primary_email ?? '',
      r.primary_phone ?? '',
      r.global_status,
      (r.personas ?? []).map((p) => p.persona).join(';'),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users-directory.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Users</h2>
          <p className="text-sm text-slate-400">
            All people across Rush, Courier, and Partner — one directory.
          </p>
        </div>
        {hasPermission('identity.pii.read') && rows.length > 0 && (
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 hover:text-white"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {PERSONA_FILTERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setPersona(p.id); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              persona === p.id ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search email, phone, name, or order number…"
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      {!loading && !error && (
        <p className="text-xs text-slate-500">
          {total} people · page {page} of {totalPages}
        </p>
      )}

      {loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-800 p-8 text-center text-slate-500">
          No people match your search.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Personas</th>
                <th className="px-4 py-3">Global</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr
                  key={row.user_id}
                  onClick={() => navigate(`/users/${row.user_id}`)}
                  className="hover:bg-slate-800/50 cursor-pointer"
                >
                  <td className="px-4 py-3 text-white">{row.display_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{row.primary_email || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{row.primary_phone || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.personas ?? []).map((p) => (
                        <PersonaChip key={`${p.persona}-${p.ref_id}`} persona={p.persona} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <IdentityStatusBadge status={row.global_status || 'active'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-slate-300 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <span className="text-sm text-slate-400">{page} / {totalPages}</span>
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
