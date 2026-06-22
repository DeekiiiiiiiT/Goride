import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { listDashTeam } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function DashTeamPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Array<{ userId: string; email: string; role: string }>>([]);

  useEffect(() => {
    void listDashTeam(session.access_token)
      .then((res) => setMembers(res.members))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session.access_token]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Dash admin team</h2>
        <p className="text-sm text-slate-400">Users with dash_admin or dash_ops roles</p>
      </div>
      {loading ? (
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((m) => (
                <tr key={m.userId}>
                  <td className="px-4 py-3 text-white">{m.email || m.userId}</td>
                  <td className="px-4 py-3 text-slate-300">{m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">Provision new admins via Dominion Platform Team or provision_product_admin.sql</p>
    </div>
  );
}
