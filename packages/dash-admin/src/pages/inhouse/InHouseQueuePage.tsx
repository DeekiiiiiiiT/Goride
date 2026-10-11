import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole, supabaseDashAdmin as supabase } from '@roam/auth-client';
import {
  approveInHousePurchase,
  claimInHouseTask,
  inHouseHeartbeat,
  listInHouseQueue,
  type InHouseTaskCard,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const COLUMNS: Array<{ id: string; label: string; states: string[] }> = [
  { id: 'new', label: 'New', states: ['queued'] },
  { id: 'claimed', label: 'Claimed', states: ['claimed', 'placing', 'awaiting_customer'] },
  { id: 'placed', label: 'Placed', states: ['placed_external'] },
  { id: 'ready', label: 'Ready', states: ['ready_for_pickup'] },
  { id: 'out', label: 'Out', states: ['picked_up'] },
  { id: 'exceptions', label: 'Exceptions', states: ['exception', 'exception_before_purchase', 'exception_after_purchase'] },
];

const OPS = new Set(['dash_ops', 'dash_admin', 'platform_owner', 'platform_support', 'superadmin']);

function ageMinutes(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function timerClass(iso: string) {
  const minutes = ageMinutes(iso);
  if (minutes >= 7) return 'text-red-300';
  if (minutes >= 4) return 'text-amber-300';
  return 'text-emerald-300';
}

function beep() {
  const ctx = new AudioContext();
  const tone = ctx.createOscillator();
  const gain = ctx.createGain();
  tone.frequency.value = 880;
  gain.gain.value = 0.05;
  tone.connect(gain);
  gain.connect(ctx.destination);
  tone.start();
  tone.stop(ctx.currentTime + 0.15);
}

export function InHouseQueuePage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<InHouseTaskCard[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());
  const warned = useRef<Set<string>>(new Set());
  const isOps = getJwtRoles(session.user).some((role) => OPS.has(role)) || OPS.has(jwtPrimaryRole(session.user));

  const load = useCallback(async () => {
    const token = session.access_token;
    const { tasks: next } = await listInHouseQueue(token);
    const fresh = next.filter((task) => task.state === 'queued' && !seen.current.has(task.id));
    const late = next.filter((task) => task.sla_warned_at && !warned.current.has(task.id));
    if (seen.current.size > 0 && (fresh.length > 0 || late.length > 0)) beep();
    late.forEach((task) => warned.current.add(task.id));
    next.forEach((task) => seen.current.add(task.id));
    setTasks(next);
    setLoading(false);
  }, [session.access_token]);

  useEffect(() => {
    void load().catch((error: Error) => toast.error(error.message));
    const poll = window.setInterval(() => void load().catch(() => undefined), 8000);
    const beat = window.setInterval(() => {
      void inHouseHeartbeat(session.access_token).catch(() => undefined);
    }, 30000);
    void inHouseHeartbeat(session.access_token).catch(() => undefined);
    const channel = supabase
      .channel('in-house-queue')
      .on('postgres_changes', { event: '*', schema: 'delivery', table: 'procurement_tasks' }, () => {
        void load().catch(() => undefined);
      })
      .subscribe();
    return () => {
      window.clearInterval(poll);
      window.clearInterval(beat);
      void supabase.removeChannel(channel);
    };
  }, [load, session.access_token]);

  async function claim(id: string) {
    try {
      await claimInHouseTask(session.access_token, id);
      navigate(`/in-house/task/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not claim');
    }
  }

  return (
    <div className="space-y-4 p-4 text-slate-100">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">In-House queue</h1>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      </div>
      {tasks.some((task) => task.sla_warned_at) ? (
        <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-100">An order needs a person. Open the red timer.</p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-6">
        {COLUMNS.map((column) => (
          <section key={column.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <h2 className="mb-2 text-sm font-medium text-slate-300">{column.label}</h2>
            <div className="space-y-2">
              {tasks.filter((task) => column.states.includes(task.state)).map((task) => (
                <article key={task.id} className="rounded-md border border-slate-700 bg-slate-950 p-2 text-sm">
                  <div className="font-medium">{task.storeName}</div>
                  <div className="text-slate-400">{task.itemCount} items · {task.orderNumber || 'New'}</div>
                  {task.unreadCount ? <div className="text-amber-200">{task.unreadCount} new message{task.unreadCount === 1 ? '' : 's'}</div> : null}
                  <div className={timerClass(task.sla_warned_at || task.created_at)}>{Math.max(0, Math.floor(ageMinutes(task.created_at)))} min</div>
                  <div className="text-xs text-slate-500">{task.moneyState === 'captured' ? 'Paid' : task.paymentStatus}</div>
                  {isOps && task.needsApproval ? (
                    <button type="button" className="mt-2 w-full rounded bg-amber-700 px-2 py-1" onClick={() => void approveInHousePurchase(session.access_token, task.id).then(() => load()).catch((error: Error) => toast.error(error.message))}>
                      Approve purchase
                    </button>
                  ) : null}
                  {task.state === 'queued' ? (
                    <button type="button" className="mt-2 w-full rounded bg-emerald-700 px-2 py-1" onClick={() => void claim(task.id)}>
                      Claim
                    </button>
                  ) : (
                    <button type="button" className="mt-2 w-full rounded bg-slate-800 px-2 py-1" onClick={() => navigate(`/in-house/task/${task.id}`)}>
                      Open
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
