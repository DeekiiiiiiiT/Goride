import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  approveInHousePurchase,
  createInHouseCard,
  getInHouseRecon,
  getInHouseReports,
  importInHouseStatement,
  listInHouseCards,
  listInHouseQueue,
  resolveInHouseTask,
} from '@roam/dash-admin-client';
import { getJwtRoles, jwtPrimaryRole } from '@roam/auth-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

function useToken() {
  const { session } = useOutletContext<AdminOutletContext>();
  return session.access_token;
}

const OPS = new Set(['dash_ops', 'dash_admin', 'platform_owner', 'platform_support', 'superadmin']);

export function InHouseExceptionsPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.access_token;
  const isOps = getJwtRoles(session.user).some((role) => OPS.has(role)) || OPS.has(jwtPrimaryRole(session.user));
  const [rows, setRows] = useState<Array<{ id: string; storeName: string; state: string; exception_code: string | null; needsApproval?: boolean; buyerName?: string | null }>>([]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  function load() {
    void listInHouseQueue(token).then((result) => {
      setRows(result.tasks.filter((task) => task.state.includes('exception')) as typeof rows);
    }).catch((error: Error) => toast.error(error.message));
  }
  useEffect(() => { load(); }, [token]);
  return (
    <div className="space-y-3 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">Exceptions</h1>
      {rows.map((row) => {
        const after = row.state === 'exception_after_purchase';
        const unknown = row.state === 'exception_purchase_unknown';
        const buyer = row.buyerName || 'the buyer';
        return (
          <article key={row.id} className="rounded border border-slate-800 p-3">
            <div>{row.storeName} · {unknown ? 'Did they pay?' : (row.exception_code || row.state)}</div>
            {unknown ? <p className="text-sm text-amber-200">{buyer}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {unknown ? (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={Boolean(confirmed[row.id])} onChange={(event) => setConfirmed((current) => ({ ...current, [row.id]: event.target.checked }))} />
                    I confirmed with {buyer} that nothing was bought
                  </label>
                  <button type="button" disabled={!confirmed[row.id]} className="rounded bg-slate-800 px-3 py-1 disabled:opacity-40" onClick={() => void resolveInHouseTask(token, row.id, 'retry', { confirmedNothingBought: true }).then(load)}>Try again</button>
                  <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'abandon').then(load)}>Refund</button>
                </>
              ) : after ? (
                <>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'wait').then(load)}>Wait</button>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'redispatch').then(load)}>Send courier again</button>
                  <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'abandon').then(load)}>Write off and refund</button>
                </>
              ) : (
                <>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'retry').then(load)}>Try again</button>
                  <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'substitute').then(load)}>Substitute</button>
                  <button type="button" className="rounded bg-red-900 px-3 py-1" onClick={() => void resolveInHouseTask(token, row.id, 'abandon').then(load)}>Refund</button>
                </>
              )}
              {isOps && row.needsApproval ? (
                <button type="button" className="rounded bg-amber-700 px-3 py-1" onClick={() => void approveInHousePurchase(token, row.id).then(load)}>Approve purchase</button>
              ) : null}
            </div>
          </article>
        );
      })}
      {rows.length === 0 ? <p>No open exceptions.</p> : null}
    </div>
  );
}

export { InHouseMenuPage, InHouseStoresPage } from './InHouseRestaurantDesk';

export function InHouseCardsPage() {
  const token = useToken();
  const [cards, setCards] = useState<Array<Record<string, unknown>>>([]);
  const [label, setLabel] = useState('');
  const [last4, setLast4] = useState('');
  const [limit, setLimit] = useState('5000000');
  const [statement, setStatement] = useState('');
  useEffect(() => {
    void listInHouseCards(token).then((result) => setCards(result.cards)).catch((error: Error) => toast.error(error.message));
  }, [token]);
  return (
    <div className="space-y-4 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">Cards and spend</h1>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        void createInHouseCard(token, { label, last4, dailyLimitMinor: Number(limit) }).then(() => listInHouseCards(token)).then((result) => setCards(result.cards)).catch((error: Error) => toast.error(error.message));
      }}>
        <input className="rounded bg-slate-900 p-2" placeholder="Label" value={label} onChange={(event) => setLabel(event.target.value)} />
        <input className="rounded bg-slate-900 p-2" placeholder="Last 4" value={last4} onChange={(event) => setLast4(event.target.value)} maxLength={4} />
        <input className="rounded bg-slate-900 p-2" placeholder="Daily limit cents" value={limit} onChange={(event) => setLimit(event.target.value)} />
        <button className="rounded bg-emerald-800 px-3" type="submit">Add card</button>
      </form>
      {cards.map((card) => (
        <article key={String(card.id)} className="rounded border border-slate-800 p-3">
          {String(card.label)} ·· {String(card.last4)} · today J${Math.round(Number(card.spentTodayMinor || 0) / 100)} / J${Math.round(Number(card.daily_limit_minor || 0) / 100)}
        </article>
      ))}
      <textarea className="h-32 w-full rounded bg-slate-900 p-2" placeholder="cardId,YYYY-MM-DD,amountMinor,merchant text" value={statement} onChange={(event) => setStatement(event.target.value)} />
      <button type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => {
        const lines = statement.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
          const [cardId, postedOn, amountMinor, merchantText] = line.split(',');
          return { cardId, postedOn, amountMinor: Number(amountMinor), merchantText };
        });
        void importInHouseStatement(token, lines).then((result) => toast.success(`${result.matched} matched`)).catch((error: Error) => toast.error(error.message));
      }}>Import statement</button>
    </div>
  );
}

export function InHouseReportsPage() {
  const token = useToken();
  const [report, setReport] = useState<Record<string, number> | null>(null);
  const [recon, setRecon] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    void getInHouseReports(token).then(setReport).catch((error: Error) => toast.error(error.message));
    void getInHouseRecon(token).then((result) => setRecon(result.counts)).catch(() => undefined);
  }, [token]);
  return (
    <div className="space-y-3 p-4 text-slate-100">
      <h1 className="text-xl font-semibold">In-House reports</h1>
      {report ? (
        <ul className="space-y-1 text-sm">
          <li>Orders, 30 days: {report.orders}</li>
          <li>Exception rate: {Math.round(Number(report.exceptionRate || 0) * 100)}%</li>
          <li>Median claim to placed: {Number(report.medianClaimToPlacedMinutes || 0).toFixed(1)} min</li>
          <li>Price gap: J${Math.round(Number(report.varianceMinor || 0) / 100)}</li>
        </ul>
      ) : null}
      {recon ? <pre className="text-xs text-slate-400">{JSON.stringify(recon, null, 2)}</pre> : null}
    </div>
  );
}
