import React, { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../utils/dashAdminRoles';
import {
  cancelOrder,
  createSupportCase,
  getOrderDetail,
  listSupportCases,
  refundOrder,
  type SupportCaseRow,
} from '../services/dashAdminService';
import type { AdminOutletContext } from '../DashAdminPortal';

export function SupportToolsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { confirm, prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const token = session.access_token;

  const [lookup, setLookup] = useState('');
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [transaction, setTransaction] = useState<Record<string, unknown> | null>(null);

  const [cases, setCases] = useState<SupportCaseRow[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [caseStatus, setCaseStatus] = useState('open');

  const loadCases = useCallback(async () => {
    setCasesLoading(true);
    try {
      const res = await listSupportCases(token, caseStatus || undefined);
      setCases(res.cases);
    } catch {
      setCases([]);
    } finally {
      setCasesLoading(false);
    }
  }, [token, caseStatus]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const runCreateCase = async () => {
    if (!canWrite) return;
    const values = await prompt({
      title: 'New support case',
      description: 'Log a support case for follow-up.',
      confirmLabel: 'Create case',
      fields: [
        { key: 'subject', label: 'Subject', required: true },
        { key: 'priority', label: 'Priority (low | normal | high | urgent)', placeholder: 'normal', required: false },
        { key: 'order_id', label: 'Related order ID (optional)', required: false },
        { key: 'customer_id', label: 'Related customer ID (optional)', required: false },
        { key: 'notes', label: 'Notes', required: false, multiline: true },
      ],
    });
    if (!values) return;
    try {
      await createSupportCase(token, {
        subject: values.subject,
        priority: values.priority?.trim() || undefined,
        order_id: values.order_id?.trim() || undefined,
        customer_id: values.customer_id?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      });
      toast.success('Case created');
      void loadCases();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const doLookup = async () => {
    const id = lookup.trim();
    if (!id) return;
    setLoading(true);
    try {
      const res = await getOrderDetail(token, id);
      setOrder(res.order);
      setEvents(res.events);
      setTransaction(res.transaction ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order not found');
      setOrder(null);
      setEvents([]);
      setTransaction(null);
    } finally {
      setLoading(false);
    }
  };

  const runCancel = async () => {
    if (!order?.id || !canWrite) return;
    const ok = await confirm({
      title: 'Cancel order?',
      description: `Cancel order ${String(order.order_number ?? order.id)}? Paid orders will queue a refund.`,
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

  const runRefund = async () => {
    if (!order?.id || !canWrite) return;
    const values = await prompt({
      title: 'Refund order',
      description: 'Leave amount blank for full remaining balance.',
      confirmLabel: 'Issue refund',
      variant: 'danger',
      fields: [
        { key: 'amount', label: 'Amount (optional)', placeholder: 'Full if blank', required: false },
        { key: 'reason', label: 'Reason', placeholder: 'Why?', required: true, multiline: true },
      ],
    });
    if (!values) return;
    const amountRaw = values.amount?.trim();
    const amount = amountRaw ? Number(amountRaw) : undefined;
    try {
      const res = await refundOrder(token, String(order.id), {
        reason: values.reason,
        ...(amount != null ? { amount } : {}),
      }) as { payment_status?: string; providerCompleted?: boolean; providerError?: string | null };
      if (res.providerCompleted) toast.success('Refund completed');
      else {
        toast.success(`Refund queued (${res.payment_status || 'pending'})`);
        if (res.providerError) toast.message(res.providerError);
      }
      void doLookup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refund failed');
    }
  };

  const paymentStatus = String(order?.payment_status || '');
  const canRefund = !!order && ['paid', 'refund_pending', 'partially_refunded'].includes(paymentStatus) && !!transaction;
  const customer = order?.customer as { id?: string; name?: string } | null;

  return (
    <div className="space-y-8 max-w-2xl">
      <h2 className="text-xl font-semibold text-white">Support tools</h2>
      <p className="text-sm text-slate-400">Look up an order by ID.</p>

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
          <p className="text-sm text-slate-400">Status: {String(order.status)} · Payment: {paymentStatus || '—'}</p>
          {customer?.id && (
            <Link to={`/customers/${customer.id}`} className="text-sm text-amber-400 hover:text-amber-300 block">
              Customer: {customer.name || customer.id}
            </Link>
          )}
          <Link to={`/orders/${String(order.id)}`} className="text-sm text-slate-400 hover:text-white block">
            Open full order detail
          </Link>
          {canWrite && (
            <div className="flex flex-wrap gap-3">
              {String(order.status) !== 'cancelled' && (
                <button type="button" onClick={() => void runCancel()} className="text-sm text-red-400 hover:text-red-300">
                  Cancel order
                </button>
              )}
              {canRefund && (
                <button type="button" onClick={() => void runRefund()} className="text-sm text-amber-400 hover:text-amber-300">
                  Refund
                </button>
              )}
            </div>
          )}
          <div className="space-y-1 pt-2 border-t border-slate-800">
            {events.map((ev) => (
              <p key={String(ev.id)} className="text-xs text-slate-500">{String(ev.status)} — {new Date(String(ev.created_at)).toLocaleString()}</p>
            ))}
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">Support cases</h3>
          {canWrite && (
            <button type="button" onClick={() => void runCreateCase()} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium">
              New case
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {(['open', 'in_progress', 'resolved', ''] as const).map((s) => (
            <button
              key={s || 'all'}
              type="button"
              onClick={() => setCaseStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs capitalize ${
                caseStatus === s ? 'bg-slate-700 text-white' : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              {s ? s.replace(/_/g, ' ') : 'all'}
            </button>
          ))}
        </div>
        {casesLoading ? (
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        ) : cases.length === 0 ? (
          <p className="text-sm text-slate-500">No cases.</p>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 text-white">{c.subject}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{c.priority ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{c.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
