import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  deleteCustomer,
  getCustomerDetail,
  patchCustomerNotes,
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
  const [orderCount, setOrderCount] = useState(0);
  const [lifetimeSpend, setLifetimeSpend] = useState(0);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getCustomerDetail(session.access_token, id);
      setCustomer(res.customer);
      setOrders(res.recentOrders || []);
      setOrderCount(res.orderCount ?? 0);
      setLifetimeSpend(res.lifetimeSpend ?? 0);
      setNotes(String(res.customer.admin_internal_notes || ''));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, session.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveNotes = async () => {
    if (!id || !canWrite) return;
    setNotesSaving(true);
    try {
      await patchCustomerNotes(session.access_token, id, notes.trim() || null);
      toast.success('Notes saved');
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save notes');
    } finally {
      setNotesSaving(false);
    }
  };

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
          This removes <span className="text-white font-medium">{displayName}</span> from Roam Rush
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
  const savedAddresses = Array.isArray(customer.saved_addresses)
    ? (customer.saved_addresses as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <button type="button" onClick={() => navigate('/customers')} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div>
        <h2 className="text-xl font-semibold text-white">{String(customer.name || '—')}</h2>
        <p className="text-sm text-slate-400">{String((customer as { authEmail?: string }).authEmail || customer.email || '')}</p>
        {customer.phone ? <p className="text-sm text-slate-400">Phone: {String(customer.phone)}</p> : null}
        <p className="text-sm text-slate-400 mt-1">Status: {status}</p>
        {customer.created_at ? (
          <p className="text-sm text-slate-500">Joined {new Date(String(customer.created_at)).toLocaleString()}</p>
        ) : null}
        <p className="text-sm text-slate-400 mt-1">
          {orderCount} orders · Lifetime spend ${lifetimeSpend.toFixed(2)}
        </p>
        {status === 'suspended' && (
          <div className="mt-2 text-sm text-red-300/90 space-y-0.5">
            {customer.suspended_reason ? <p>Reason: {String(customer.suspended_reason)}</p> : null}
            {customer.suspended_at ? <p>Since {new Date(String(customer.suspended_at)).toLocaleString()}</p> : null}
          </div>
        )}
        {customer.default_address ? (
          <p className="text-sm text-slate-400 mt-2">Default address: {String(customer.default_address)}</p>
        ) : null}
        {savedAddresses.length > 0 && (
          <div className="mt-2 text-sm text-slate-500">
            Saved addresses:{' '}
            {savedAddresses.map((a) => String(a.line1 || a.label || '')).filter(Boolean).join(' · ') || '—'}
          </div>
        )}
      </div>
      {canWrite && (
        <div className="flex gap-2">
          {status === 'active' ? (
            <button type="button" onClick={() => void runSuspend()} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300">Suspend</button>
          ) : (
            <button type="button" onClick={async () => { await unsuspendCustomer(session.access_token, id!); toast.success('Unsuspended'); void load(); }} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">Unsuspend</button>
          )}
          <button
            type="button"
            onClick={() => navigate(`/orders?customer_id=${id}`)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-700 text-slate-300"
          >
            View all orders
          </button>
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <h3 className="text-sm font-medium text-white">Internal notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!canWrite}
          rows={4}
          placeholder="Support case notes (not visible to customer)"
          className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-white disabled:opacity-60"
        />
        {canWrite && (
          <button
            type="button"
            disabled={notesSaving}
            onClick={() => void saveNotes()}
            className="px-3 py-1.5 text-sm rounded-lg bg-amber-600 text-white disabled:opacity-50"
          >
            {notesSaving ? 'Saving…' : 'Save notes'}
          </button>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <h3 className="text-sm font-medium text-white mb-3">Recent orders</h3>
        {orders.length === 0 && <p className="text-sm text-slate-500">No orders yet.</p>}
        {orders.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            onClick={() => navigate(`/orders/${o.id}`)}
            className="block w-full text-left text-sm text-slate-400 py-1.5 hover:text-amber-300"
          >
            {String(o.order_number)} — {String(o.status)} — ${Number(o.total).toFixed(2)}
            {o.merchant_name ? ` · ${String(o.merchant_name)}` : ''}
          </button>
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
