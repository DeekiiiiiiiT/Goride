import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  getInHouseTask,
  listInHouseChat,
  placeInHouseTask,
  raiseInHouseException,
  releaseInHouseTask,
  sendInHouseChat,
  touchInHouseTask,
  uploadInHouseReceipt,
  type InHouseTaskDetail,
} from '@roam/dash-admin-client';
import type { AdminOutletContext } from '../../DashAdminPortal';

const EXCEPTIONS = [
  ['item_unavailable', 'Item unavailable'],
  ['price_increase_over_tolerance', 'Price changed'],
  ['store_closed', 'Store closed'],
  ['card_declined', 'Card declined'],
  ['other', 'Other'],
] as const;

function money(minor: number) {
  return `J$${(minor / 100).toLocaleString('en-JM', { maximumFractionDigits: 0 })}`;
}

export function InHouseWorkspacePage() {
  const { id = '' } = useParams();
  const { session } = useOutletContext<AdminOutletContext>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<InHouseTaskDetail | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [externalOrderRef, setExternalOrderRef] = useState('');
  const [totalMajor, setTotalMajor] = useState('');
  const [cardId, setCardId] = useState('');
  const [readyTime, setReadyTime] = useState('');
  const [receiptPath, setReceiptPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; body: string; sender_role: string }>>([]);
  const [reply, setReply] = useState('');

  const load = useCallback(async () => {
    const next = await getInHouseTask(session.access_token, id);
    setDetail(next);
    setReceiptPath(String(next.task.receipt_path || ''));
    if (!cardId && next.cards[0]) setCardId(next.cards[0].id);
    const orderId = String(next.order?.id || '');
    if (orderId) {
      const chat = await listInHouseChat(session.access_token, orderId).catch(() => ({ messages: [] }));
      setMessages(chat.messages || []);
    }
  }, [cardId, id, session.access_token]);

  useEffect(() => {
    void load().catch((error: Error) => toast.error(error.message));
    const beat = window.setInterval(() => {
      void touchInHouseTask(session.access_token, id).catch(() => undefined);
    }, 60000);
    return () => window.clearInterval(beat);
  }, [id, load, session.access_token]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'p' || event.key === 'P') void save();
      if (event.key === 'e' || event.key === 'E') void problem('other');
      const index = Number(event.key) - 1;
      if (index >= 0 && detail?.checklist[index]?.copyText) {
        void navigator.clipboard.writeText(detail.checklist[index].copyText || '');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const expected = Number(detail?.task.expected_cost_minor || 0);
  const actualMinor = Math.round(Number(totalMajor || 0) * 100);
  const tolerance = Number(detail?.store?.price_tolerance_bps ?? 1000);
  const cap = Number(detail?.store?.absorb_cap_minor ?? 50000);
  const extra = actualMinor - expected;
  const percentCap = Math.floor((expected * tolerance) / 10000);
  const approved = Boolean(detail?.task.customer_price_approved_at);
  const over = expected > 0 && actualMinor > expected && extra > Math.min(percentCap, cap) && !approved;
  const itemSteps = useMemo(() => (detail?.checklist || []).filter((step) => step.id.startsWith('item-')), [detail]);
  const itemsTicked = itemSteps.every((step) => ticks[step.id]);
  const canPlace = Boolean(itemsTicked && externalOrderRef && actualMinor > 0 && cardId && receiptPath && readyTime && !over);

  async function copy(text?: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  }

  async function onReceipt(file: File) {
    const data = await file.arrayBuffer();
    const bytes = new Uint8Array(data);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const uploaded = await uploadInHouseReceipt(session.access_token, id, btoa(binary));
    setReceiptPath(uploaded.path);
    toast.success('Receipt saved');
  }

  async function save() {
    if (!canPlace || busy) return;
    setBusy(true);
    try {
      const ready = new Date();
      const [hours, minutes] = readyTime.split(':').map(Number);
      ready.setHours(hours, minutes, 0, 0);
      await placeInHouseTask(session.access_token, id, {
        externalOrderRef,
        actualTotalMinor: actualMinor,
        cardId,
        readyEta: ready.toISOString(),
      });
      toast.success('Marked placed');
      navigate('/in-house');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function problem(code: string) {
    try {
      await raiseInHouseException(session.access_token, id, code);
      toast.success('Exception raised');
      navigate('/in-house');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not raise exception');
    }
  }

  if (!detail) return <div className="p-6 text-slate-200">Loading order…</div>;
  const storeName = detail.merchant?.name || 'Store';
  const orderUrl = String(detail.store?.order_url || '');

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <button type="button" onClick={() => navigate('/in-house')}>Queue</button>
        <div className="font-semibold">{storeName} · {String(detail.order?.order_number || '')}</div>
        <button type="button" onClick={() => void releaseInHouseTask(session.access_token, id).then(() => navigate('/in-house'))}>Release</button>
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-slate-800 p-4">
          <h2 className="font-medium">1. Place the order</h2>
          {orderUrl ? <a className="inline-block rounded bg-emerald-800 px-3 py-2" href={orderUrl} target="_blank" rel="noreferrer">Open restaurant ordering</a> : null}
          <button
            type="button"
            className="ml-2 rounded bg-slate-800 px-3 py-2"
            onClick={() => void copy((detail.cart || []).map((line) => `${line.quantity} x ${line.name}`).join('\n'))}
          >
            Copy cart for helper
          </button>
          <p>Order type: carry-out</p>
          <p>Pickup name: {String(detail.task.pickup_code)} <button type="button" onClick={() => void copy(String(detail.task.pickup_code))}>Copy</button></p>
          {itemSteps.map((step) => (
            <label key={step.id} className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(ticks[step.id])} onChange={(event) => setTicks((current) => ({ ...current, [step.id]: event.target.checked }))} />
              <span>{step.label}</span>
              <button type="button" onClick={() => void copy(step.copyText)}>Copy</button>
            </label>
          ))}
          <p>Expected cost {money(expected)}</p>
          <p>Customer paid {money(Math.round(Number(detail.order?.total || 0) * 100))}</p>
        </section>
        <section className="space-y-3 rounded-lg border border-slate-800 p-4">
          <h2 className="font-medium">2. Record the purchase</h2>
          {String(detail.task.state) === 'exception_purchase_unknown' ? <p className="text-amber-200">If you already paid the restaurant, mark this placed. If you did not pay, go back to Exceptions.</p> : null}
          {String(detail.task.state) !== 'placing' && String(detail.task.state) !== 'claimed' && String(detail.task.state) !== 'exception_purchase_unknown' ? <p className="text-amber-200">This order has moved on. Saving records the card spend as a Roam cost.</p> : null}
          <label className="block">External order number<input className="mt-1 w-full rounded bg-slate-900 p-2" value={externalOrderRef} onChange={(event) => setExternalOrderRef(event.target.value)} /></label>
          <label className="block">Total charged J$<input className="mt-1 w-full rounded bg-slate-900 p-2" value={totalMajor} onChange={(event) => setTotalMajor(event.target.value)} /></label>
          {over ? <p className="text-amber-300">This is above what Roam can absorb. Swap the item or refund the customer.</p> : null}
          <label className="block">Card
            <select className="mt-1 w-full rounded bg-slate-900 p-2" value={cardId} onChange={(event) => setCardId(event.target.value)}>
              {detail.cards.map((card) => <option key={card.id} value={card.id}>{card.label} ·· {card.last4}</option>)}
            </select>
          </label>
          <label className="block">Ready time<input type="time" className="mt-1 w-full rounded bg-slate-900 p-2" value={readyTime} onChange={(event) => setReadyTime(event.target.value)} /></label>
          <label className="block">Receipt<input type="file" accept="image/*,application/pdf" className="mt-1 block" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReceipt(file); }} /></label>
          <button type="button" disabled={!canPlace || busy} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-40" onClick={() => void save()}>{String(detail.task.state) === 'placing' || String(detail.task.state) === 'exception_purchase_unknown' ? 'Mark placed' : 'Record the spend'}</button>
          <h2 className="pt-4 font-medium">3. Something wrong?</h2>
          <div className="flex flex-wrap gap-2">
            {EXCEPTIONS.map(([code, label]) => (
              <button key={code} type="button" className="rounded bg-slate-800 px-3 py-2" onClick={() => void problem(code)}>{label}</button>
            ))}
          </div>
        </section>
      </div>
      <section className="border-t border-slate-800 p-4">
        <h2 className="mb-2 font-medium">Customer messages</h2>
        <div className="mb-2 max-h-40 space-y-1 overflow-auto text-sm">
          {messages.map((message) => (
            <p key={message.id}><span className="text-slate-400">{message.sender_role}:</span> {message.body}</p>
          ))}
          {messages.length === 0 ? <p className="text-slate-400">No messages yet.</p> : null}
        </div>
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          const orderId = String(detail.order?.id || '');
          if (!orderId || !reply.trim()) return;
          void sendInHouseChat(session.access_token, orderId, reply.trim())
            .then(() => listInHouseChat(session.access_token, orderId))
            .then((chat) => { setMessages(chat.messages || []); setReply(''); })
            .catch((error: Error) => toast.error(error.message));
        }}>
          <input className="flex-1 rounded bg-slate-900 p-2" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply as the restaurant" />
          <button className="rounded bg-slate-800 px-3" type="submit">Send</button>
        </form>
      </section>
      <footer className="border-t border-slate-800 p-4 text-sm text-slate-400">
        Keys: 1–9 copy an item, P mark placed, E exception.
      </footer>
    </div>
  );
}
