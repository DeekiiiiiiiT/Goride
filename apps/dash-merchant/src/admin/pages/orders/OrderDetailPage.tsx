import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { cancelOrder, completeOrder, getOrderDetail } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { confirm } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getOrderDetail(session.access_token, id);
      setOrder(res.order);
      setEvents(res.events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order not found');
    } finally {
      setLoading(false);
    }
  }, [id, session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCancel = async () => {
    if (!id || !canWrite) return;
    const ok = await confirm({
      title: 'Cancel order?',
      description: `Cancel order ${String(order?.order_number ?? id)}?`,
      confirmLabel: 'Cancel order',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cancelOrder(session.access_token, id, 'Admin cancellation');
      toast.success('Order cancelled');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  const runComplete = async () => {
    if (!id || !canWrite) return;
    const ok = await confirm({ title: 'Complete order?', description: 'Mark this order as completed?', confirmLabel: 'Complete' });
    if (!ok) return;
    try {
      await completeOrder(session.access_token, id);
      toast.success('Order completed');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>;
  }

  if (!order) return <p className="text-slate-400">Order not found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <button type="button" onClick={() => navigate('/orders')} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{String(order.order_number)}</h2>
          <p className="text-sm text-slate-400 mt-1">Status: {String(order.status)}</p>
          <p className="text-sm text-slate-400">Total: ${Number(order.total).toFixed(2)}</p>
        </div>
        {canWrite && String(order.status) !== 'cancelled' && String(order.status) !== 'completed' && (
          <div className="flex gap-2">
            <button type="button" onClick={() => void runCancel()} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300 border border-red-500/30">Cancel</button>
            <button type="button" onClick={() => void runComplete()} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">Complete</button>
          </div>
        )}
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-sm font-medium text-white mb-3">Timeline</h3>
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={String(ev.id)} className="text-xs text-slate-400">
              <span className="text-slate-300">{String(ev.status)}</span>
              {ev.notes ? <span> — {String(ev.notes)}</span> : null}
              <span className="block text-slate-500">{new Date(String(ev.created_at)).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
