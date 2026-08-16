import React, { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  changeDashTeamRole,
  inviteDashTeamMember,
  listDashTeam,
  removeDashTeamMember,
  type DashTeamRole,
} from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

interface TeamMember {
  userId: string;
  email: string;
  role: string;
}

const ROLE_OPTIONS: { value: DashTeamRole; label: string }[] = [
  { value: 'dash_admin', label: 'Dash Admin' },
  { value: 'dash_ops', label: 'Dash Ops' },
  { value: 'courier_admin', label: 'Courier Admin' },
  { value: 'courier_ops', label: 'Courier Ops' },
];

function roleLabel(role: string) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export function DashTeamPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const canDelete = canDeleteDashAdmin(session.user);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<DashTeamRole>('dash_ops');
  const [inviting, setInviting] = useState(false);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

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

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    setInviting(true);
    try {
      await inviteDashTeamMember(session.access_token, { email, role: inviteRole });
      toast.success(`Invite sent to ${email}`);
      setInviteEmail('');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member: TeamMember, role: DashTeamRole) => {
    if (!canWrite || role === member.role) return;
    if (member.userId === session.user.id) {
      toast.error('You cannot change your own role');
      return;
    }
    setSavingRoleId(member.userId);
    try {
      await changeDashTeamRole(session.access_token, member.userId, role);
      setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, role } : m)));
      toast.success(`Role updated to ${roleLabel(role)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Role change failed');
    } finally {
      setSavingRoleId(null);
    }
  };

  const runRemove = async (member: TeamMember) => {
    if (!canDelete) return;
    if (member.userId === session.user.id) {
      toast.error('You cannot remove your own admin access');
      return;
    }
    const confirmLabel = member.email || member.userId;
    const values = await prompt({
      title: 'Remove admin access?',
      description: (
        <>
          Revokes <span className="text-white">{confirmLabel}</span>&apos;s{' '}
          <span className="text-white">{roleLabel(member.role)}</span> role. Their Roam login and other
          product admin roles are not deleted.
        </>
      ),
      confirmLabel: 'Remove access',
      variant: 'danger',
      fields: [
        { key: 'reason', label: 'Reason', placeholder: 'e.g. Left the team', required: true, multiline: true },
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Team</h2>
        <p className="text-sm text-slate-400">Dash and courier admins for the Rush Ops console.</p>
      </div>

      {canWrite && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
          <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-amber-400" />
            Invite teammate
          </h3>
          <form onSubmit={(e) => void submitInvite(e)} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="name@roam.co"
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as DashTeamRole)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {inviting ? 'Sending…' : 'Send invite'}
            </button>
          </form>
        </section>
      )}

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
              {members.map((m) => {
                const isSelf = m.userId === session.user.id;
                return (
                  <tr key={m.userId}>
                    <td className="px-4 py-3 text-white">
                      {m.email || m.userId}
                      {isSelf && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {canWrite && !isSelf ? (
                        <select
                          value={ROLE_OPTIONS.some((r) => r.value === m.role) ? m.role : ''}
                          disabled={savingRoleId === m.userId}
                          onChange={(e) => void changeRole(m, e.target.value as DashTeamRole)}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white disabled:opacity-50"
                        >
                          {!ROLE_OPTIONS.some((r) => r.value === m.role) && (
                            <option value="">{roleLabel(m.role)}</option>
                          )}
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        roleLabel(m.role)
                      )}
                    </td>
                    {canDelete && (
                      <td className="px-4 py-3 text-right">
                        {!isSelf && (
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Invites grant Rush console access. Platform-level roles are provisioned via Dominion Platform Team.
      </p>
    </div>
  );
}
