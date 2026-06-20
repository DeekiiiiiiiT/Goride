import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cancelOrder, completeOrder, getOrderById } from '../services/courierAdminService';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import { canWriteCourierAdmin } from '../utils/courierAdminRoles';

export function SupportToolsPage() {
  const { session } = useOutletContext<{ session: Session }>();
  const { confirm } = useAdminConfirm();
  const token = session.access_token;
  const canWrite = canWriteCourierAdmin(session.user);

  const [lookup, setLookup] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [acting, setActing] = useState(false);

  const doLookup = async () => {
    const id = lookup.trim();
    if (!id) return;
    setLoading(true);
    try {
      const res = await getOrderById(token, id);
      setOrder(res.order);
      setEvents(res.events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order not found');
      setOrder(null);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const runCancel = async () => {
    if (!order?.id || !canWrite) return;
    const ok = await confirm({
      title: 'Cancel order?',
      description: `Cancel order ${String(order.order_number ?? order.id)}?`,
      confirmLabel: 'Cancel order',
      variant: 'danger',
    });
    if (!ok) return;
    setActing(true);
    try {
      await cancelOrder(token, String(order.id), 'Support cancellation');
      toast.success('Order cancelled');
      void doLookup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setActing(false);
    }
  };

  const runComplete = async () => {
    if (!order?.id || !canWrite) return;
    const ok = await confirm({
      title: 'Force complete order?',
      description: 'Marks order as completed for support recovery.',
      confirmLabel: 'Complete',
    });
    if (!ok) return;
    setActing(true);
    try {
      await completeOrder(token, String(order.id));
      toast.success('Order completed');
      void doLookup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Complete failed');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-200">
      <div>
        <h2 className="text-xl font-semibold text-white">Support Tools</h2>
        <p className="text-sm text-slate-400 mt-1">Look up delivery orders by UUID and run support actions.</p>
      </div>

      <div className="flex gap-2 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="Order UUID"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-white"
          />
        </div>
        <button
          type="button"
          onClick={() => void doLookup()}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lookup'}
        </button>
      </div>

      {order && (
        <div className="rounded-xl border border-slate-800 p-5 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-white">{String(order.order_number ?? order.id)}</h3>
            <p className="text-sm text-slate-400 capitalize">Status: {String(order.status)}</p>
            <p className="text-sm text-slate-500">Courier: {String(order.courier_display_name ?? order.courier_id ?? '—')}</p>
            <p className="text-sm text-slate-500">Address: {String(order.delivery_address ?? '—')}</p>
          </div>
          {canWrite && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={() => void runCancel()}
                className="px-3 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm"
              >
                Cancel order
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => void runComplete()}
                className="px-3 py-2 rounded-lg border border-emerald-500/40 text-emerald-300 text-sm"
              >
                Force complete
              </button>
            </div>
          )}
          {events.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-2">Event log</h4>
              <ul className="text-xs text-slate-500 space-y-1">
                {events.map((e) => (
                  <li key={String(e.id)}>
                    {String(e.created_at)} — {String(e.status)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
