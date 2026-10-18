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
import { ageMinutes, beep, DESK_OPS, timerLabel } from './inHouseUi';
import { IH } from './inHouseTheme';

type FilterId = 'everything' | 'waiting' | 'placing' | 'restaurant' | 'out' | 'problems';

const FILTERS: Array<{ id: FilterId; label: string; match: (task: InHouseTaskCard) => boolean }> = [
  { id: 'everything', label: 'All', match: () => true },
  { id: 'waiting', label: 'Waiting', match: (task) => task.state === 'queued' },
  { id: 'placing', label: 'Being bought', match: (task) => ['claimed', 'placing', 'awaiting_customer'].includes(task.state) },
  { id: 'restaurant', label: 'At restaurant', match: (task) => ['placed_external', 'ready_for_pickup'].includes(task.state) },
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

export function InHouseOrdersPage({
  embedded = false,
  soundOn: soundOnProp,
  hideDeskChrome = false,
}: {
  embedded?: boolean;
  soundOn?: boolean;
  hideDeskChrome?: boolean;
} = {}) {
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
  const [localSound, setLocalSound] = useState(() => localStorage.getItem('roam.inhouse.sound') !== 'off');
  const soundOn = soundOnProp ?? localSound;
  const [search, setSearch] = useState('');
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
    if (soundOnProp == null) localStorage.setItem('roam.inhouse.sound', localSound ? 'on' : 'off');
  }, [localSound, soundOnProp]);

  const waitingCount = tasks.filter((task) => task.state === 'queued').length;
  useEffect(() => {
    const base = 'Orders · Roam Rush';
    document.title = waitingCount > 0 ? `(${waitingCount}) ${base}` : base;
    return () => { document.title = 'Roam Rush'; };
  }, [waitingCount]);

  const needsYou = useMemo(() => tasks.filter((task) => needKind(task) != null), [tasks]);
  const visible = tasks.filter((task) => {
    if (!FILTERS.find((item) => item.id === filter)?.match(task)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return String(task.storeName || '').toLowerCase().includes(q)
      || String(task.orderNumber || '').toLowerCase().includes(q);
  });

  async function claim(id: string) {
    try {
      await claimInHouseTask(session.access_token, id);
      navigate(`/in-house/task/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not claim');
    }
  }

  function onNeedAction(task: InHouseTaskCard, kind: NeedKind | null) {
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
  }

  const needMeta = (kind: NeedKind | null) => {
    if (kind === 'unknown_pay') {
      return {
        badge: 'Double-charge flag',
        border: 'border-amber-500/40 hover:border-amber-400',
        badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        btnCls: 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40',
        action: 'Verify charge',
      };
    }
    if (kind === 'approval') {
      return {
        badge: 'Approval needed',
        border: 'border-amber-500/40 hover:border-amber-400',
        badgeCls: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        btnCls: 'bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold',
        action: 'Approve adjustment',
      };
    }
    if (kind === 'late') {
      return {
        badge: 'Late order',
        border: 'border-rose-500/40 hover:border-rose-400',
        badgeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        btnCls: 'bg-rose-600 hover:bg-rose-500 text-white',
        action: 'Resolve delay',
      };
    }
    return {
      badge: 'Problem',
      border: 'border-rose-500/40 hover:border-rose-400',
      badgeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      btnCls: 'bg-rose-600 hover:bg-rose-500 text-white',
      action: 'Sort it out',
    };
  };

  const slaBadge = (tone: 'ok' | 'warn' | 'late', minutes: number) => {
    if (tone === 'late') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-2.5 py-1 text-xs font-bold text-rose-300">
          Late ({minutes}m)
        </span>
      );
    }
    if (tone === 'warn') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-300">
          Getting late ({minutes}m)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-300">
        On time ({minutes}m)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {!hideDeskChrome && !embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-white">Orders</h1>
          <button type="button" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs" onClick={() => setLocalSound((on) => !on)}>
            {soundOn ? 'Sound on' : 'Sound off'} · {staffed ? `Desk open · ${people || 1}` : 'Desk closed'}
          </button>
        </div>
      ) : null}

      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          <p>{loadError}</p>
          <button type="button" className="rounded-lg border border-slate-600 px-3 py-1" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      {/* Stitch Needs you strip */}
      {isOps && needsYou.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-slate-100">Needs you</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-400">
                ({needsYou.length} urgent)
              </span>
            </div>
            <span className="hidden text-xs text-slate-400 sm:block">Requires immediate operator manual intervention</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {needsYou.slice(0, 6).map((task) => {
              const kind = needKind(task);
              const meta = needMeta(kind);
              const mins = Math.max(0, Math.floor(ageMinutes(task.created_at)));
              return (
                <article key={task.id} className={`relative flex flex-col justify-between rounded-lg border bg-slate-800/90 p-4 shadow-sm transition-colors ${meta.border}`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeCls}`}>
                        {meta.badge}
                      </span>
                      <span className="font-mono text-xs font-medium text-slate-400">{mins}m</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {task.orderNumber ? `Order #${task.orderNumber}` : 'Order'} · {task.storeName}
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {kind === 'unknown_pay'
                        ? 'Card may have been charged — confirm before retrying.'
                        : kind === 'approval'
                          ? 'Over J$15,000 — needs a second person.'
                          : kind === 'late'
                            ? 'Order is late — claim or open and sort it out.'
                            : 'Something blocked this order.'}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-700/50 pt-4">
                    <span className="text-[11px] text-slate-400">{task.buyerName || 'Unclaimed'}</span>
                    <button type="button" className={`rounded-lg px-3 py-1.5 text-xs font-semibold shadow transition-all active:scale-95 ${meta.btnCls}`} onClick={() => onNeedAction(task, kind)}>
                      {kind === 'late' && task.state === 'queued' ? 'Claim' : meta.action}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Stitch queue controls + dense table */}
      <section className="space-y-4">
        <div className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-slate-700/80 bg-slate-800/70 p-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {FILTERS.map((item) => {
              const count = tasks.filter(item.match).length;
              const active = filter === item.id;
              const problems = item.id === 'problems';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : problems
                        ? 'border border-rose-500/30 bg-rose-950/30 text-rose-300 hover:bg-rose-900/40'
                        : 'font-medium text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  <span>{item.label}</span>
                  {count ? (
                    <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-blue-700 text-blue-100' : problems ? 'bg-rose-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-900/90 py-1.5 pl-3 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                placeholder="Search order # or restaurant..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <button type="button" className="rounded-lg border border-slate-700 bg-slate-900/80 p-1.5 text-slate-400 hover:text-slate-200" title="Refresh" onClick={() => void load()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : '↻'}
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-700/80 bg-slate-800/80 shadow-sm">
          <div className="grid grid-cols-12 gap-3 border-b border-slate-700 bg-slate-900/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <div className="col-span-4 sm:col-span-3">Restaurant &amp; ID</div>
            <div className="col-span-2 hidden sm:block">Items &amp; Total</div>
            <div className="col-span-3 sm:col-span-2">SLA Timer</div>
            <div className="col-span-2 hidden md:block">Desk Status</div>
            <div className="col-span-5 text-right sm:col-span-3">Quick Action</div>
          </div>
          <div className="divide-y divide-slate-700/60 text-xs">
            {visible.length === 0 && !loading && !loadError ? (
              <div className="px-4 py-10 text-center">
                <p className="font-medium text-slate-100">No orders waiting</p>
                <p className="mt-1 text-sm text-slate-400">New orders appear here with a sound.</p>
              </div>
            ) : null}
            {visible.map((task) => {
              const timer = timerLabel(task.created_at);
              const queued = task.state === 'queued';
              return (
                <div key={task.id} className="grid grid-cols-12 items-center gap-3 bg-slate-800/40 px-4 py-3 transition-colors hover:bg-slate-700/40">
                  <div className="col-span-4 flex min-w-0 items-center gap-2.5 sm:col-span-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[10px] font-bold ${
                      timer.tone === 'late' ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        : timer.tone === 'warn' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    }`}>
                      {(task.storeName || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="truncate font-semibold text-slate-100 group-hover:text-amber-300">{task.storeName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{task.orderNumber ? `Order #${task.orderNumber}` : 'New order'}</p>
                    </div>
                  </div>
                  <div className="col-span-2 hidden sm:block">
                    <p className="font-medium text-slate-200">{task.itemCount} items</p>
                    <p className="font-mono text-[11px] text-slate-400">{formatMoney(Number(task.customerTotal || 0))}</p>
                  </div>
                  <div className="col-span-3 sm:col-span-2" title="On time under 4 min. Getting late at 4 min. Late at 7 min.">
                    {slaBadge(timer.tone, timer.minutes)}
                  </div>
                  <div className="col-span-2 hidden md:block">
                    {task.buyerName ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Claimed: {task.buyerName}
                      </span>
                    ) : (
                      <span className="italic text-slate-400">Unclaimed</span>
                    )}
                    {task.unreadCount ? <span className="mt-0.5 block text-[11px] text-amber-400">{task.unreadCount} new msg</span> : null}
                  </div>
                  <div className="col-span-5 flex items-center justify-end gap-2 sm:col-span-3">
                    {queued ? (
                      <button
                        type="button"
                        className={`flex items-center gap-1.5 shadow-sm transition-all active:scale-95 ${IH.primaryBtn}`}
                        onClick={() => void claim(task.id)}
                      >
                        Claim
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg border border-slate-500 px-4 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                        onClick={() => navigate(`/in-house/task/${task.id}`)}
                      >
                        Open
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {visible.length > 0 ? (
            <div className="border-t border-slate-700 px-4 py-2 text-[11px] text-slate-400">
              Showing {visible.length} of {tasks.length} queue orders
              {loading ? ' · refreshing…' : ''}
            </div>
          ) : null}
        </div>
      </section>

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
