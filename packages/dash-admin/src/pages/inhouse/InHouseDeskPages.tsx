import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  archiveInHouseCard,
  createInHouseCard,
  getInHouseRecon,
  getInHouseReports,
  importInHouseStatement,
  listInHouseCardTransactions,
  listInHouseCards,
  updateInHouseCard,
} from '@roam/dash-admin-client';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';
import { formatMoney } from '../../components/ui/format';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { readStatementFile } from './statementCharges';

function useToken() {
  const { session } = useOutletContext<AdminOutletContext>();
  return session.access_token;
}

export { InHouseRestaurantsPage as InHouseStoresPage } from './restaurants/InHouseRestaurantsPage';
export { InHouseRestaurantsPage as InHouseMenuPage } from './restaurants/InHouseRestaurantsPage';

function money(amount: number) {
  return formatMoney(amount);
}

export function InHouseCardsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = useToken();
  const { confirm } = useAdminConfirm();
  const [tab, setTab] = useState<'transactions' | 'cards'>('transactions');
  const [cards, setCards] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<{ taskId: string; orderNumber: string; paidAt: string; customerTotal: number; bank: { postedOn: string; amountMinor: number; merchantText: string } | null }>>([]);
  const [unmatched, setUnmatched] = useState<Array<{ id: string; postedOn: string; amountMinor: number; merchantText: string }>>([]);
  const [statementCardId, setStatementCardId] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editLast4, setEditLast4] = useState('');
  const [editLimit, setEditLimit] = useState('');
  function loadCards() {
    return listInHouseCards(token).then((result) => {
      setCards((result.cards || []).filter((card) => card.active !== false));
    });
  }
  function loadTransactions() {
    return listInHouseCardTransactions(token).then((result) => {
      setOrders(result.orders);
      setUnmatched(result.unmatched);
    });
  }
  useEffect(() => {
    void loadCards().catch((error: Error) => toast.error(error.message));
    void loadTransactions().catch((error: Error) => toast.error(error.message));
  }, [token]);
  function startEdit(card: Record<string, unknown>) {
    setEditingId(String(card.id));
    setEditLabel(String(card.label || ''));
    setEditLast4(String(card.last4 || ''));
    setEditLimit(String(Math.round(Number(card.daily_limit_minor || 0) / 100)));
  }
  async function onStatement(file: File) {
    if (!statementCardId) {
      toast.error('Choose the card this statement belongs to.');
      return;
    }
    const charges = await readStatementFile(file);
    const result = await importInHouseStatement(token, charges.map((charge) => ({
      cardId: statementCardId,
      postedOn: charge.postedOn,
      amountMinor: charge.amountMinor,
      merchantText: charge.merchantText,
    })));
    await loadTransactions();
    toast.success(`${result.matched} matched`);
  }
  return (
    <div className="space-y-4 p-4 text-slate-100">
      {!embedded && <h1 className="text-xl font-semibold">Cards and spend</h1>}
      <div className="flex gap-2">
        <button type="button" className={`rounded px-3 py-1 ${tab === 'transactions' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => setTab('transactions')}>Transactions</button>
        <button type="button" className={`rounded px-3 py-1 ${tab === 'cards' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800'}`} onClick={() => setTab('cards')}>Cards</button>
      </div>
      {tab === 'transactions' ? (
        <div className="space-y-4">
          <section className="space-y-2 rounded border border-slate-800 p-3 text-sm">
            <h2 className="font-medium">Match bank statements</h2>
            <ol className="list-decimal space-y-1 pl-5 text-slate-400">
              <li>Download the card&apos;s statement from the bank as CSV or PDF.</li>
              <li>Choose the card
                <select className="ml-2 rounded bg-slate-900 p-2 text-slate-100" value={statementCardId} onChange={(event) => setStatementCardId(event.target.value)}>
                  <option value="">Select a card</option>
                  {cards.map((card) => <option key={String(card.id)} value={String(card.id)}>{String(card.label)} ·· {String(card.last4)}</option>)}
                </select>
              </li>
              <li>
                <label className={`inline-block rounded px-3 py-2 ${statementCardId ? 'bg-slate-800' : 'bg-slate-900 text-slate-500'}`}>
                  Upload statement
                  <input className="ml-2 text-sm" type="file" accept=".csv,.pdf,text/csv,application/pdf" disabled={!statementCardId} onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    void onStatement(file).catch((error: Error) => toast.error(error.message));
                  }} />
                </label>
                {!statementCardId ? <span className="ml-2 text-slate-500">Choose a card first</span> : null}
              </li>
            </ol>
          </section>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Customer paid</th>
                  <th className="p-3">Bank charge</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.taskId} className="border-t border-slate-800">
                    <td className="p-3">{order.orderNumber || 'Order'}</td>
                    <td className="p-3">{order.paidAt ? new Date(order.paidAt).toLocaleDateString('en-JM') : ''}</td>
                    <td className="p-3">{money(order.customerTotal)}</td>
                    <td className="p-3">{order.bank ? `${money(order.bank.amountMinor / 100)} · ${order.bank.postedOn} · ${order.bank.merchantText}` : 'Waiting for the statement'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 ? <p className="p-3">No paid orders yet.</p> : null}
          </div>
          {unmatched.length ? (
            <div className="space-y-2">
              <h2 className="font-medium">Bank charges with no order</h2>
              {unmatched.map((line) => (
                <p key={line.id} className="rounded border border-amber-900 p-3 text-sm">{money(line.amountMinor / 100)} · {line.postedOn} · {line.merchantText}</p>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <button type="button" className="rounded bg-amber-500 text-slate-950 px-3 py-2" onClick={() => setAdding(true)}>Add card</button>
          {cards.map((card) => {
            const id = String(card.id);
            const editing = editingId === id;
            return (
              <article key={id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-slate-800 p-3">
                {editing ? (
                  <form className="flex flex-wrap gap-2" onSubmit={(event) => {
                    event.preventDefault();
                    void updateInHouseCard(token, id, { label: editLabel, last4: editLast4, dailyLimitMinor: Math.round(Number(editLimit) * 100) })
                      .then(() => { setEditingId(null); return loadCards(); })
                      .catch((error: Error) => toast.error(error.message));
                  }}>
                    <input className="rounded bg-slate-900 p-2" value={editLabel} onChange={(event) => setEditLabel(event.target.value)} />
                    <input className="rounded bg-slate-900 p-2" value={editLast4} maxLength={4} onChange={(event) => setEditLast4(event.target.value)} />
                    <input className="rounded bg-slate-900 p-2" placeholder="Daily limit J$" value={editLimit} onChange={(event) => setEditLimit(event.target.value)} />
                    <button className="rounded bg-amber-500 text-slate-950 px-3" type="submit">Save</button>
                    <button className="rounded bg-slate-800 px-3" type="button" onClick={() => setEditingId(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-[16rem] flex-1 space-y-1">
                      <p>{String(card.label)} ·· {String(card.last4)}</p>
                      <p className="text-sm text-slate-400">
                        {formatMoney(Number(card.spentTodayMinor || 0) / 100)} of {formatMoney(Number(card.daily_limit_minor || 0) / 100)} used today
                      </p>
                      <div className="h-2 overflow-hidden rounded bg-slate-800">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${Math.min(100, Math.round((Number(card.spentTodayMinor || 0) / Math.max(1, Number(card.daily_limit_minor || 1))) * 100))}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="rounded bg-slate-800 px-3 py-1" type="button" onClick={() => startEdit(card)}>Edit</button>
                      <button className="rounded bg-slate-800 px-3 py-1" type="button" onClick={() => void confirm({
                        title: 'Archive this card?',
                        description: `${String(card.label)} ·· ${String(card.last4)} will no longer be offered to buyers. Past purchases stay.`,
                        confirmLabel: 'Archive card',
                        variant: 'danger',
                      }).then((ok) => {
                        if (!ok) return;
                        return archiveInHouseCard(token, id).then(() => loadCards());
                      }).catch((error: Error) => toast.error(error.message))}>Archive</button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {adding ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setAdding(false)}>
          <form className="w-full max-w-md space-y-3 rounded border border-slate-700 bg-slate-950 p-4" onClick={(event) => event.stopPropagation()} onSubmit={(event) => {
            event.preventDefault();
            void createInHouseCard(token, { label, last4, dailyLimitMinor: Math.round(Number(limit) * 100) })
              .then(() => {
                setAdding(false);
                setLabel('');
                setLast4('');
                setLimit('');
                setTab('cards');
                return loadCards();
              })
              .catch((error: Error) => toast.error(error.message));
          }}>
            <h2 className="text-lg font-semibold">Add card</h2>
            <label className="block text-sm">Name<input className="mt-1 w-full rounded bg-slate-900 p-2" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Ops Visa" required /></label>
            <label className="block text-sm">Last 4 digits<input className="mt-1 w-full rounded bg-slate-900 p-2" value={last4} maxLength={4} onChange={(event) => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 4421" required /></label>
            <label className="block text-sm">Daily limit J$<input className="mt-1 w-full rounded bg-slate-900 p-2" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="e.g. 20000" required /></label>
            <div className="flex gap-2">
              <button className="rounded bg-amber-500 text-slate-950 px-3 py-2" type="submit" disabled={last4.length !== 4}>Save</button>
              <button className="rounded bg-slate-800 px-3 py-2" type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
            {last4.length > 0 && last4.length !== 4 ? <p className="text-sm text-amber-200">Last 4 must be exactly 4 digits.</p> : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function InHouseReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = useToken();
  const [report, setReport] = useState<Record<string, number> | null>(null);
  const [recon, setRecon] = useState<Record<string, number> | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    void getInHouseReports(token).then((result) => { setReport(result); setLoadError(''); }).catch((error: Error) => setLoadError(error.message));
    void getInHouseRecon(token).then((result) => setRecon(result.counts)).catch(() => undefined);
  }, [token]);

  function downloadCsv() {
    if (!report) return;
    const rows = [
      ['metric', 'value'],
      ['orders_30d', String(report.orders || 0)],
      ['problem_rate', String(report.exceptionRate || 0)],
      ['median_claim_to_placed_minutes', String(report.medianClaimToPlacedMinutes || 0)],
      ['price_gap_minor', String(report.varianceMinor || 0)],
      ['matched', String(recon?.matched || 0)],
      ['waiting_statement', String(recon?.waiting || recon?.unmatchedOrders || 0)],
      ['bank_no_order', String(recon?.unmatched || recon?.unmatchedBank || 0)],
    ];
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'in-house-reports.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const tiles = report ? [
    { label: 'Orders (30 days)', value: String(report.orders || 0), hint: 'In-House orders customers placed', good: 'Steady growth week to week' },
    { label: 'Problem rate', value: `${Math.round(Number(report.exceptionRate || 0) * 100)}%`, hint: 'Orders that hit a problem ÷ all orders', good: 'Aim for under 5%' },
    { label: 'Claim → placed (median)', value: `${Number(report.medianClaimToPlacedMinutes || 0).toFixed(1)} min`, hint: 'How long a buyer takes to buy the food', good: 'Under 7 minutes' },
    { label: 'Price gap', value: formatMoney(Number(report.varianceMinor || 0) / 100), hint: 'What restaurants charged minus what we expected (+ = Roam paid more)', good: 'Near J$0' },
    {
      label: 'Statement matching',
      value: `${recon?.matched || 0} matched · ${recon?.waiting || recon?.unmatchedOrders || 0} waiting · ${recon?.unmatched || recon?.unmatchedBank || 0} bank-only`,
      hint: 'Matched / waiting for statement / bank charges with no order',
      good: 'Keep bank-only near 0',
    },
  ] : [];

  return (
    <div className="space-y-4 p-4 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!embedded && <h1 className="text-xl font-semibold">Reports</h1>}
        <button type="button" className="rounded bg-slate-800 px-3 py-1 text-sm" disabled={!report} onClick={downloadCsv}>CSV export</button>
      </div>
      {loadError ? <p className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <article key={tile.label} className="rounded border border-slate-800 p-3">
            <div className="text-sm text-slate-400">{tile.label}</div>
            <div className="mt-1 text-2xl font-semibold">{tile.value}</div>
            <p className="mt-2 text-xs text-slate-500">{tile.hint}</p>
            <p className="text-xs text-emerald-300/80">What good looks like: {tile.good}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
