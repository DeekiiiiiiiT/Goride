import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../utils/dashAdminRoles';
import { cancelOrder, completeOrder, getOrderDetail } from '../services/dashAdminService';
import type { AdminOutletContext } from '../DashAdminPortal';

export function SupportToolsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { confirm } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const token = session.access_token;

  const [lookup, setLookup] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);

  const doLookup = async () => {
    const id = lookup.trim();
    if (!id) return;
    setLoading(true);
    try {
      const res = await getOrderDetail(token, id);
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
    try {
      await cancelOrder(token, String(order.id), 'Support cancellation');
      toast.success('Order cancelled');
      void doLookup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Support tools</h2>
      <p className="text-sm text-slate-400">Look up an order by ID or order number UUID.</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void doLookup()}
            placeholder="Order ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
          />
        </div>
        <button type="button" onClick={() => void doLookup()} className="px-4 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium">
          Lookup
        </button>
      </div>

      {loading && <Loader2 className="w-6 h-6 animate-spin text-amber-400" />}

      {order && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
          <p className="text-white font-medium">{String(order.order_number)}</p>
          <p className="text-sm text-slate-400">Status: {String(order.status)}</p>
          {canWrite && String(order.status) !== 'cancelled' && (
            <button type="button" onClick={() => void runCancel()} className="text-sm text-red-400 hover:text-red-300">
              Cancel order
            </button>
          )}
          <div className="space-y-1 pt-2 border-t border-slate-800">
            {events.map((ev) => (
              <p key={String(ev.id)} className="text-xs text-slate-500">{String(ev.status)} — {new Date(String(ev.created_at)).toLocaleString()}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
