import { Children, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import {
  approveInHousePurchase,
  claimInHouseTask,
  getInHouseAudience,
  inHouseHeartbeat,
  listInHouseQueue,
  resolveInHouseTask,
  saveInHouseAudience,
  type InHouseTaskCard,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const ADMIN = new Set(['dash_admin', 'platform_owner', 'platform_support', 'superadmin']);
const OPS = new Set(['dash_ops', 'dash_admin', 'platform_owner', 'platform_support', 'superadmin']);
const PLACING = new Set(['claimed', 'placing', 'awaiting_customer']);

function ageMinutes(iso: string) {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function timerClass(iso: string) {
  const minutes = ageMinutes(iso);
  if (minutes >= 7) return 'text-red-300';
  if (minutes >= 4) return 'text-amber-300';
  return 'text-emerald-300';
}

export function InHouseOpsBoard({ embedded = false }: { embedded?: boolean } = {}) {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const roles = getJwtRoles(session.user);
  const primary = jwtPrimaryRole(session.user);
  const isOps = roles.some((role) => OPS.has(role)) || OPS.has(primary);
  const isAdmin = roles.some((role) => ADMIN.has(role)) || ADMIN.has(primary);
  const [tasks, setTasks] = useState<InHouseTaskCard[]>([]);
  const [staffed, setStaffed] = useState(true);
  const [people, setPeople] = useState(0);
  const [phones, setPhones] = useState('');
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    await inHouseHeartbeat(session.access_token).catch(() => undefined);
    const result = await listInHouseQueue(session.access_token);
    setTasks(result.tasks);
    setStaffed(result.desk?.staffed !== false);
    setPeople(result.desk?.people ?? 0);
  }, [session.access_token]);

  useEffect(() => {
    void load().catch((error: Error) => toast.error(error.message));
    const poll = window.setInterval(() => void load().catch(() => undefined), 8000);
    return () => window.clearInterval(poll);
  }, [load]);

  useEffect(() => {
    if (!isAdmin) return;
    void getInHouseAudience(session.access_token).then((result) => setPhones(result.phones.join(', '))).catch(() => undefined);
  }, [isAdmin, session.access_token]);

  const waiting = tasks.filter((task) => task.state === 'queued');
  const placing = tasks.filter((task) => PLACING.has(task.state));
  const unknown = tasks.filter((task) => task.state === 'exception_purchase_unknown');
  const problems = tasks.filter((task) => task.state.includes('exception') && task.state !== 'exception_purchase_unknown');
  const approvals = tasks.filter((task) => task.needsApproval);
  const late = tasks.filter((task) => task.sla_warned_at || ageMinutes(task.created_at) >= 7);

  async function claim(id: string) {
    try {
      await claimInHouseTask(session.access_token, id);
      navigate(`/in-house/task/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not claim');
    }
  }

  function resolve(id: string, action: 'retry' | 'substitute' | 'abandon' | 'wait' | 'redispatch', extra?: { confirmedNothingBought?: boolean }) {
    void resolveInHouseTask(session.access_token, id, action, extra).then(() => load()).catch((error: Error) => toast.error(error.message));
  }

  return (
    <div className="space-y-4 text-slate-100">
      <div>
        {!embedded && <h1 className="text-xl font-semibold">Desk</h1>}
        <p className="text-sm text-slate-400">Watch every order and step in when something stalls. You can also claim an order and place it yourself.</p>
      </div>
      <p className={`rounded px-3 py-2 text-sm ${staffed ? 'bg-emerald-950 text-emerald-100' : 'bg-red-950 text-red-100'}`}>
        {staffed
          ? (people > 1 ? 'The desk is open.' : 'You are keeping the desk open. If everyone leaves, the store looks closed.')
          : 'Nobody is on the desk. The store looks closed.'}
      </p>
      {late.length ? <p className="rounded bg-red-950 px-3 py-2 text-sm text-red-100">{late.length} order{late.length === 1 ? '' : 's'} sitting too long. Open the red timer.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for a buyer" value={waiting.length} />
        <Stat label="Being placed" value={placing.length} />
        <Stat label="Problems" value={problems.length + unknown.length} />
        <Stat label="Needs a second person" value={approvals.length} />
      </div>

      <OrderGroup title="Waiting for a buyer" empty="No orders waiting.">
        {waiting.map((task) => (
          <OrderRow key={task.id} task={task} action={<button type="button" className="rounded-lg bg-amber-500 px-3 py-1 text-slate-950" onClick={() => void claim(task.id)}>Claim</button>} />
        ))}
      </OrderGroup>

      <OrderGroup title="Being placed" empty="Nobody is placing an order.">
        {placing.map((task) => (
          <OrderRow key={task.id} task={task} action={<button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => navigate(`/in-house/task/${task.id}`)}>Open</button>} />
        ))}
      </OrderGroup>

      {isOps && approvals.length ? (
        <OrderGroup title="Over J$15,000, waiting for a second person" empty="">
          {approvals.map((task) => (
            <OrderRow key={task.id} task={task} action={
              <button type="button" className="rounded bg-amber-700 px-3 py-1" onClick={() => void approveInHousePurchase(session.access_token, task.id).then(() => load()).catch((error: Error) => toast.error(error.message))}>Approve purchase</button>
            } />
          ))}
        </OrderGroup>
      ) : null}

      <section className="space-y-2">
        <h2 className="font-medium">Card may have been used</h2>
        {unknown.length === 0 ? <p className="text-sm text-slate-400">None.</p> : unknown.map((task) => (
          <article key={task.id} className="rounded border border-amber-900 p-3 text-sm">
            <div className="font-medium">{task.storeName} · {task.orderNumber || 'Order'}</div>
            <p className="text-amber-200">{task.buyerName || 'The buyer'} may have paid. Confirm with them before trying again.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(confirmed[task.id])} onChange={(event) => setConfirmed((current) => ({ ...current, [task.id]: event.target.checked }))} />
                Nothing was bought
              </label>
              <button type="button" disabled={!confirmed[task.id]} className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40" onClick={() => resolve(task.id, 'retry', { confirmedNothingBought: true })}>Try again</button>
              <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => resolve(task.id, 'abandon')}>Refund</button>
              <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => navigate(`/in-house/task/${task.id}`)}>Open</button>
            </div>
          </article>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Problems</h2>
        {problems.length === 0 ? <p className="text-sm text-slate-400">No open problems.</p> : problems.map((task) => {
          const after = task.state === 'exception_after_purchase';
          return (
            <article key={task.id} className="rounded border border-slate-800 p-3 text-sm">
              <div className="font-medium">{task.storeName} · {task.orderNumber || 'Order'}</div>
              <div className="text-slate-400">{task.exception_code || task.state} · {task.buyerName || 'Buyer'}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {after ? (
                  <>
                    <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => resolve(task.id, 'wait')}>Wait</button>
                    <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => resolve(task.id, 'redispatch')}>Send courier again</button>
                    <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => resolve(task.id, 'abandon')}>Write off and refund</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => resolve(task.id, 'retry')}>Try again</button>
                    <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => resolve(task.id, 'substitute')}>Substitute</button>
                    <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => resolve(task.id, 'abandon')}>Refund</button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {isAdmin ? (
        <form className="flex flex-wrap items-center gap-2 text-sm" onSubmit={(event) => {
          event.preventDefault();
          const next = phones.split(',').map((phone) => phone.trim()).filter(Boolean).slice(0, 2);
          void saveInHouseAudience(session.access_token, { phones: next }).then(() => toast.success('Late-order texts saved')).catch((error: Error) => toast.error(error.message));
        }}>
          <label className="text-slate-300" htmlFor="alert-phones">Who gets the late-order text</label>
          <input id="alert-phones" className="min-w-56 rounded bg-slate-900 p-2" placeholder="876..." value={phones} onChange={(event) => setPhones(event.target.value)} />
          <button className="rounded bg-slate-800 px-3 py-2" type="submit">Save</button>
        </form>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/60 p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}

function OrderGroup({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-medium">{title}</h2>
      {Children.count(children) ? children : <p className="text-sm text-slate-400">{empty}</p>}
    </section>
  );
}

function OrderRow({ task, action }: { task: InHouseTaskCard; action: ReactNode }) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 p-3 text-sm">
      <div>
        <div className="font-medium">{task.storeName} · {task.orderNumber || 'New'}</div>
        <div className="text-slate-400">{task.buyerName || 'Unclaimed'} · {task.itemCount} items</div>
        <div className={timerClass(task.sla_warned_at || task.created_at)}>{Math.max(0, Math.floor(ageMinutes(task.created_at)))} min</div>
      </div>
      {action}
    </article>
  );
}
