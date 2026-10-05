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
  const [waitingBanks, setWaitingBanks] = useState<Array<{ id: string; partyType: string; name?: string; bank?: string; last4?: string }>>([]);
  const [appeals, setAppeals] = useState<Array<{ id: string; courierId?: string; reason?: string; amountMajor?: number; appealUntil?: string | null }>>([]);
  const [orderId, setOrderId] = useState('');
  const [orderMoney, setOrderMoney] = useState<string | null>(null);
  const [riskCases, setRiskCases] = useState<Array<Record<string, unknown>>>([]);
  const [chargebacks, setChargebacks] = useState<Array<Record<string, unknown>>>([]);
  const [chargebackWords, setChargebackWords] = useState('');
  const [evidence, setEvidence] = useState<{
    orderNumber?: string;
    waitWords?: string;
    pinWords?: string;
    photo?: string | null;
    dropoff?: { lat?: number; lng?: number } | null;
    attempts?: Array<{ attempt_type?: string; at?: string; latitude?: number; longitude?: number; photo_url?: string }>;
    issues?: Array<{ issue_type?: string; notes?: string; photo_url?: string; created_at?: string }>;
  } | null>(null);

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
    void loadWaitingBanks().catch(() => setWaitingBanks([]));
    void loadAppeals().catch(() => setAppeals([]));
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

  const loadWaitingBanks = async () => {
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/bank-accounts`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setWaitingBanks(body.waiting || []);
  };

  const loadAppeals = async () => {
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/deduction-appeals`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setAppeals(body.appeals || []);
  };

  const markBankReady = async (partyType: string, id: string) => {
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/bank-accounts/${partyType}/${id}/ready`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(body.error || 'Could not mark this account ready');
      return;
    }
    await loadWaitingBanks();
  };

  const decideAppeal = async (id: string, decision: 'upheld' | 'reversed') => {
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/deduction-appeals/${id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(body.error || 'Could not decide this appeal');
      return;
    }
    toast.success(body.words || 'Appeal decided');
    await loadAppeals();
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

  const downloadBatch = async (batchId: string) => {
    setFormError(null);
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/payout-batches/${batchId}/export`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(body.error || 'Could not download the payment file');
      return;
    }
    if (!body.csv) {
      setFormError(body.words || 'Nobody in this batch can be paid yet');
      await loadBatches();
      return;
    }
    if (body.words && Array.isArray(body.held) && body.held.length) toast.message(String(body.words));
    const blob = new Blob([String(body.csv || '')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = String(body.filename || 'payout.csv');
    link.click();
    URL.revokeObjectURL(url);
    await loadBatches();
  };

  const moveBatch = async (batchId: string, step: 'sent' | 'paid' | 'returned') => {
    setFormError(null);
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/payout-batches/${batchId}/${step}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(body.error || 'Could not update this batch');
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
    setEvidence({ waitWords: 'Loading the photo, pin, and wait…' });
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/orders/${orderId}/evidence`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEvidence({ waitWords: body.error || 'Could not load the evidence for this order.' });
      return;
    }
    setEvidence(body);
  };

  const decideChargeback = async (id: string, outcome: 'won' | 'lost', fault: string) => {
    const res = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/chargebacks/${id}/outcome`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, fault }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || 'Could not decide this dispute');
      return;
    }
    toast.success(body.words || 'Dispute decided');
    const reload = await fetch(`${API_ENDPOINTS.delivery}/admin/rush-money/chargebacks`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const next = await reload.json().catch(() => ({}));
    setChargebacks(next.chargebacks || []);
    setChargebackWords(next.words || '');
  };

  const decideDispute = async (dispute: Record<string, unknown>, status: string, fault: string) => {
    let refund_amount: number | undefined;
    if (status === 'refunded') {
      const values = await prompt({
        title: 'Refund amount',
        description: 'How much goes back on the card? Above J$10,000 needs a second finance person.',
        confirmLabel: 'Refund',
        fields: [
          { key: 'refund_amount', label: 'Amount', placeholder: '500', required: true },
          { key: 'secondApproverId', label: 'Second approver id, required above J$10,000', required: false },
        ],
      });
      if (!values) return;
      refund_amount = Number(values.refund_amount);
      if (!Number.isFinite(refund_amount) || refund_amount <= 0) {
        toast.error('Enter a positive refund amount');
        return;
      }
      try {
        await resolveDispute(session.access_token, String(dispute.id), {
          status,
          refund_amount,
          fault_attribution: fault,
          ...(values.secondApproverId?.trim() ? { secondApproverId: values.secondApproverId.trim() } : {}),
        } as { status: string; refund_amount: number; fault_attribution: string; secondApproverId?: string });
        toast.success('Dispute updated');
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update the dispute');
      }
      return;
    }
    try {
      await resolveDispute(session.access_token, String(dispute.id), {
        status,
        fault_attribution: fault,
      } as { status: string; fault_attribution: string });
      toast.success('Dispute updated');
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the dispute');
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
        <h3 className="text-sm font-medium text-slate-300">Courier deduction appeals</h3>
        {appeals.length === 0 ? (
          <p className="text-sm text-slate-400">No appeals are waiting.</p>
        ) : (
          appeals.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
              <span>
                J${Number(row.amountMajor || 0).toFixed(2)} · {row.reason || 'Deduction'}
                {row.appealUntil ? ` · window ends ${new Date(row.appealUntil).toLocaleDateString()}` : ''}
              </span>
              {canApprove && (
                <>
                  <button type="button" className="text-xs text-slate-300" onClick={() => void decideAppeal(row.id, 'upheld')}>Uphold</button>
                  <button type="button" className="text-xs text-amber-400" onClick={() => void decideAppeal(row.id, 'reversed')}>Reverse</button>
                </>
              )}
            </div>
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
            <div key={String(row.id)} className="space-y-2 text-sm text-slate-200">
              <p>
                Order {String(row.order_id || '').slice(0, 8)} · J${(Number(row.amount_minor || 0) / 100).toFixed(2)} · {String(row.status)}
                {row.deadline ? ` · reply by ${String(row.deadline)}` : ' · no deadline set'}
              </p>
              {canApprove && ['open', 'fighting'].includes(String(row.status)) && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="text-xs text-emerald-400" onClick={() => void decideChargeback(String(row.id), 'won', 'platform')}>Won</button>
                  {(['customer', 'merchant', 'courier', 'platform'] as const).map((fault) => (
                    <button key={`${String(row.id)}-${fault}`} type="button" className="text-xs text-amber-400" onClick={() => void decideChargeback(String(row.id), 'lost', fault)}>
                      Lost · {fault}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            <h3 className="text-sm font-medium text-slate-300">Bank accounts waiting</h3>
            {waitingBanks.length === 0 ? (
              <p className="text-sm text-slate-400">No bank accounts are waiting.</p>
            ) : (
              waitingBanks.map((row) => (
                <p key={row.id} className="flex flex-wrap items-center gap-3 text-sm text-slate-200">
                  <span>{row.partyType} · {row.name || 'Unnamed'} · {row.bank || 'No bank'} · ending {row.last4 || '----'}</span>
                  {canApprove && (
                    <button type="button" className="text-xs text-amber-400" onClick={() => void markBankReady(row.partyType, row.id)}>Mark ready</button>
                  )}
                </p>
              ))
            )}
            <ul className="space-y-2 text-sm text-slate-300">
              {batches.map((batch) => (
                <li key={String(batch.id)} className="flex flex-wrap items-center gap-3">
                  <span>J${(Number(batch.total_minor || 0) / 100).toFixed(2)} · {String(batch.status)} · {String(batch.period_start)} to {String(batch.period_end)}</span>
                  {canApprove && batch.status === 'prepared' && (
                    <button type="button" className="text-xs text-amber-400" onClick={() => void approveBatch(String(batch.id))}>Approve</button>
                  )}
                  {canApprove && batch.status === 'approved' && (
                    <button type="button" className="text-xs text-amber-400" onClick={() => void downloadBatch(String(batch.id))}>Download payment file</button>
                  )}
                  {canApprove && ['exported', 'sent', 'paid'].includes(String(batch.status)) && (
                    <button type="button" className="text-xs text-slate-300" onClick={() => void downloadBatch(String(batch.id))}>Download again</button>
                  )}
                  {canApprove && batch.status === 'exported' && (
                    <button type="button" className="text-xs text-amber-400" onClick={() => void moveBatch(String(batch.id), 'sent')}>Mark sent</button>
                  )}
                  {canApprove && batch.status === 'sent' && (
                    <button type="button" className="text-xs text-emerald-400" onClick={() => void moveBatch(String(batch.id), 'paid')}>Mark paid</button>
                  )}
                  {canApprove && (batch.status === 'exported' || batch.status === 'sent') && (
                    <button type="button" className="text-xs text-red-300" onClick={() => void moveBatch(String(batch.id), 'returned')}>Returned</button>
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
        {evidence && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3 text-sm text-slate-200">
            <h3 className="font-medium text-slate-100">Evidence {evidence.orderNumber ? `· ${evidence.orderNumber}` : ''}</h3>
            <p>{evidence.waitWords}</p>
            <p>{evidence.pinWords}</p>
            {evidence.dropoff?.lat != null && evidence.dropoff.lng != null && (
              <a className="text-amber-400" href={`https://www.openstreetmap.org/?mlat=${evidence.dropoff.lat}&mlon=${evidence.dropoff.lng}#map=16/${evidence.dropoff.lat}/${evidence.dropoff.lng}`} target="_blank" rel="noreferrer">
                Open the drop-off pin
              </a>
            )}
            <ol className="space-y-2">
              {(evidence.attempts || []).map((attempt, index) => (
                <li key={`${attempt.at}-${index}`}>
                  {attempt.attempt_type} {attempt.at ? `· ${attempt.at}` : ''}
                  {attempt.latitude != null ? ` · ${attempt.latitude}, ${attempt.longitude}` : ''}
                  {attempt.photo_url && (
                    <a className="ml-2 text-amber-400" href={attempt.photo_url} target="_blank" rel="noreferrer">Photo</a>
                  )}
                </li>
              ))}
            </ol>
            {(evidence.issues || []).map((issue, index) => (
              <p key={`${issue.created_at}-${index}`}>{issue.issue_type}: {issue.notes}</p>
            ))}
            {evidence.photo && <a className="text-amber-400" href={evidence.photo} target="_blank" rel="noreferrer">Open photo</a>}
          </section>
        )}
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
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(['customer_fault', 'merchant_fault', 'courier_fault', 'platform_fault'] as const).map((fault) => (
                          <span key={fault} className="contents">
                            <button type="button" className="text-xs text-emerald-400" onClick={() => void decideDispute(d, 'resolved', fault)}>Resolved · {fault.replace('_fault', '')}</button>
                            <button type="button" className="text-xs text-amber-400" onClick={() => void decideDispute(d, 'refunded', fault)}>Refund · {fault.replace('_fault', '')}</button>
                            <button type="button" className="text-xs text-slate-300" onClick={() => void decideDispute(d, 'denied', fault)}>Denied · {fault.replace('_fault', '')}</button>
                          </span>
                        ))}
                      </div>
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
