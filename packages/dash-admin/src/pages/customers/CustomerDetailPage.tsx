import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canDeleteDashAdmin, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  deleteCustomer,
  getCustomerDetail,
  patchCustomerNotes,
  suspendCustomer,
  unsuspendCustomer,
  type CustomerAddress,
  type CustomerDevice,
  type CustomerTrust,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

type TabId = 'overview' | 'addresses' | 'orders' | 'trust' | 'devices';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'addresses', label: 'Addresses' },
  { id: 'orders', label: 'Orders' },
  { id: 'trust', label: 'Trust' },
  { id: 'devices', label: 'Devices' },
];

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

function when(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const canDelete = canDeleteDashAdmin(session.user);

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('overview');
  const [customer, setCustomer] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<Array<Record<string, unknown>>>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [lifetimeSpend, setLifetimeSpend] = useState(0);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [devices, setDevices] = useState<CustomerDevice[]>([]);
  const [trust, setTrust] = useState<CustomerTrust | null>(null);
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
      const savedAddr = Array.isArray(res.customer.saved_addresses)
        ? (res.customer.saved_addresses as CustomerAddress[])
        : [];
      setAddresses(res.addresses ?? savedAddr);
      setDevices(res.devices ?? []);
      setTrust(res.trust ?? null);
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
      fields: [{ key: 'reason', label: 'Suspension reason', required: true, multiline: true }],
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
        { key: 'reason', label: 'Reason', placeholder: 'e.g. Test account cleanup', required: true, multiline: true },
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

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{String(customer.name || '—')}</h2>
          <p className="text-sm text-slate-400">
            {String((customer as { authEmail?: string }).authEmail || customer.email || '')}
          </p>
          {customer.phone ? <p className="text-sm text-slate-400">Phone: {String(customer.phone)}</p> : null}
          <p className="text-sm text-slate-400 mt-1">
            Status: {status} · {orderCount} orders · Lifetime {money(lifetimeSpend)}
          </p>
        </div>
        {trust?.flagged && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-red-500/40 text-red-300">
            <ShieldAlert className="w-3.5 h-3.5" /> Flagged
          </span>
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

      <div className="flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-2 text-sm text-slate-300">
            <div className="grid grid-cols-2 gap-2">
              <p className="text-slate-500">Joined</p>
              <p>{when(customer.created_at as string)}</p>
              <p className="text-slate-500">Default address</p>
              <p>{String(customer.default_address || '—')}</p>
              <p className="text-slate-500">Email verified</p>
              <p>{trust?.email_verified ? 'Yes' : trust?.email_verified === false ? 'No' : '—'}</p>
              <p className="text-slate-500">Phone verified</p>
              <p>{trust?.phone_verified ? 'Yes' : trust?.phone_verified === false ? 'No' : '—'}</p>
            </div>
            {status === 'suspended' && (
              <div className="mt-2 text-sm text-red-300/90 space-y-0.5">
                {customer.suspended_reason ? <p>Reason: {String(customer.suspended_reason)}</p> : null}
                {customer.suspended_at ? <p>Since {when(customer.suspended_at as string)}</p> : null}
              </div>
            )}
          </section>

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
      )}

      {tab === 'addresses' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          {addresses.length === 0 ? (
            <p className="text-sm text-slate-500">No saved addresses.</p>
          ) : (
            <ul className="divide-y divide-slate-800 text-sm">
              {addresses.map((a, i) => (
                <li key={a.id ?? i} className="py-3">
                  <p className="text-white">
                    {a.label ? `${a.label} · ` : ''}
                    {[a.line1, a.line2].filter(Boolean).join(', ') || '—'}
                    {a.is_default && <span className="ml-2 text-xs text-amber-300">Default</span>}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {[a.city, a.parish].filter(Boolean).join(', ')}
                    {a.lat != null && a.lng != null ? ` · ${a.lat}, ${a.lng}` : ''}
                  </p>
                  {a.instructions && <p className="text-slate-500 text-xs mt-0.5">Note: {a.instructions}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'orders' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            orders.map((o) => (
              <button
                key={String(o.id)}
                type="button"
                onClick={() => navigate(`/orders/${o.id}`)}
                className="block w-full text-left text-sm text-slate-400 py-1.5 hover:text-amber-300"
              >
                {String(o.order_number)} — {String(o.status)} — {money(Number(o.total))}
                {o.merchant_name ? ` · ${String(o.merchant_name)}` : ''}
              </button>
            ))
          )}
        </section>
      )}

      {tab === 'trust' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm">
          {!trust ? (
            <p className="text-slate-500">No trust signals available.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <p className="text-slate-500">Risk level</p>
              <p className="capitalize">{trust.risk_level ?? '—'}{trust.risk_score != null ? ` (${trust.risk_score})` : ''}</p>
              <p className="text-slate-500">Chargebacks</p>
              <p>{trust.chargebacks ?? 0}</p>
              <p className="text-slate-500">Refunds</p>
              <p>{trust.refunds_count ?? 0}{trust.refunds_amount != null ? ` · ${money(trust.refunds_amount)}` : ''}</p>
              <p className="text-slate-500">Cancelled orders</p>
              <p>{trust.cancelled_orders ?? 0}</p>
              {trust.flags && trust.flags.length > 0 && (
                <>
                  <p className="text-slate-500">Flags</p>
                  <p className="text-red-300">{trust.flags.join(', ')}</p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {tab === 'devices' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">No devices on record.</p>
          ) : (
            <ul className="divide-y divide-slate-800 text-sm">
              {devices.map((d, i) => (
                <li key={d.id ?? i} className="py-3 flex justify-between gap-4">
                  <div>
                    <p className="text-white capitalize">
                      {d.platform ?? 'device'} {d.model ? `· ${d.model}` : ''}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {d.app_version ? `v${d.app_version}` : ''}
                      {d.push_enabled != null ? ` · push ${d.push_enabled ? 'on' : 'off'}` : ''}
                    </p>
                  </div>
                  <span className="text-slate-500 text-xs">{when(d.last_active_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
