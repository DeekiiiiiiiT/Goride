import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  createInHouseCard,
  deleteInHouseCard,
  getInHouseRecon,
  getInHouseReports,
  importInHouseStatement,
  listInHouseCardTransactions,
  listInHouseCards,
  updateInHouseCard,
} from '@roam/dash-admin-client';
import { formatMoney } from '../../components/ui/format';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { readStatementFile } from './statementCharges';

function useToken() {
  const { session } = useOutletContext<AdminOutletContext>();
  return session.access_token;
}

export { InHouseMenuPage, InHouseStoresPage } from './InHouseRestaurantDesk';

function money(amount: number) {
  return formatMoney(amount);
}

export function InHouseCardsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = useToken();
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
    return listInHouseCards(token).then((result) => setCards(result.cards));
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
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded bg-slate-900 p-2" value={statementCardId} onChange={(event) => setStatementCardId(event.target.value)}>
              <option value="">Which card is this statement for?</option>
              {cards.map((card) => <option key={String(card.id)} value={String(card.id)}>{String(card.label)} ·· {String(card.last4)}</option>)}
            </select>
            <label className="rounded bg-slate-800 px-3 py-2 text-sm">
              Upload statement
              <input className="ml-2 text-sm" type="file" accept=".csv,.pdf,text/csv,application/pdf" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void onStatement(file).catch((error: Error) => toast.error(error.message));
              }} />
            </label>
          </div>
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
                    <p>{String(card.label)} ·· {String(card.last4)} · today {formatMoney(Number(card.spentTodayMinor || 0) / 100)} / {formatMoney(Number(card.daily_limit_minor || 0) / 100)}</p>
                    <div className="flex gap-2">
                      <button className="rounded bg-slate-800 px-3 py-1" type="button" onClick={() => startEdit(card)}>Edit</button>
                      <button className="rounded bg-slate-800 px-3 py-1" type="button" onClick={() => {
                        if (!window.confirm(`Delete ${String(card.label)} ·· ${String(card.last4)}?`)) return;
                        void deleteInHouseCard(token, id).then(() => loadCards()).catch((error: Error) => toast.error(error.message));
                      }}>Delete</button>
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
            <input className="w-full rounded bg-slate-900 p-2" placeholder="Name" value={label} onChange={(event) => setLabel(event.target.value)} />
            <input className="w-full rounded bg-slate-900 p-2" placeholder="Last 4" value={last4} maxLength={4} onChange={(event) => setLast4(event.target.value)} />
            <input className="w-full rounded bg-slate-900 p-2" placeholder="Daily limit J$" value={limit} onChange={(event) => setLimit(event.target.value)} />
            <div className="flex gap-2">
              <button className="rounded bg-amber-500 text-slate-950 px-3 py-2" type="submit">Save</button>
              <button className="rounded bg-slate-800 px-3 py-2" type="button" onClick={() => setAdding(false)}>Cancel</button>
            </div>
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
  useEffect(() => {
    void getInHouseReports(token).then(setReport).catch((error: Error) => toast.error(error.message));
    void getInHouseRecon(token).then((result) => setRecon(result.counts)).catch(() => undefined);
  }, [token]);
  return (
    <div className="space-y-3 p-4 text-slate-100">
      {!embedded && <h1 className="text-xl font-semibold">In-House reports</h1>}
      {report ? (
        <ul className="space-y-1 text-sm">
          <li>Orders, 30 days: {report.orders}</li>
          <li>Exception rate: {Math.round(Number(report.exceptionRate || 0) * 100)}%</li>
          <li>Median claim to placed: {Number(report.medianClaimToPlacedMinutes || 0).toFixed(1)} min</li>
          <li>Price gap: {formatMoney(Number(report.varianceMinor || 0) / 100)}</li>
        </ul>
      ) : null}
      {recon ? <pre className="text-xs text-slate-400">{JSON.stringify(recon, null, 2)}</pre> : null}
    </div>
  );
}
