import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole, supabaseDashAdmin as supabase } from '@roam/auth-client';
import {
  approveInHousePurchase,
  claimInHouseTask,
  listInHouseQueue,
  resolveInHouseTask,
  type InHouseTaskCard,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { EntityDrawer } from '../../components/ui/bits';
import { formatMoney } from '../../components/ui/format';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { ageMinutes, beep, DESK_OPS, timerClass, timerLabel } from './inHouseUi';

type FilterId = 'everything' | 'waiting' | 'placing' | 'restaurant' | 'out' | 'problems';

const FILTERS: Array<{ id: FilterId; label: string; match: (task: InHouseTaskCard) => boolean }> = [
  { id: 'everything', label: 'Everything', match: () => true },
  { id: 'waiting', label: 'Waiting', match: (task) => task.state === 'queued' },
  { id: 'placing', label: 'Being placed', match: (task) => ['claimed', 'placing', 'awaiting_customer'].includes(task.state) },
  { id: 'restaurant', label: 'Waiting on restaurant', match: (task) => ['placed_external', 'ready_for_pickup'].includes(task.state) },
  { id: 'out', label: 'Out for delivery', match: (task) => task.state === 'picked_up' },
  { id: 'problems', label: 'Problems', match: (task) => task.state.includes('exception') || Boolean(task.needsApproval) },
];

type NeedKind = 'unknown_pay' | 'approval' | 'late' | 'problem';

function needKind(task: InHouseTaskCard): NeedKind | null {
  if (task.state === 'exception_purchase_unknown') return 'unknown_pay';
  if (task.needsApproval) return 'approval';
  if (task.state.includes('exception')) return 'problem';
  if (task.sla_warned_at || ageMinutes(task.created_at) >= 7) return 'late';
  return null;
}

export function InHouseOrdersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { confirm } = useAdminConfirm();
  const isOps = getJwtRoles(session.user).some((role) => DESK_OPS.has(role)) || DESK_OPS.has(jwtPrimaryRole(session.user));
  const [tasks, setTasks] = useState<InHouseTaskCard[]>([]);
  const [staffed, setStaffed] = useState(true);
  const [people, setPeople] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState<FilterId>(isOps ? 'everything' : 'waiting');
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('roam.inhouse.sound') !== 'off');
  const [resolveTask, setResolveTask] = useState<InHouseTaskCard | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const warned = useRef<Set<string>>(new Set());
  const paged = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const result = await listInHouseQueue(session.access_token);
      const next = result.tasks;
      const fresh = next.filter((task) => task.state === 'queued' && !seen.current.has(task.id));
      const late = next.filter((task) => task.sla_warned_at && !warned.current.has(task.id));
      const pages = next.filter((task) => task.sla_paged_at && !paged.current.has(task.id));
      if (soundOn && seen.current.size > 0 && (fresh.length > 0 || late.length > 0 || pages.length > 0)) beep();
      late.forEach((task) => warned.current.add(task.id));
      pages.forEach((task) => paged.current.add(task.id));
      next.forEach((task) => seen.current.add(task.id));
      setTasks(next);
      setStaffed(result.desk?.staffed !== false);
      setPeople(result.desk?.people ?? 0);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, [session.access_token, soundOn]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 8000);
    const channel = supabase
      .channel('in-house-orders')
      .on('postgres_changes', { event: '*', schema: 'delivery', table: 'procurement_tasks' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    localStorage.setItem('roam.inhouse.sound', soundOn ? 'on' : 'off');
  }, [soundOn]);

  const waitingCount = tasks.filter((task) => task.state === 'queued').length;
  useEffect(() => {
    const base = 'Orders · Roam Rush';
    document.title = waitingCount > 0 ? `(${waitingCount}) ${base}` : base;
    return () => { document.title = 'Roam Rush'; };
  }, [waitingCount]);

  const needsYou = useMemo(() => tasks.filter((task) => needKind(task) != null), [tasks]);
  const visible = tasks.filter((task) => FILTERS.find((item) => item.id === filter)?.match(task));

  async function claim(id: string) {
    try {
      await claimInHouseTask(session.access_token, id);
      navigate(`/in-house/task/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not claim');
    }
  }

  return (
    <div className="space-y-4 text-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!embedded ? <h1 className="text-xl font-semibold">Orders</h1> : null}
          <p className="text-sm text-slate-400">Buy the food on the restaurant&apos;s site, save the receipt, mark it placed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => setSoundOn((on) => !on)}>
            {soundOn ? 'Sound on' : 'Sound off'}
          </button>
          <span className={`rounded px-3 py-1 ${staffed ? 'bg-emerald-950 text-emerald-100' : 'bg-red-950 text-red-100'}`}>
            {staffed ? `Desk open · ${people || 1} people here` : 'Desk closed'}
          </span>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        </div>
      </div>
      <p className="text-xs text-slate-500">If nobody has this page open, customers see In-House restaurants as closed.</p>

      {loadError ? <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p> : null}

      {isOps && needsYou.length > 0 ? (
        <section className="space-y-2 rounded border border-amber-900/50 bg-amber-950/20 p-3">
          <h2 className="text-sm font-medium text-amber-100">Needs you</h2>
          {needsYou.map((task) => {
            const kind = needKind(task);
            const label = kind === 'unknown_pay'
              ? 'Card may have been used'
              : kind === 'approval'
                ? 'Over J$15,000 · needs a second person'
                : kind === 'late'
                  ? 'Late'
                  : 'Problem';
            return (
              <article key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/60 p-3 text-sm">
                <div>
                  <div className="font-medium">{label} · {task.storeName} · {task.orderNumber || 'Order'}</div>
                  <div className="text-slate-400">{task.buyerName || 'Unclaimed'} · {Math.max(0, Math.floor(ageMinutes(task.created_at)))} min</div>
                </div>
                <button
                  type="button"
                  className="rounded bg-amber-500 px-3 py-1 text-slate-950"
                  onClick={() => {
                    if (kind === 'approval') {
                      void confirm({
                        title: 'Approve this purchase?',
                        description: `${task.storeName} · ${task.orderNumber || 'Order'} is over J$15,000 and needs a second person.`,
                        confirmLabel: 'Approve',
                      }).then((ok) => {
                        if (!ok) return;
                        return approveInHousePurchase(session.access_token, task.id).then(() => load());
                      }).catch((error: Error) => toast.error(error.message));
                      return;
                    }
                    if (kind === 'late' && task.state === 'queued') {
                      void claim(task.id);
                      return;
                    }
                    if (kind === 'late') {
                      navigate(`/in-house/task/${task.id}`);
                      return;
                    }
                    setResolveTask(task);
                  }}
                >
                  {kind === 'approval' ? 'Approve' : kind === 'late' && task.state === 'queued' ? 'Claim' : 'Sort it out'}
                </button>
              </article>
            );
          })}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const count = tasks.filter(item.match).length;
          return (
            <button
              key={item.id}
              type="button"
              className={`rounded-lg px-3 py-1 text-sm ${filter === item.id ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}{count ? ` ${count}` : ''}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {visible.length === 0 && !loading && !loadError ? <p className="text-sm text-slate-400">No orders in this filter.</p> : null}
        {visible.map((task) => {
          const timer = timerLabel(task.sla_warned_at || task.created_at);
          return (
            <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 p-3 text-sm">
              <div>
                <div className="font-medium">{task.storeName} · {task.orderNumber || 'New'} · {task.itemCount} items · {formatMoney(Number(task.customerTotal || 0))}</div>
                <div className={`${timerClass(timer.tone)}`} title="On time under 4 min. Getting late at 4 min. Late at 7 min.">
                  waiting {timer.minutes} min · {timer.label}
                </div>
                {task.unreadCount ? <div className="text-amber-200">{task.unreadCount} new message{task.unreadCount === 1 ? '' : 's'}</div> : null}
              </div>
              <div className="flex gap-2">
                {task.state === 'queued' ? (
                  <button type="button" className="rounded-lg bg-amber-500 px-3 py-1 text-slate-950" onClick={() => void claim(task.id)}>Claim</button>
                ) : (
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => navigate(`/in-house/task/${task.id}`)}>Open</button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <ResolveDrawer
        task={resolveTask}
        token={session.access_token}
        onClose={() => setResolveTask(null)}
        onDone={() => { setResolveTask(null); void load(); }}
        onOpen={(id) => navigate(`/in-house/task/${id}`)}
      />
    </div>
  );
}

function ResolveDrawer({
  task,
  token,
  onClose,
  onDone,
  onOpen,
}: {
  task: InHouseTaskCard | null;
  token: string;
  onClose: () => void;
  onDone: () => void;
  onOpen: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { confirm } = useAdminConfirm();
  if (!task) return null;
  // Capture after null check so nested async handlers keep a non-null task.
  const current: InHouseTaskCard = task;
  const unknown = current.state === 'exception_purchase_unknown';
  const after = current.state === 'exception_after_purchase';

  async function act(action: 'retry' | 'substitute' | 'abandon' | 'wait' | 'redispatch', extra?: { confirmedNothingBought?: boolean }) {
    if (action === 'abandon') {
      const ok = await confirm({
        title: 'Refund the customer?',
        description: `${current.storeName} · ${current.orderNumber || 'Order'} will be closed and the customer refunded.`,
        confirmLabel: 'Refund',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await resolveInHouseTask(token, current.id, action, extra);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not resolve');
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityDrawer open title="Sort it out" onClose={onClose}>
      <div className="space-y-3 text-sm text-slate-200">
        <p className="font-medium">{current.storeName} · {current.orderNumber || 'Order'}</p>
        {unknown ? (
          <>
            <p>{current.buyerName || 'The buyer'} started paying but the order wasn&apos;t marked placed. Ask them first.</p>
            <button type="button" disabled={busy} className="w-full rounded bg-slate-800 px-3 py-2 text-left" onClick={() => void act('retry', { confirmedNothingBought: true })}>
              Nothing was charged → Try again (back to the queue)
            </button>
            <button type="button" disabled={busy} className="w-full rounded bg-slate-800 px-3 py-2 text-left" onClick={() => onOpen(current.id)}>
              We were charged → Open the order and record the purchase
            </button>
            <button type="button" disabled={busy} className="w-full rounded bg-red-900 px-3 py-2 text-left" onClick={() => void act('abandon')}>
              Give up → Refund the customer (Roam keeps any charge as a cost)
            </button>
          </>
        ) : after ? (
          <>
            <p>Food was already bought. Choose what happens next.</p>
            <button type="button" disabled={busy} className="w-full rounded bg-slate-800 px-3 py-2 text-left" onClick={() => void act('wait')}>Wait for the restaurant</button>
            <button type="button" disabled={busy} className="w-full rounded bg-slate-800 px-3 py-2 text-left" onClick={() => void act('redispatch')}>Send the courier again</button>
            <button type="button" disabled={busy} className="w-full rounded bg-red-900 px-3 py-2 text-left" onClick={() => void act('abandon')}>Write off and refund the customer</button>
          </>
        ) : (
          <>
            <p>Something blocked this order before purchase.</p>
            <button type="button" disabled={busy} className="w-full rounded bg-slate-800 px-3 py-2 text-left" onClick={() => void act('retry')}>Try again</button>
            <button type="button" disabled={busy} className="w-full rounded bg-slate-800 px-3 py-2 text-left" onClick={() => void act('substitute')}>Ask the customer to pick a swap</button>
            <button type="button" disabled={busy} className="w-full rounded bg-red-900 px-3 py-2 text-left" onClick={() => void act('abandon')}>Refund the customer</button>
          </>
        )}
      </div>
    </EntityDrawer>
  );
}
