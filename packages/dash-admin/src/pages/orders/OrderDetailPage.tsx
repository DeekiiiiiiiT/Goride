import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  cancelOrder,
  completeOrder,
  getOrderDetail,
  refundOrder,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const { confirm, prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [transaction, setTransaction] = useState<Record<string, unknown> | null>(null);
  const [refunds, setRefunds] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getOrderDetail(session.access_token, id);
      setOrder(res.order);
      setEvents(res.events);
      setTransaction(res.transaction ?? null);
      setRefunds(res.refunds ?? []);
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
      description: `Cancel order ${String(order?.order_number ?? id)}? Paid orders will queue a refund.`,
      confirmLabel: 'Cancel order',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await cancelOrder(session.access_token, id, 'Admin cancellation') as {
        refund?: { payment_status?: string; providerError?: string; error?: string };
      };
      toast.success('Order cancelled');
      if (res.refund?.providerError) {
        toast.message(`Refund queued (provider: ${res.refund.providerError})`);
      } else if (res.refund?.error) {
        toast.error(`Cancel OK but refund failed: ${res.refund.error}`);
      }
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  const runRefund = async () => {
    if (!id || !canWrite) return;
    const values = await prompt({
      title: 'Refund order',
      description: 'Leave amount blank for full remaining balance. Provider may leave refund pending if not configured.',
      confirmLabel: 'Issue refund',
      variant: 'danger',
      fields: [
        { key: 'amount', label: 'Amount (optional)', placeholder: 'Full amount if blank', required: false },
        { key: 'reason', label: 'Reason', placeholder: 'Why is this being refunded?', required: true, multiline: true },
      ],
    });
    if (!values) return;
    const amountRaw = values.amount?.trim();
    const amount = amountRaw ? Number(amountRaw) : undefined;
    if (amountRaw && (!Number.isFinite(amount) || (amount as number) <= 0)) {
      toast.error('Enter a valid refund amount');
      return;
    }
    try {
      const res = await refundOrder(session.access_token, id, {
        reason: values.reason,
        ...(amount != null ? { amount } : {}),
      }) as { payment_status?: string; providerCompleted?: boolean; providerError?: string | null };
      if (res.providerCompleted) {
        toast.success(`Refund completed (${res.payment_status})`);
      } else {
        toast.success(`Refund queued as ${res.payment_status || 'refund_pending'}`);
        if (res.providerError) toast.message(res.providerError);
      }
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refund failed');
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

  const customer = order.customer as { id?: string; name?: string; phone?: string } | null;
  const merchant = order.merchant as { id?: string; name?: string } | null;
  const paymentStatus = String(order.payment_status || '—');
  const canRefund = ['paid', 'refund_pending', 'partially_refunded'].includes(paymentStatus) && !!transaction;

  return (
    <div className="space-y-6 max-w-3xl">
      <button type="button" onClick={() => navigate('/orders')} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to orders
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{String(order.order_number)}</h2>
          <p className="text-sm text-slate-400 mt-1">Status: {String(order.status)}</p>
          <p className="text-sm text-slate-400">Payment: {paymentStatus}</p>
          <p className="text-sm text-slate-400">Total: ${Number(order.total).toFixed(2)}</p>
          {customer?.id && (
            <button
              type="button"
              onClick={() => navigate(`/customers/${customer.id}`)}
              className="text-sm text-amber-400 hover:text-amber-300 mt-2 block"
            >
              Customer: {customer.name || customer.id}{customer.phone ? ` · ${customer.phone}` : ''}
            </button>
          )}
          {merchant?.name && (
            <p className="text-sm text-slate-400 mt-1">Merchant: {merchant.name}</p>
          )}
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {String(order.status) !== 'cancelled' && String(order.status) !== 'completed' && (
              <>
                <button type="button" onClick={() => void runCancel()} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/20 text-red-300 border border-red-500/30">Cancel</button>
                <button type="button" onClick={() => void runComplete()} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white">Complete</button>
              </>
            )}
            {canRefund && (
              <button type="button" onClick={() => void runRefund()} className="px-3 py-1.5 text-sm rounded-lg bg-amber-600/20 text-amber-200 border border-amber-500/30">
                Refund
              </button>
            )}
          </div>
        )}
      </div>

      {transaction && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-1 text-sm">
          <h3 className="text-sm font-medium text-white mb-2">Payment transaction</h3>
          <p className="text-slate-400 font-mono text-xs">{String(transaction.id)}</p>
          <p className="text-slate-300">${Number(transaction.amount).toFixed(2)} · {String(transaction.provider || '—')} · {String(transaction.status)}</p>
        </section>
      )}

      {refunds.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h3 className="text-sm font-medium text-white mb-3">Refunds</h3>
          <div className="space-y-2">
            {refunds.map((r) => (
              <div key={String(r.id)} className="text-xs text-slate-400">
                <span className="text-slate-300">${Number(r.amount).toFixed(2)}</span>
                {' · '}{String(r.status)}
                {r.reason ? ` — ${String(r.reason)}` : ''}
              </div>
            ))}
          </div>
        </section>
      )}

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
