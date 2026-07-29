import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  createPayout,
  holdPayout,
  listDisputes,
  listPayouts,
  releasePayout,
  resolveDispute,
} from '../../services/dashAdminService';
import type { AdminOutletContext } from '../../DashAdminPortal';

export function FinancePage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);
  const [disputes, setDisputes] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [merchantId, setMerchantId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async () => {
    const [p, d] = await Promise.all([
      listPayouts(session.access_token),
      listDisputes(session.access_token),
    ]);
    setPayouts((p as { payouts: Array<Record<string, unknown>> }).payouts);
    setDisputes((d as { disputes: Array<Record<string, unknown>> }).disputes);
  };

  useEffect(() => {
    void refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session.access_token]);

  const handleCreatePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsedAmount = Number(amount);
    if (!merchantId.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Enter a merchant ID and a positive amount');
      return;
    }
    setCreating(true);
    try {
      await createPayout(session.access_token, {
        merchant_id: merchantId.trim(),
        amount: parsedAmount,
        notes: notes.trim() || undefined,
      });
      setMerchantId('');
      setAmount('');
      setNotes('');
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to create payout');
    } finally {
      setCreating(false);
    }
  };

  const runResolve = async (dispute: Record<string, unknown>) => {
    if (!canWrite) return;
    const values = await prompt({
      title: 'Resolve dispute',
      description: `Order ${String(dispute.order_id)}. Choosing "refunded" with an amount will trigger a real refund.`,
      confirmLabel: 'Save',
      fields: [
        {
          key: 'status',
          label: 'Status (open | investigating | resolved | refunded | denied)',
          placeholder: String(dispute.status || 'resolved'),
          required: true,
        },
        {
          key: 'refund_amount',
          label: 'Refund amount (required if status=refunded)',
          placeholder: 'e.g. 500',
          required: false,
        },
        {
          key: 'resolution_notes',
          label: 'Notes',
          placeholder: 'Resolution notes',
          required: false,
          multiline: true,
        },
      ],
    });
    if (!values) return;
    const status = values.status.trim().toLowerCase();
    const amountRaw = values.refund_amount?.trim();
    const refund_amount = amountRaw ? Number(amountRaw) : undefined;
    if (status === 'refunded' && (refund_amount == null || !Number.isFinite(refund_amount) || refund_amount <= 0)) {
      toast.error('Enter a positive refund amount when marking refunded');
      return;
    }
    try {
      const res = await resolveDispute(session.access_token, String(dispute.id), {
        status,
        resolution_notes: values.resolution_notes || undefined,
        ...(refund_amount != null ? { refund_amount } : {}),
      }) as { refund?: { providerError?: string | null; providerCompleted?: boolean } };
      toast.success('Dispute updated');
      if (res.refund?.providerError) toast.message(`Refund queued: ${res.refund.providerError}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resolve failed');
    }
  };

  if (loading) return <Loader2 className="w-8 h-8 animate-spin text-amber-400" />;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Finance</h2>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
        <h3 className="text-sm font-medium text-slate-300">Create merchant payout</h3>
        <form onSubmit={(e) => void handleCreatePayout(e)} className="grid gap-3 sm:grid-cols-2">
          <input
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="Merchant UUID"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white sm:col-span-2"
          />
          {formError && <p className="text-sm text-red-400 sm:col-span-2">{formError}</p>}
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:col-span-2 sm:w-fit"
          >
            {creating ? 'Creating…' : 'Create payout'}
          </button>
        </form>
      </section>

      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Payouts</h3>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {payouts.map((p) => (
                <tr key={String(p.id)}>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">{String(p.merchant_id).slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-white">${Number(p.amount ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-400">{String(p.status)}</td>
                  <td className="px-4 py-3 space-x-2">
                    {canWrite && String(p.status) === 'pending' && (
                      <button
                        type="button"
                        className="text-xs text-amber-400"
                        onClick={() => {
                          void holdPayout(session.access_token, String(p.id), 'Held by admin')
                            .then(() => refresh())
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Hold failed'));
                        }}
                      >
                        Hold
                      </button>
                    )}
                    {canWrite && String(p.status) === 'held' && (
                      <button
                        type="button"
                        className="text-xs text-emerald-400"
                        onClick={() => {
                          void releasePayout(session.access_token, String(p.id))
                            .then(() => refresh())
                            .catch((e) => toast.error(e instanceof Error ? e.message : 'Release failed'));
                        }}
                      >
                        Release
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-slate-300 mb-3">Disputes</h3>
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/80 text-slate-400 text-left">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {disputes.map((d) => (
                <tr key={String(d.id)}>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                    <Link to={`/orders/${String(d.order_id)}`} className="text-amber-400 hover:text-amber-300">
                      {String(d.order_id).slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{String(d.reason)}</td>
                  <td className="px-4 py-3 text-slate-400">{String(d.status)}</td>
                  <td className="px-4 py-3">
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => void runResolve(d)}
                        className="text-xs text-amber-400 hover:text-amber-300"
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
