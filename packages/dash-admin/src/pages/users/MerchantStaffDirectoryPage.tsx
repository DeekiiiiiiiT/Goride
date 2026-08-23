import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { revokeMerchantStaff } from '@roam/dash-admin-client';
import { dashAdminFetch } from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { useDashAdminAccess } from '../../hooks/useDashAdminAccess';

type StaffRow = {
  id: string;
  user_id: string | null;
  merchant_id: string;
  role: string;
  name?: string | null;
  email?: string | null;
  merchants?: { name?: string };
  identities?: { display_name?: string; primary_email?: string } | null;
};

export function MerchantStaffDirectoryPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const { hasPermission } = useDashAdminAccess();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    void dashAdminFetch<{ staff: StaffRow[] }>(session.access_token, '/merchant-staff')
      .then((res) => setRows(res.staff ?? []))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [session.access_token]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const term = q.toLowerCase();
    return (
      String(r.merchants?.name ?? '').toLowerCase().includes(term)
      || String(r.identities?.primary_email ?? r.email ?? '').toLowerCase().includes(term)
      || String(r.identities?.display_name ?? r.name ?? '').toLowerCase().includes(term)
      || String(r.role).toLowerCase().includes(term)
    );
  });

  const personLabel = (r: StaffRow) =>
    r.identities?.display_name
    || r.name
    || r.identities?.primary_email
    || r.email
    || (r.user_id ? r.user_id.slice(0, 8) : 'Pending invite');

  const handleRevoke = async (memberId: string) => {
    const values = await prompt({
      title: 'Revoke staff access',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Reason', required: true, multiline: true }],
    });
    if (!values?.reason) return;
    try {
      await revokeMerchantStaff(session.access_token, memberId, values.reason);
      toast.success('Revoked');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Merchant staff</h2>
        <p className="text-sm text-slate-400">Cross-store staff visibility and revoke.</p>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search store, person, role…"
        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
      />
      {loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Person</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    {r.user_id ? (
                      <Link to={`/users/${r.user_id}`} className="text-emerald-400 hover:underline">
                        {personLabel(r)}
                      </Link>
                    ) : (
                      <span className="text-slate-300">{personLabel(r)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    <Link to={`/merchants/${r.merchant_id}`} className="hover:underline">
                      {r.merchants?.name ?? r.merchant_id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{r.role}</td>
                  <td className="px-4 py-3 text-right">
                    {hasPermission('merchant.staff.revoke') && (
                      <button
                        type="button"
                        className="text-red-400 text-xs hover:underline"
                        onClick={() => void handleRevoke(r.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">No staff found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
