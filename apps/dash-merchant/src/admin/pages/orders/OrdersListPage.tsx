import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { listOrders, type DashOrderRow } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function OrdersListPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') || 'all';
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<DashOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOrders(session.access_token, {
        status: status === 'all' ? undefined : status,
        q: q || undefined,
        limit: 50,
      });
      setOrders(res.orders);
      setTotal(res.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [session.access_token, status, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Orders</h2>
        <p className="text-sm text-slate-400">{total} total</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'live', 'placed', 'preparing', 'delivered', 'cancelled'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => navigate(s === 'all' ? '/orders' : `/orders?status=${s}`)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              status === s ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order number or address..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="hover:bg-slate-800/50 cursor-pointer">
                  <td className="px-4 py-3 text-white font-medium">{o.order_number}</td>
                  <td className="px-4 py-3 text-slate-300">{o.status}</td>
                  <td className="px-4 py-3 text-slate-300">${Number(o.total).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(o.placed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
