import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { listIdentities, type IdentityListRow } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const PERSONA_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'customer', label: 'Customers' },
  { id: 'courier', label: 'Couriers' },
  { id: 'merchant_owner', label: 'Merchant owners' },
  { id: 'merchant_staff', label: 'Merchant staff' },
] as const;

export function IdentityDirectoryPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [persona, setPersona] = useState<string>('all');
  const [rows, setRows] = useState<IdentityListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      void listIdentities(session.access_token, {
        q: q || undefined,
        persona: persona === 'all' ? undefined : persona,
      })
        .then((res) => setRows(res.identities))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [session.access_token, q, persona]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Users</h2>
      <p className="text-sm text-slate-400">All people across Rush, Courier, and Partner — one directory.</p>
      <div className="flex flex-wrap gap-2">
        {PERSONA_FILTERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPersona(p.id)}
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
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search email, phone, or name…"
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>
      {loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
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
                  <td className="px-4 py-3 text-slate-400">
                    {(row.personas ?? []).map((p) => p.persona).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{row.global_status || 'active'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
