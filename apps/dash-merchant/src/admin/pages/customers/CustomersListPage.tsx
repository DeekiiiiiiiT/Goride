import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { listCustomers } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function CustomersListPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      void listCustomers(session.access_token, { q: q || undefined })
        .then((res) => setCustomers((res as { customers: Array<Record<string, unknown>> }).customers))
        .catch(console.error)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [session.access_token, q]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-white">Customers</h2>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers..." className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white" />
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
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {customers.map((c) => (
                <tr key={String(c.id)} onClick={() => navigate(`/customers/${c.id}`)} className="hover:bg-slate-800/50 cursor-pointer">
                  <td className="px-4 py-3 text-white">{String(c.name || '—')}</td>
                  <td className="px-4 py-3 text-slate-300">{String((c as { authEmail?: string }).authEmail || c.email || '—')}</td>
                  <td className="px-4 py-3 text-slate-400">{String(c.account_status || 'active')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
