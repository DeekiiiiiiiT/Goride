import { useCallback, useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import {
  inHouseHeartbeat,
  inviteDashTeamMember,
  listDashTeam,
  removeDashTeamMember,
  type DashTeamRole,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { PageHeader } from '../../components/ui/PageHeader';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { InHouseQueuePage } from './InHouseQueuePage';
import { InHouseOpsBoard } from './InHouseOpsBoard';
import {
  InHouseCardsPage,
  InHouseMenuPage,
  InHouseReportsPage,
  InHouseStoresPage,
} from './InHouseDeskPages';

const OPS = new Set(['dash_ops', 'dash_admin', 'platform_owner', 'platform_support', 'superadmin']);

const JOBS = {
  buyer: { role: 'dash_concierge' as DashTeamRole, label: 'Buyer' },
  ops: { role: 'dash_ops' as DashTeamRole, label: 'Ops' },
};

const DESK_TABS = ['queue', 'ops', 'stores', 'menu', 'cards', 'reports'] as const;
type DeskTab = typeof DESK_TABS[number];

export function InHouseTeamPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [params, setParams] = useSearchParams();
  const roles = getJwtRoles(session.user);
  const primary = jwtPrimaryRole(session.user);
  const isOps = roles.some((role) => OPS.has(role)) || OPS.has(primary);
  const requested = params.get('tab') === 'buyer' ? 'queue' : params.get('tab');
  const tab: DeskTab = !isOps
    ? 'queue'
    : (DESK_TABS.includes(requested as DeskTab) ? requested as DeskTab : 'ops');

  useEffect(() => {
    const beat = () => void inHouseHeartbeat(session.access_token).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, 30000);
    return () => window.clearInterval(timer);
  }, [session.access_token]);

  function openTab(next: DeskTab) {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: false });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="In-House desk"
        description="Staff buying food for a customer, and the problems that need a person."
        tabs={isOps ? [
          { id: 'queue', label: 'Queue' },
          { id: 'ops', label: 'Ops' },
          { id: 'stores', label: 'Stores' },
          { id: 'menu', label: 'Menu' },
          { id: 'cards', label: 'Cards' },
          { id: 'reports', label: 'Reports' },
        ] : undefined}
        activeTab={tab}
        onTab={(id) => openTab(id as DeskTab)}
      />
      {tab === 'stores' ? <InHouseStoresPage embedded /> : null}
      {tab === 'menu' ? <InHouseMenuPage embedded /> : null}
      {tab === 'cards' ? <InHouseCardsPage embedded /> : null}
      {tab === 'reports' ? <InHouseReportsPage embedded /> : null}
      {tab === 'ops' ? <InHouseOpsBoard embedded /> : null}
      {tab === 'queue' ? <InHouseQueuePage embedded /> : null}
    </div>
  );
}

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
          <button className="rounded-lg bg-amber-500 px-3 py-2 text-slate-950 font-semibold disabled:opacity-50" type="submit" disabled={sending}>{sending ? 'Sending…' : `Send ${spec.label} login`}</button>
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
