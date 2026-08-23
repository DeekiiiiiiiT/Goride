import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Loader2, RefreshCw, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  cancelOrder,
  completeOrder,
  listLiveOrders,
  redispatchOrder,
  type LiveOrderRow,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const REFRESH_MS = 20_000;

const STATUS_FILTERS = [
  { value: '', label: 'All live' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'preparing', label: 'Preparing' },
  { value: 'ready', label: 'Ready' },
  { value: 'picked_up', label: 'Picked up' },
  { value: 'in_transit', label: 'In transit' },
];

function money(n: number) {
  return new Intl.NumberFormat('en-JM', { style: 'currency', currency: 'JMD' }).format(n);
}

function when(iso: string) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  return new Date(iso).toLocaleString();
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'in_transit' || status === 'picked_up'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : status === 'ready'
        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
        : status === 'pending'
          ? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium border capitalize ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function LiveOpsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { prompt, confirm } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);

  const [orders, setOrders] = useState<LiveOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await listLiveOrders(session.access_token, {
        status: status || undefined,
        unassigned: unassignedOnly || undefined,
      });
      setOrders(res.orders);
      setLastUpdated(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load live orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [session.access_token, status, unassignedOnly]);

  useEffect(() => {
    setLoading(true);
    void load();
    const id = window.setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const runCancel = async (order: LiveOrderRow) => {
    if (!canWrite) return;
    const values = await prompt({
      title: `Cancel ${order.order_number}?`,
      description: 'The customer and merchant will be notified. Any charge is refunded.',
      confirmLabel: 'Cancel order',
      variant: 'danger',
      fields: [{ key: 'reason', label: 'Cancellation reason', required: true, multiline: true }],
    });
    if (!values) return;
    setBusyId(order.id);
    try {
      await cancelOrder(session.access_token, order.id, values.reason);
      toast.success('Order cancelled');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setBusyId(null);
    }
  };

  const runComplete = async (order: LiveOrderRow) => {
    if (!canWrite) return;
    const ok = await confirm({
      title: `Mark ${order.order_number} delivered?`,
      description: 'Force-completes the order and closes the delivery.',
      confirmLabel: 'Mark delivered',
    });
    if (!ok) return;
    setBusyId(order.id);
    try {
      await completeOrder(session.access_token, order.id);
      toast.success('Order completed');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setBusyId(null);
    }
  };

  const runRedispatch = async (order: LiveOrderRow) => {
    if (!canWrite) return;
    const values = await prompt({
      title: `Redispatch ${order.order_number}?`,
      description: 'Releases the current courier and re-offers the delivery to nearby couriers.',
      confirmLabel: 'Redispatch',
      fields: [{ key: 'reason', label: 'Reason', required: false, multiline: true }],
    });
    if (!values) return;
    setBusyId(order.id);
    try {
      await redispatchOrder(session.access_token, order.id, values.reason || undefined);
      toast.success('Order redispatched');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Redispatch failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            Live Ops
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Active deliveries in flight. {lastUpdated ? `Updated ${when(lastUpdated.toISOString())}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900"
          />
          Unassigned only
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-12 text-center text-slate-500 text-sm">
          No live orders right now.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Courier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Placed</th>
                {canWrite && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-900/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-white hover:text-amber-300"
                      onClick={() => navigate(`/orders/${o.id}`)}
                    >
                      {o.order_number}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{o.merchant_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {o.courier_display_name ?? <span className="text-amber-400">Unassigned</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-4 py-3">{money(o.total)}</td>
                  <td className="px-4 py-3 text-slate-500">{when(o.placed_at)}</td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void runRedispatch(o)}
                          className="text-xs px-2 py-1 rounded border border-amber-500/40 text-amber-200 disabled:opacity-40"
                        >
                          Redispatch
                        </button>
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void runComplete(o)}
                          className="text-xs px-2 py-1 rounded border border-emerald-500/40 text-emerald-200 disabled:opacity-40"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          disabled={busyId === o.id}
                          onClick={() => void runCancel(o)}
                          className="text-xs px-2 py-1 rounded border border-red-500/40 text-red-200 disabled:opacity-40"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
