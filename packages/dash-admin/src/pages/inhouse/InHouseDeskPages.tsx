import { useEffect, useMemo, useState } from 'react';
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
import { IH } from './inHouseTheme';

function useToken() {
  const { session } = useOutletContext<AdminOutletContext>();
  return session.access_token;
}

export { InHouseRestaurantsPage as InHouseStoresPage } from './restaurants/InHouseRestaurantsPage';
export { InHouseRestaurantsPage as InHouseMenuPage } from './restaurants/InHouseRestaurantsPage';

function money(amount: number) {
  return formatMoney(amount);
}

function initials(label: string) {
  return label.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'RR';
}

/** Stitch Cards & Spend — vault stats + table + side drawer. */
export function InHouseCardsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = useToken();
  const { confirm } = useAdminConfirm();
  const [tab, setTab] = useState<'cards' | 'transactions'>('cards');
  const [filter, setFilter] = useState<'all' | 'active'>('all');
  const [search, setSearch] = useState('');
  const [cards, setCards] = useState<Array<Record<string, unknown>>>([]);
  const [orders, setOrders] = useState<Array<{ taskId: string; orderNumber: string; paidAt: string; customerTotal: number; bank: { postedOn: string; amountMinor: number; merchantText: string } | null }>>([]);
  const [unmatched, setUnmatched] = useState<Array<{ id: string; postedOn: string; amountMinor: number; merchantText: string }>>([]);
  const [statementCardId, setStatementCardId] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState('20000');
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

  const totals = useMemo(() => {
    const daily = cards.reduce((sum, c) => sum + Number(c.daily_limit_minor || 0), 0);
    const spent = cards.reduce((sum, c) => sum + Number(c.spentTodayMinor || 0), 0);
    const remaining = Math.max(0, daily - spent);
    const util = daily ? Math.round((spent / daily) * 1000) / 10 : 0;
    return { daily, spent, remaining, util, count: cards.length };
  }, [cards]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((card) => {
      if (q) {
        const hay = `${String(card.label || '')} ${String(card.last4 || '')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cards, search, filter]);

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

  function bumpLimit(add: number) {
    setLimit(String(Math.max(0, Number(limit || 0) + add)));
  }

  return (
    <div className="space-y-6 bg-[#060f17] text-[#d2e8ff]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            {!embedded ? <h1 className="text-2xl font-bold tracking-tight text-white">Cards & Spend</h1> : (
              <h2 className="text-2xl font-bold tracking-tight text-white">Cards & Spend</h2>
            )}
            <span className="rounded border border-slate-600 bg-[#122839] px-2 py-0.5 font-mono text-[11px] text-[#a4c9ff]">VAULT</span>
          </div>
          <p className="mt-0.5 text-sm text-slate-400">Manage buyer payment cards and reconcile ledger bank transactions</p>
        </div>
        <button type="button" className={IH.primaryBtnLg} onClick={() => { setTab('cards'); setAdding(true); }}>
          + Add card
        </button>
      </div>

      <div className="flex items-center gap-6 border-b border-[#354a5c]">
        <button
          type="button"
          className={`flex items-center gap-2 pb-3 text-sm transition ${
            tab === 'cards' ? 'border-b-2 border-[#f59e0b] font-semibold text-[#f59e0b]' : 'font-medium text-slate-400 hover:text-slate-200'
          }`}
          onClick={() => setTab('cards')}
        >
          Cards Vault
        </button>
        <button
          type="button"
          className={`flex items-center gap-2 pb-3 text-sm transition ${
            tab === 'transactions' ? 'border-b-2 border-[#f59e0b] font-semibold text-[#f59e0b]' : 'font-medium text-slate-400 hover:text-slate-200'
          }`}
          onClick={() => setTab('transactions')}
        >
          Transactions & Reconciliation
        </button>
      </div>

      {tab === 'cards' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Total Active Cards"
              value={`${totals.count} Card${totals.count === 1 ? '' : 's'}`}
              hint={totals.count ? 'Ready for buyer dispatch' : 'Add a card to start placing orders'}
              accent="text-[#f59e0b]"
            />
            <StatTile
              label="Total Daily Limit"
              value={money(totals.daily / 100)}
              hint="Resets automatically at midnight"
              accent="text-[#a4c9ff]"
            />
            <article className="flex flex-col justify-between rounded-xl border border-[#354a5c] bg-[#0a1b28] p-4">
              <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-400">
                Total Spent Today
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-white">{money(totals.spent / 100)}</span>
                <span className="text-xs font-medium text-[#fbbf24]">{totals.util}% utilized</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#122839]">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, totals.util)}%` }} />
              </div>
            </article>
            <StatTile
              label="Available Capacity"
              value={money(totals.remaining / 100)}
              hint={totals.remaining > 0 ? 'Adequate purchasing cushion' : 'Raise a daily limit or wait for reset'}
              accent="text-emerald-400"
              valueClass="text-emerald-400"
            />
          </div>

          <div className="flex flex-col items-stretch justify-between gap-3 rounded-lg border border-[#354a5c]/60 bg-[#0a1b28] p-2 sm:flex-row sm:items-center">
            <input
              className="w-full max-w-md rounded-md border border-[#354a5c] bg-[#071520] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#f59e0b] focus:outline-none"
              placeholder="Search by card nickname or last 4 digits..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex items-center gap-1 rounded-md border border-[#354a5c]/40 bg-[#071520] p-1">
              <button
                type="button"
                className={`rounded px-3 py-1 text-xs font-semibold transition ${filter === 'all' ? 'bg-[#78350f] text-[#fcd34d]' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setFilter('all')}
              >
                All ({cards.length})
              </button>
              <button
                type="button"
                className={`rounded px-3 py-1 text-xs font-semibold transition ${filter === 'active' ? 'bg-[#78350f] text-[#fcd34d]' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setFilter('active')}
              >
                Active ({cards.length})
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[#354a5c] bg-[#0a1b28] shadow-sm">
            {filtered.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-lg font-semibold text-white">No cards yet</p>
                <p className="mt-1 text-sm text-slate-400">Add a buyer card to start placing restaurant orders.</p>
                <button type="button" className={`${IH.primaryBtnLg} mt-4`} onClick={() => setAdding(true)}>+ Add card</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#354a5c] bg-[#071520]/80 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3">Card Details & Nickname</th>
                      <th className="px-4 py-3">Assigned Buyer / Desk</th>
                      <th className="px-4 py-3">Daily Spend Limit</th>
                      <th className="w-64 px-4 py-3">Spent Today</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#354a5c]/40">
                    {filtered.map((card) => {
                      const id = String(card.id);
                      const spent = Number(card.spentTodayMinor || 0);
                      const limitMinor = Number(card.daily_limit_minor || 0);
                      const pct = Math.min(100, Math.round((spent / Math.max(1, limitMinor)) * 1000) / 10);
                      const editing = editingId === id;
                      return (
                        <tr key={id} className="transition-colors hover:bg-[#0f212f]/60">
                          <td className="px-4 py-3.5">
                            {editing ? (
                              <div className="flex flex-wrap gap-2">
                                <input className={IH.input} value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                                <input className={IH.input} value={editLast4} maxLength={4} onChange={(e) => setEditLast4(e.target.value)} />
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="flex h-7 w-10 items-center justify-center rounded border border-slate-600 bg-[#122839] font-headline text-[11px] font-black italic text-[#f59e0b]">
                                  VISA
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{String(card.label)}</span>
                                    <span className="font-mono text-xs text-slate-400">•••• {String(card.last4)}</span>
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-[#fbbf24]">Corporate fleet</div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#78350f] text-[10px] font-bold text-[#fcd34d]">
                                {initials(String(card.label || ''))}
                              </div>
                              <div>
                                <span className="block font-medium text-slate-100">Desk pool</span>
                                <span className="text-[10px] text-slate-400">All active operators</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-mono font-medium text-slate-100">
                            {editing ? (
                              <input className={IH.input} value={editLimit} onChange={(e) => setEditLimit(e.target.value)} />
                            ) : (
                              money(limitMinor / 100)
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className="font-semibold text-slate-100">{money(spent / 100)}</span>
                                <span className="text-slate-400">{pct}%</span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#122839]">
                                <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/70 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Active
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {editing ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  className={IH.primaryBtn}
                                  onClick={() => void updateInHouseCard(token, id, {
                                    label: editLabel,
                                    last4: editLast4,
                                    dailyLimitMinor: Math.round(Number(editLimit) * 100),
                                  }).then(() => { setEditingId(null); return loadCards(); }).catch((e: Error) => toast.error(e.message))}
                                >
                                  Save
                                </button>
                                <button type="button" className={IH.secondaryBtn} onClick={() => setEditingId(null)}>Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <button type="button" className="rounded bg-[#122839] px-2.5 py-1 text-xs font-medium text-[#a4c9ff] hover:bg-[#192e3f]" onClick={() => startEdit(card)}>
                                  Edit limit
                                </button>
                                <button
                                  type="button"
                                  className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-[#122839] hover:text-slate-100"
                                  onClick={() => void confirm({
                                    title: 'Archive this card?',
                                    description: `${String(card.label)} ·· ${String(card.last4)} will no longer be offered to buyers.`,
                                    confirmLabel: 'Archive card',
                                    variant: 'danger',
                                  }).then((ok) => {
                                    if (!ok) return;
                                    return archiveInHouseCard(token, id).then(() => loadCards());
                                  }).catch((e: Error) => toast.error(e.message))}
                                >
                                  Archive
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {filtered.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#354a5c] bg-[#071520]/60 px-4 py-2.5 text-[11px] text-slate-400">
                <span>Showing {filtered.length} of {cards.length} configured buyer cards · Real-time gateway sync on</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-[#354a5c] bg-[#0a1b28] p-4">
            <h3 className="text-sm font-semibold text-white">Match bank statements</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-400">
              <li>Download the card statement from the bank as CSV or PDF.</li>
              <li>
                Choose the card
                <select className={`${IH.input} ml-2 inline-block w-auto`} value={statementCardId} onChange={(e) => setStatementCardId(e.target.value)}>
                  <option value="">Select a card</option>
                  {cards.map((card) => (
                    <option key={String(card.id)} value={String(card.id)}>{String(card.label)} ·· {String(card.last4)}</option>
                  ))}
                </select>
              </li>
              <li>
                <label className={`inline-flex cursor-pointer items-center gap-2 ${statementCardId ? IH.secondaryBtn : 'rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-500'}`}>
                  Upload statement
                  <input
                    type="file"
                    accept=".csv,.pdf,text/csv,application/pdf"
                    disabled={!statementCardId}
                    className="text-sm"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      void onStatement(file).catch((error: Error) => toast.error(error.message));
                    }}
                  />
                </label>
              </li>
            </ol>
          </section>
          <div className="overflow-hidden rounded-xl border border-[#354a5c] bg-[#0a1b28]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#354a5c] bg-[#071520] text-slate-400">
                <tr>
                  <th className="p-3 font-medium">Order</th>
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Customer paid</th>
                  <th className="p-3 font-medium">Bank charge</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.taskId} className="border-t border-slate-800/80 hover:bg-[#0f212f]/50">
                    <td className="p-3 font-medium text-white">{order.orderNumber || 'Order'}</td>
                    <td className="p-3 text-slate-400">{order.paidAt ? new Date(order.paidAt).toLocaleDateString('en-JM') : ''}</td>
                    <td className="p-3 font-mono text-slate-200">{money(order.customerTotal)}</td>
                    <td className="p-3 text-slate-300">
                      {order.bank
                        ? `${money(order.bank.amountMinor / 100)} · ${order.bank.postedOn} · ${order.bank.merchantText}`
                        : <span className="text-amber-300">Waiting for the statement</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 ? <p className="p-4 text-sm text-slate-400">No paid orders yet.</p> : null}
          </div>
          {unmatched.map((line) => (
            <p key={line.id} className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-100">
              {money(line.amountMinor / 100)} · {line.postedOn} · {line.merchantText}
            </p>
          ))}
        </div>
      )}

      {adding ? (
        <>
          <button type="button" className="fixed inset-0 z-40 bg-black/60" aria-label="Close" onClick={() => setAdding(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[#354a5c] bg-[#071520] shadow-2xl">
            <div className="flex items-start justify-between border-b border-[#354a5c] bg-[#0a1b28] p-5">
              <div>
                <h2 className="text-base font-bold text-white">Add Buyer Card</h2>
                <p className="mt-0.5 text-xs text-slate-400">Link an active corporate card to buyer dispatch fleet</p>
              </div>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={() => setAdding(false)}>✕</button>
            </div>
            <form
              className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 text-xs"
              onSubmit={(event) => {
                event.preventDefault();
                void createInHouseCard(token, { label, last4, dailyLimitMinor: Math.round(Number(limit) * 100) })
                  .then(() => {
                    setAdding(false);
                    setLabel('');
                    setLast4('');
                    setLimit('20000');
                    setTab('cards');
                    return loadCards();
                  })
                  .catch((error: Error) => toast.error(error.message));
              }}
            >
              <label className="block space-y-1">
                <span className="font-medium text-slate-400">Card Nickname</span>
                <input className={`${IH.input} w-full`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Buyer F — Express Fleet" required />
              </label>
              <label className="block space-y-1">
                <span className="font-medium text-slate-400">Card Last 4 Digits</span>
                <input
                  className={`${IH.input} w-full font-mono`}
                  value={last4}
                  maxLength={4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="8821"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium text-slate-400">Daily Spend Limit (J$)</span>
                <input className={`${IH.input} w-full font-mono`} value={limit} onChange={(e) => setLimit(e.target.value)} required />
                <div className="mt-1.5 flex gap-1.5">
                  {[10000, 20000, 50000].map((n) => (
                    <button key={n} type="button" className="rounded border border-[#354a5c] bg-[#0a1b28] px-2 py-1 text-[11px] text-[#fbbf24] hover:border-[#f59e0b]" onClick={() => bumpLimit(n)}>
                      +J$ {(n / 1000).toFixed(0)}k
                    </button>
                  ))}
                </div>
              </label>
              <p className="rounded-lg border border-[#354a5c]/60 bg-[#0a1b28] p-3 text-[11px] text-slate-400">
                Zero-knowledge encrypted card tokenization active. PCI-DSS compliant.
              </p>
              <div className="mt-auto flex items-center justify-end gap-3 border-t border-[#354a5c] pt-4">
                <button type="button" className="text-sm text-slate-400 hover:text-white" onClick={() => setAdding(false)}>Cancel</button>
                <button type="submit" className={IH.primaryBtnLg} disabled={last4.length !== 4}>✓ Save Buyer Card</button>
              </div>
            </form>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  accent,
  valueClass = 'text-white',
}: {
  label: string;
  value: string;
  hint: string;
  accent: string;
  valueClass?: string;
}) {
  return (
    <article className="flex flex-col justify-between rounded-xl border border-[#354a5c] bg-[#0a1b28] p-4">
      <div className={`mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-slate-400`}>
        <span>{label}</span>
        <span className={`h-2 w-2 rounded-full ${accent.replace('text-', 'bg-')}`} />
      </div>
      <div className={`font-mono text-2xl font-bold ${valueClass}`}>{value}</div>
      <p className="mt-1.5 text-[11px] text-slate-400">{hint}</p>
    </article>
  );
}

/** Stitch Reports — KPI grid + recon summary + settlement log. */
export function InHouseReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const token = useToken();
  const [report, setReport] = useState<Record<string, number> | null>(null);
  const [recon, setRecon] = useState<Record<string, number> | null>(null);
  const [orders, setOrders] = useState<Array<{ taskId: string; orderNumber: string; paidAt: string; customerTotal: number; bank: { postedOn: string; amountMinor: number; merchantText: string } | null }>>([]);
  const [loadError, setLoadError] = useState('');
  const [segment, setSegment] = useState('overview');

  useEffect(() => {
    void getInHouseReports(token).then((result) => { setReport(result); setLoadError(''); }).catch((error: Error) => setLoadError(error.message));
    void getInHouseRecon(token).then((result) => setRecon(result.counts)).catch(() => undefined);
    void listInHouseCardTransactions(token).then((result) => setOrders(result.orders)).catch(() => undefined);
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

  const matched = recon?.matched || 0;
  const waiting = recon?.waiting || recon?.unmatchedOrders || 0;
  const bankOnly = recon?.unmatched || recon?.unmatchedBank || 0;
  const reconTotal = matched + waiting + bankOnly || 1;
  const matchedPct = Math.round((matched / reconTotal) * 1000) / 10;
  const waitingPct = Math.round((waiting / reconTotal) * 1000) / 10;
  const bankPct = Math.round((bankOnly / reconTotal) * 1000) / 10;
  const clearedValue = orders.filter((o) => o.bank).reduce((s, o) => s + (o.bank?.amountMinor || 0), 0);
  const pendingValue = orders.filter((o) => !o.bank).reduce((s, o) => s + Math.round(o.customerTotal * 100), 0);

  const tiles = report ? [
    {
      label: 'Orders (30 days)',
      value: String(report.orders || 0),
      hint: 'In-House orders customers placed',
      good: 'Consistent growth week to week',
      valueClass: 'text-white',
      iconClass: 'bg-blue-500/10 text-blue-400',
    },
    {
      label: 'Problem Rate',
      value: `${Math.round(Number(report.exceptionRate || 0) * 100)}%`,
      hint: 'Orders that hit a problem ÷ all orders',
      good: 'Target sustained under 5.0%',
      valueClass: 'text-emerald-400',
      iconClass: 'bg-emerald-500/10 text-emerald-400',
    },
    {
      label: 'Claim → Placed Median',
      value: `${Number(report.medianClaimToPlacedMinutes || 0).toFixed(1)} min`,
      hint: 'Median operator speed to call & confirm',
      good: 'Under 5 mins SLA threshold',
      valueClass: 'text-amber-300',
      iconClass: 'bg-amber-500/10 text-amber-400',
    },
    {
      label: 'Price Gap & Variance',
      value: money(Number(report.varianceMinor || 0) / 100),
      hint: 'Net gap: menu estimate vs merchant bill',
      good: 'Near J$0 monthly variance',
      valueClass: 'text-white',
      iconClass: 'bg-amber-500/10 text-amber-400',
    },
    {
      label: 'Statement Matching',
      value: `${matchedPct}%`,
      hint: `${matched} settled · ${waiting} wait · ${bankOnly} bank`,
      good: '>97% auto-match within 48h',
      valueClass: 'text-amber-400',
      iconClass: 'bg-amber-500/10 text-amber-400',
    },
  ] : [];

  const segments = [
    { id: 'overview', label: 'Overview (30d)' },
    { id: 'velocity', label: 'Buyer Dispatch Velocity' },
    { id: 'pricing', label: 'Pricing Integrity & Gaps' },
    { id: 'recon', label: 'Reconciliation Audit' },
  ];

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-800/80 pb-6 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            {!embedded ? <h1 className="text-2xl font-bold tracking-tight text-white">Reports</h1> : (
              <h2 className="text-2xl font-bold tracking-tight text-white">Reports</h2>
            )}
            <span className="rounded-full border border-blue-700/40 bg-blue-900/40 px-2.5 py-0.5 text-xs font-semibold text-blue-300">In-House Ops</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">Last 30 days of In-House performance and financial reconciliation</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-700/50 bg-[#0a1b28] px-3.5 py-2 text-xs font-medium text-slate-200">
            Last 30 Days
          </span>
          <button type="button" className={IH.secondaryBtn} disabled={!report} onClick={downloadCsv}>Export CSV</button>
          <button
            type="button"
            className={IH.primaryBtnLg}
            onClick={() => {
              void Promise.all([
                getInHouseReports(token).then(setReport),
                getInHouseRecon(token).then((r) => setRecon(r.counts)),
                listInHouseCardTransactions(token).then((r) => setOrders(r.orders)),
              ]).then(() => toast.success('Reports refreshed')).catch((e: Error) => toast.error(e.message));
            }}
          >
            Sync Statements
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-800/60 pb-3 text-xs">
        {segments.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rounded-lg px-3.5 py-1.5 transition ${
              segment === s.id
                ? 'border border-slate-700 bg-slate-800 font-semibold text-amber-300'
                : 'font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
            onClick={() => setSegment(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loadError ? <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">{loadError}</p> : null}
      {!report && !loadError ? <p className="text-sm text-slate-400">Loading reports…</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <article key={tile.label} className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-sm transition hover:border-slate-700">
            <div>
              <div className="mb-2 flex items-center justify-between text-slate-400">
                <span className="text-xs font-semibold uppercase tracking-wider">{tile.label}</span>
                <span className={`rounded-md p-1.5 ${tile.iconClass}`}>●</span>
              </div>
              <div className={`text-3xl font-extrabold tracking-tight ${tile.valueClass}`}>{tile.value}</div>
              <p className="mt-2 text-xs font-medium text-slate-300">{tile.hint}</p>
            </div>
            <div className="mt-4 border-t border-slate-800/60 pt-3">
              <p className="text-[11px] leading-relaxed text-slate-400">
                <span className="font-medium">What good looks like:</span> {tile.good}
              </p>
            </div>
          </article>
        ))}
      </div>

      {report ? (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold text-white">
                Statement Reconciliation Summary
                <span className="font-mono text-xs font-normal text-slate-400">({report.orders || 0} recorded dispatches)</span>
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">Matching status between buyer card debits and settled orders</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Matched: {matchedPct}% ({matched})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />Pending: {waitingPct}% ({waiting})</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Flagged: {bankPct}% ({bankOnly})</span>
            </div>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-800">
            <div className="bg-amber-400" style={{ width: `${(matched / reconTotal) * 100}%` }} />
            <div className="bg-blue-500" style={{ width: `${(waiting / reconTotal) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(bankOnly / reconTotal) * 100}%` }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-[#0a1b28] p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Total Cleared Value</div>
              <div className="mt-1 font-mono text-lg font-bold text-white">{money(clearedValue / 100)}</div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0a1b28] p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Pending Settlement Queue</div>
              <div className="mt-1 font-mono text-lg font-bold text-blue-300">{money(pendingValue / 100)} <span className="text-xs font-normal text-slate-400">({waiting} orders)</span></div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#0a1b28] p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">Bank-Only Unlinked</div>
              <div className="mt-1 font-mono text-lg font-bold text-amber-300">{bankOnly} items</div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-bold text-white">Daily Settlement Reconciliation Log</h3>
          <span className="text-xs text-slate-400">Paid In-House orders</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-[#071520] text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5">Customer paid</th>
                <th className="px-4 py-2.5">Bank statement</th>
                <th className="px-4 py-2.5">Audit status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {orders.slice(0, 12).map((order) => (
                <tr key={order.taskId} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-slate-300">{order.paidAt ? new Date(order.paidAt).toLocaleDateString('en-JM') : '—'}</td>
                  <td className="px-4 py-3 font-medium text-[#fbbf24]">{order.orderNumber || order.taskId.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-mono text-slate-100">{money(order.customerTotal)}</td>
                  <td className="px-4 py-3 text-slate-300">
                    {order.bank ? `${money(order.bank.amountMinor / 100)} · ${order.bank.merchantText}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {order.bank ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/50 px-2 py-0.5 text-[11px] text-emerald-300">Reconciled</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[11px] text-amber-300">Under Review</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orders.length === 0 ? <p className="p-4 text-sm text-slate-400">No settlement rows yet — place and pay an order, then upload a statement.</p> : null}
        <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-slate-500">
          Showing {Math.min(12, orders.length)} of {orders.length} paid orders · Roam Rush In-House Operations Console
        </div>
      </section>
    </div>
  );
}
