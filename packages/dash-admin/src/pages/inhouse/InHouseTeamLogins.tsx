import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  inviteDashTeamMember,
  listDashTeam,
  removeDashTeamMember,
  type DashTeamRole,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import type { AdminOutletContext } from '../../DashAdminPortal';

const JOBS = {
  buyer: { role: 'dash_concierge' as DashTeamRole, label: 'Buyer' },
  ops: { role: 'dash_ops' as DashTeamRole, label: 'Ops' },
};

export function TeamLogins({ job }: { job: 'buyer' | 'ops' }) {
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const canDelete = canDeleteDashAdmin(session.user);
  const spec = JOBS[job];
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(canWrite || canDelete);
  const [people, setPeople] = useState<Array<{ userId: string; email: string; role: string }>>([]);

  const load = useCallback(async () => {
    if (!canWrite && !canDelete) return;
    setLoading(true);
    try {
      const result = await listDashTeam(session.access_token);
      setPeople(result.members.filter((member) => member.role === spec.role));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load the team');
    } finally {
      setLoading(false);
    }
  }, [canDelete, canWrite, session.access_token, spec.role]);

  useEffect(() => { void load(); }, [load]);

  if (!canWrite && !canDelete) return null;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      toast.error('Enter a valid email address');
      return;
    }
    setSending(true);
    try {
      await inviteDashTeamMember(session.access_token, { email: next, role: spec.role });
      toast.success(`Login sent to ${next}`);
      setEmail('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the login');
    } finally {
      setSending(false);
    }
  }

  async function remove(person: { userId: string; email: string }) {
    const confirmLabel = person.email || person.userId;
    const values = await prompt({
      title: 'Remove this login?',
      description: `${confirmLabel} will no longer be able to work as ${spec.label}.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      fields: [
        { key: 'reason', label: 'Reason', placeholder: 'Left the team', required: true, multiline: true },
        { key: 'confirm_name', label: `Type "${confirmLabel}" to confirm`, placeholder: confirmLabel, required: true, matchValue: confirmLabel },
      ],
    });
    if (!values) return;
    try {
      await removeDashTeamMember(session.access_token, person.userId, { reason: values.reason });
      toast.success('Login removed');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the login');
    }
  }

  return (
    <section className="rounded border border-slate-800 p-3 text-sm text-slate-100">
      <h2 className="font-medium">{spec.label} logins</h2>
      <p className="mt-1 text-slate-400">They get an email and choose their own password.</p>
      {canWrite ? (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => void send(event)}>
          <input type="email" className="min-w-56 rounded bg-slate-900 p-2" placeholder="name@email.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="rounded-lg bg-[#f59e0b] px-3 py-2 text-slate-950 font-semibold disabled:opacity-50" type="submit" disabled={sending}>{sending ? 'Sending…' : `Send ${spec.label} login`}</button>
        </form>
      ) : null}
      {loading ? <Loader2 className="mt-3 h-5 w-5 animate-spin" /> : (
        <ul className="mt-3 space-y-1">
          {people.map((person) => (
            <li key={person.userId} className="flex items-center justify-between gap-2">
              <span>{person.email || person.userId}</span>
              {canDelete && person.userId !== session.user.id ? (
                <button type="button" className="text-red-300" onClick={() => void remove(person)}>Remove</button>
              ) : null}
            </li>
          ))}
          {people.length === 0 ? <li className="text-slate-400">No {spec.label.toLowerCase()} logins yet.</li> : null}
        </ul>
      )}
    </section>
  );
}
