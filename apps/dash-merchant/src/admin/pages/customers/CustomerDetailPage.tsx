import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import { getCustomerDetail, suspendCustomer, unsuspendCustomer } from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const canWrite = canWriteDashAdmin(session.user);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!id) return;
    void getCustomerDetail(session.access_token, id)
      .then((res) => {
        setCustomer((res as { customer: Record<string, unknown> }).customer);
        setOrders((res as { recentOrders: Array<Record<string, unknown>> }).recentOrders);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id, session.access_token]);

  if (loading) return <Loader2 className="w-8 h-8 animate-spin text-amber-400" />;
  if (!customer) return <p className="text-slate-400">Customer not found.</p>;

  const status = String(customer.account_status || 'active');

  return (
    <div className="space-y-6 max-w-3xl">
      <button type="button" onClick={() => navigate('/customers')} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div>
        <h2 className="text-xl font-semibold text-white">{String(customer.name)}</h2>
        <p className="text-sm text-slate-400">{String((customer as { authEmail?: string }).authEmail || customer.email || '')}</p>
        <p className="text-sm text-slate-400 mt-1">Status: {status}</p>
      </div>
      {canWrite && (
        <div className="flex gap-2">
          {status === 'active' ? (
            <button type="button" onClick={async () => { await suspendCustomer(session.access_token, id!, 'Admin suspend'); window.location.reload(); }} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300">Suspend</button>
          ) : (
            <button type="button" onClick={async () => { await unsuspendCustomer(session.access_token, id!); window.location.reload(); }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">Unsuspend</button>
          )}
        </div>
      )}
      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-sm font-medium text-white mb-3">Recent orders</h3>
        {orders.map((o) => (
          <div key={String(o.id)} className="text-sm text-slate-400 py-1">
            {String(o.order_number)} — {String(o.status)} — ${Number(o.total).toFixed(2)}
          </div>
        ))}
      </section>
    </div>
  );
}
