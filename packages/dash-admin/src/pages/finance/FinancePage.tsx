import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { API_ENDPOINTS } from '@roam/api-client';
import { canApproveFinance, canWriteDashAdmin } from '../../utils/dashAdminRoles';
import {
  createAdjustment,
  holdPayout,
  listAdjustments,
  listDisputes,
  listPayouts,
  releasePayout,
  resolveDispute,
  type AdjustmentRow,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

type TabId = 'payouts' | 'disputes' | 'adjustments';

const TABS: { id: TabId; label: string }[] = [
  { id: 'payouts', label: 'Payouts' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'adjustments', label: 'Adjustments' },
];

export function FinancePage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const { prompt } = useAdminConfirm();
  const canWrite = canWriteDashAdmin(session.user);
  const canApprove = canApproveFinance(session.user);
  const [tab, setTab] = useState<TabId>('payouts');

  const [payouts, setPayouts] = useState<Array<Record<string, unknown>>>([]);
  const [disputes, setDisputes] = useState<Array<Record<string, unknown>>>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [batches, setBatches] = useState<Array<Record<string, unknown>>>([]);
  const [orderId, setOrderId] = useState('');
  const [orderMoney, setOrderMoney] = useState<string | null>(null);
  const [riskCases, setRiskCases] = useState<Array<Record<string, unknown>>>([]);
  const [chargebacks, setChargebacks] = useState<Array<Record<string, unknown>>>([]);
  const [chargebackWords, setChargebackWords] = useState('');
  const [evidence, setEvidence] = useState<string | null>(null);

  const refresh = async () => {
    const [p, d, a] = await Promise.all([
      listPayouts(session.access_token),
      listDisputes(session.access_token),
      listAdjustments(session.access_token).catch(() => ({ adjustments: [] })),
    ]);
    setPayouts((p as { payouts: Array<Record<string, unknown>> }).payouts ?? []);
    setDisputes((d as { disputes: Array<Record<string, unknown>> }).disputes ?? []);
    setAdjustments((a as { adjustments: AdjustmentRow[] }).adjustments ?? []);
  };

  useEffect(() => {
    void refresh()
      .catch(console.error)
      .finally(() => setLoading(false));
    void loadBatches().catch(() => setBatches([]));
    void fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/risk`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((body) => setRiskCases(body.cases || []))
      .catch(() => setRiskCases([]));
    void fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/chargebacks`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((body) => {
        setChargebacks(body.chargebacks || []);
        setChargebackWords(body.words || '');
      })
      .catch(() => {
        setChargebacks([]);
        setChargebackWords('Could not load chargebacks.');
      });
  }, [session.access_token]);

  const loadBatches = async () => {
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/payout-batches`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not load payout batches');
    setBatches(body.batches || []);
  };

  const prepareWeek = async () => {
    setFormError(null);
    setCreating(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/payout-batches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyType: 'merchant' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not prepare this week');
      await loadBatches();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not prepare this week');
    } finally {
      setCreating(false);
    }
  };

  const approveBatch = async (batchId: string) => {
    setFormError(null);
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/payout-batches/${batchId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(body.error || 'A different finance approver must confirm this batch');
      return;
    }
    await loadBatches();
  };

  const lookupOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) return;
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/orders/${orderId.trim()}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setOrderMoney(body.error || 'Order not found');
      return;
    }
    const paid = (body.transactions || []).map((row: { amount?: number; status?: string }) => `Charge J$${Number(row.amount || 0).toFixed(2)} (${row.status})`).join('. ');
    const refunded = (body.refunds || []).map((row: { amount?: number; status?: string; reason?: string }) => `Refund J$${Number(row.amount || 0).toFixed(2)} (${row.status})`).join('. ');
    setOrderMoney([paid, refunded].filter(Boolean).join(' ') || 'No card charges on this order yet.');
  };

  const showEvidence = async (orderId: string) => {
    setEvidence('Loading the photo, pin, and wait…');
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/orders/${orderId}/evidence`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEvidence(body.error || 'Could not load the evidence for this order.');
      return;
    }
    const photo = body.photo ? 'A photo is attached.' : 'No photo was attached.';
    setEvidence(`Order ${body.orderNumber || orderId}. ${body.waitWords} ${body.pinWords} ${photo}`);
  };

  const runResolve = async (dispute: Record<string, unknown>) => {
    if (!canWrite) return;
    const values = await prompt({
      title: 'Resolve dispute',
      description: `Order ${String(dispute.order_id)}. The restaurant pays the food. Roam pays the delivery and service unless the notes say the courier was at fault. A refund above J$10,000 needs a second finance person.`,
      confirmLabel: 'Save',
      fields: [
        { key: 'status', label: 'Status (open | investigating | resolved | refunded | denied)', placeholder: String(dispute.status || 'resolved'), required: true },
        { key: 'refund_amount', label: 'Refund amount (required if status=refunded)', placeholder: 'e.g. 500', required: false },
        { key: 'fault_attribution', label: 'Who pays (merchant_fault, courier_fault, or platform)', placeholder: 'merchant_fault', required: false },
        { key: 'secondApproverId', label: 'Second approver id, required above J$10,000', placeholder: '', required: false },
        { key: 'resolution_notes', label: 'Notes', placeholder: 'Resolution notes', required: false, multiline: true },
      ],
    });
    if (!values) return;
    const status = values.status.trim().toLowerCase();
    const allowed = new Set(["investigating", "resolved", "refunded", "denied"]);
    if (!allowed.has(status)) {
      toast.error("Choose investigating, resolved, refunded, or denied");
      return;
    }
    const amountRaw = values.refund_amount?.trim();
    const refund_amount = amountRaw ? Number(amountRaw) : undefined;
    if (status === 'refunded' && (refund_amount == null || !Number.isFinite(refund_amount) || refund_amount <= 0)) {
      toast.error('Enter a positive refund amount when marking refunded');
      return;
    }
    try {
      const res = (await resolveDispute(session.access_token, String(dispute.id), {
        status,
        resolution_notes: values.resolution_notes || undefined,
        ...(refund_amount != null ? { refund_amount } : {}),
        ...(values.fault_attribution?.trim() ? { fault_attribution: values.fault_attribution.trim() } : {}),
        ...(values.secondApproverId?.trim() ? { secondApproverId: values.secondApproverId.trim() } : {}),
      })) as { refund?: { providerError?: string | null } };
      toast.success('Dispute updated');
      if (res.refund?.providerError) toast.message(`Refund queued: ${res.refund.providerError}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resolve failed');
    }
  };

  const runCreateAdjustment = async () => {
    if (!canWrite) return;
    const values = await prompt({
      title: 'Create adjustment',
      description: 'Manual credit or debit applied to a merchant balance.',
      confirmLabel: 'Create',
      fields: [
        { key: 'merchant_id', label: 'Merchant UUID', required: true },
        { key: 'type', label: 'Type (credit | debit)', placeholder: 'credit', required: true },
        { key: 'amount', label: 'Amount', placeholder: 'e.g. 1500', required: true },
        { key: 'reason', label: 'Reason', required: true, multiline: true },
      ],
    });
    if (!values) return;
    const amt = Number(values.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    try {
      await createAdjustment(session.access_token, {
        merchant_id: values.merchant_id.trim(),
        type: values.type.trim().toLowerCase(),
        amount: amt,
        reason: values.reason,
      });
      toast.success('Adjustment created');
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  if (loading) return <Loader2 className="w-8 h-8 animate-spin text-amber-400" />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-white">Finance</h2>
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
        <h3 className="text-sm font-medium text-slate-300">People to review</h3>
        {riskCases.length === 0 ? (
          <p className="text-sm text-slate-400">No open risk cases. Cash orders, the wallet, and payout sending stay off.</p>
        ) : (
          riskCases.map((row) => (
            <p key={String(row.id)} className="text-sm text-slate-200">
              {String(row.party_type || 'person')} · {String(row.reason || row.status || 'Needs a person to decide')}
            </p>
          ))
        )}
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2">
        <h3 className="text-sm font-medium text-slate-300">Chargebacks</h3>
        <p className="text-sm text-slate-200">{chargebackWords || 'No chargebacks were decided this month.'}</p>
        {chargebacks.length === 0 ? (
          <p className="text-sm text-slate-400">No chargebacks are open. A refund above J$10,000 still needs a second finance person.</p>
        ) : (
          chargebacks.map((row) => (
            <p key={String(row.id)} className="text-sm text-slate-200">
              Order {String(row.order_id || '').slice(0, 8)} · J${(Number(row.amount_minor || 0) / 100).toFixed(2)} · {String(row.status)}
              {row.deadline ? ` · reply by ${String(row.deadline)}` : ' · no deadline set'}
            </p>
          ))
        )}
      </section>

      <div className="flex gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-amber-400 text-amber-300' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'payouts' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-300">This week's restaurant payout</h3>
            <p className="text-sm text-slate-400">Hand-typed payouts are closed. Two different finance people must approve a week before anything is sent. Payouts are on. The name on the bank account must match the restaurant. A changed account waits 48 to 72 hours. A payment that comes back stays on this list until it is returned to the book.</p>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
            {canWrite && (
              <button type="button" disabled={creating} onClick={() => void prepareWeek()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
                {creating ? 'Preparing…' : 'Prepare this week'}
              </button>
            )}
            <ul className="space-y-2 text-sm text-slate-300">
              {batches.map((batch) => (
                <li key={String(batch.id)} className="flex flex-wrap items-center gap-3">
                  <span>J${(Number(batch.total_minor || 0) / 100).toFixed(2)} · {String(batch.status)} · {String(batch.period_start)} to {String(batch.period_end)}</span>
                  {canApprove && batch.status === 'prepared' && (
                    <button type="button" className="text-xs text-amber-400" onClick={() => void approveBatch(String(batch.id))}>Approve</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-300">Order money</h3>
            <form onSubmit={(e) => void lookupOrder(e)} className="flex flex-col gap-3 sm:flex-row">
              <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order id" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
              <button type="submit" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-white">Look up</button>
            </form>
            {orderMoney && <p className="text-sm text-slate-300">{orderMoney}</p>}
          </section>

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
                        <button type="button" className="text-xs text-amber-400" onClick={() => { void holdPayout(session.access_token, String(p.id), 'Held by admin').then(() => refresh()).catch((e) => toast.error(e instanceof Error ? e.message : 'Hold failed')); }}>Hold</button>
                      )}
                      {canWrite && String(p.status) === 'held' && (
                        <button type="button" className="text-xs text-emerald-400" onClick={() => { void releasePayout(session.access_token, String(p.id)).then(() => refresh()).catch((e) => toast.error(e instanceof Error ? e.message : 'Release failed')); }}>Release</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'disputes' && (
        <div className="space-y-3">
        {evidence && <p className="text-sm text-slate-200">{evidence}</p>}
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
              {disputes.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No disputes.</td></tr>
              )}
              {disputes.map((d) => (
                <tr key={String(d.id)}>
                  <td className="px-4 py-3 text-slate-300 font-mono text-xs">
                    <Link to={`/orders/${String(d.order_id)}`} className="text-amber-400 hover:text-amber-300">{String(d.order_id).slice(0, 8)}…</Link>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{String(d.reason)}</td>
                  <td className="px-4 py-3 text-slate-400">{String(d.status)}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => void showEvidence(String(d.order_id))} className="text-xs text-slate-300 mr-3">Evidence</button>
                    {canWrite && (
                      <button type="button" onClick={() => void runResolve(d)} className="text-xs text-amber-400 hover:text-amber-300">Resolve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {tab === 'adjustments' && (
        <div className="space-y-4">
          {canWrite && (
            <button type="button" onClick={() => void runCreateAdjustment()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">
              New adjustment
            </button>
          )}
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {adjustments.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No adjustments.</td></tr>
                )}
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-slate-300 font-mono text-xs">{a.merchant_id ? `${a.merchant_id.slice(0, 8)}…` : '—'}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{a.type}</td>
                    <td className={`px-4 py-3 ${a.type === 'debit' ? 'text-red-300' : 'text-emerald-300'}`}>${a.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-400">{a.reason}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
