import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  deleteCustomer,
  getCustomerDetail,
  suspendCustomer,
  unsuspendCustomer,
} from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const canDelete = canDeleteDashAdmin(session.user);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getCustomerDetail(session.access_token, id);
      setCustomer((res as { customer: Record<string, unknown> }).customer);
      setOrders((res as { recentOrders: Array<Record<string, unknown>> }).recentOrders);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSuspend = async () => {
    if (!id || !canWrite) return;
    const values = await prompt({
      title: 'Suspend customer',
      description: 'The customer will be unable to place orders until unsuspended.',
      confirmLabel: 'Suspend',
      variant: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Suspension reason',
          placeholder: 'Why is this customer being suspended?',
          required: true,
          multiline: true,
        },
      ],
    });
    if (!values) return;
    try {
      await suspendCustomer(session.access_token, id, values.reason);
      toast.success('Customer suspended');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Suspend failed');
    }
  };

  const runDelete = async () => {
    if (!id || !canDelete || !customer) return;
    const displayName = String(customer.name || '').trim() || id;
    const values = await prompt({
      title: 'Remove Dash customer?',
      description: (
        <>
          This removes <span className="text-white font-medium">{displayName}</span> from Roam Dash
          only. Their Roam login and profiles in other apps are untouched.
        </>
      ),
      confirmLabel: 'Remove customer',
      variant: 'danger',
      fields: [
        {
          key: 'reason',
          label: 'Reason',
          placeholder: 'e.g. Test account cleanup',
          required: true,
          multiline: true,
        },
        {
          key: 'confirm_name',
          label: `Type "${displayName}" to confirm`,
          placeholder: displayName,
          required: true,
          matchValue: displayName,
        },
      ],
    });
    if (!values) return;
    try {
      const res = await deleteCustomer(session.access_token, id, {
        reason: values.reason,
        confirm_name: values.confirm_name,
      });
      toast.success(res.message || 'Customer removed');
      navigate('/customers');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

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
            <button type="button" onClick={() => void runSuspend()} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300">Suspend</button>
          ) : (
            <button type="button" onClick={async () => { await unsuspendCustomer(session.access_token, id!); toast.success('Unsuspended'); void load(); }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">Unsuspend</button>
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

      {canDelete && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <h3 className="text-sm font-medium text-red-200">Danger zone</h3>
          <p className="text-sm text-red-100/70">
            Remove this Dash customer profile permanently. Does not delete their Roam account or other app access.
          </p>
          <button
            type="button"
            onClick={() => void runDelete()}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300 border border-red-500/30 hover:bg-red-600/30"
          >
            Remove Dash customer
          </button>
        </section>
      )}
    </div>
  );
}
