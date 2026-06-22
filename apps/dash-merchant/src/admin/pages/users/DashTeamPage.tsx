import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin } from '../../utils/dashAdminRoles';
import { listDashTeam, removeDashTeamMember } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function DashTeamPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const canDelete = canDeleteDashAdmin(session.user);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Array<{ userId: string; email: string; role: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listDashTeam(session.access_token);
      setMembers(res.members);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRemove = async (member: { userId: string; email: string; role: string }) => {
    if (!canDelete) return;
    if (member.userId === session.user.id) {
      toast.error('You cannot remove your own admin access');
      return;
    }
    const confirmLabel = member.email || member.userId;
    const values = await prompt({
      title: 'Remove Dash admin access?',
      description: (
        <>
          Revokes <span className="text-white">{confirmLabel}</span>&apos;s{' '}
          <span className="text-white">{member.role}</span> role. Their Roam login and other product
          admin roles are not deleted.
        </>
      ),
      confirmLabel: 'Remove access',
      variant: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Reason',
          placeholder: 'e.g. Left the team',
          required: true,
          multiline: true,
        },
        {
          key: 'confirm_name',
          label: `Type "${confirmLabel}" to confirm`,
          placeholder: confirmLabel,
          required: true,
          matchValue: confirmLabel,
        },
      ],
    });
    if (!values) return;
    try {
      await removeDashTeamMember(session.access_token, member.userId, { reason: values.reason });
      toast.success('Admin access removed');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Remove failed');
    }
  };

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
                {canDelete && <th className="px-4 py-3 w-32" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((m) => (
                <tr key={m.userId}>
                  <td className="px-4 py-3 text-white">{m.email || m.userId}</td>
                  <td className="px-4 py-3 text-slate-300">{m.role}</td>
                  {canDelete && (
                    <td className="px-4 py-3 text-right">
                      {m.userId !== session.user.id && (
                        <button
                          type="button"
                          onClick={() => void runRemove(m)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
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
