import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  getInHouseTask,
  listInHouseChat,
  placeInHouseTask,
  raiseInHouseException,
  inHouseHeartbeat,
  releaseInHouseTask,
  sendInHouseChat,
  touchInHouseTask,
  uploadInHouseReceipt,
  type InHouseTaskDetail,
} from '@roam/dash-admin-client';
import { formatMoney } from '../../components/ui/format';
import type { AdminOutletContext } from '../../DashAdminPortal';
import { absorbLimitMinor } from './inHouseUi';

const EXCEPTIONS = [
  ['item_unavailable', 'Item missing', 'Item missing → the customer is asked to pick a swap.'],
  ['price_increase_over_tolerance', 'Price went up', 'Price went up → swap an item, ask the customer, or refund.'],
  ['store_closed', 'Site down', 'Site down → we pause and retry or refund.'],
  ['card_declined', 'Card declined', 'Card declined → try another card or refund.'],
  ['other', 'Other', 'Other → ops will sort it out.'],
] as const;

function money(minor: number) {
  return formatMoney(minor / 100);
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
  const [customReady, setCustomReady] = useState(false);
  const [receiptPath, setReceiptPath] = useState('');
  const [receiptName, setReceiptName] = useState('');
  const [receiptPreview, setReceiptPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
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
      void inHouseHeartbeat(session.access_token).catch(() => undefined);
    }, 30000);
    void inHouseHeartbeat(session.access_token).catch(() => undefined);
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
  const limit = absorbLimitMinor(expected, tolerance, cap);
  const extra = actualMinor - expected;
  const percentCap = Math.floor((expected * tolerance) / 10000);
  const approved = Boolean(detail?.task.customer_price_approved_at);
  const over = expected > 0 && actualMinor > 0 && actualMinor > expected && extra > Math.min(percentCap, cap) && !approved;
  const itemSteps = useMemo(() => (detail?.checklist || []).filter((step) => step.id.startsWith('item-') && !step.id.includes('-step-')), [detail]);
  const leafTicks = useMemo(() => {
    const leaves: Array<{ id: string }> = [];
    for (const step of itemSteps) {
      if (step.children?.length) leaves.push(...step.children);
      else leaves.push(step);
    }
    return leaves;
  }, [itemSteps]);
  const itemsTicked = leafTicks.length === 0 || leafTicks.every((step) => ticks[step.id]);
  const selectedCard = detail?.cards.find((card) => card.id === cardId);
  const stillNeeded: string[] = [];
  if (!itemsTicked) stillNeeded.push(`tick ${leafTicks.filter((step) => !ticks[step.id]).length} item step${leafTicks.filter((step) => !ticks[step.id]).length === 1 ? '' : 's'}`);
  if (!externalOrderRef.trim()) stillNeeded.push('external order number');
  if (!(actualMinor > 0)) stillNeeded.push('total charged');
  if (!cardId) stillNeeded.push('card');
  if (!receiptPath) stillNeeded.push('receipt');
  if (!readyTime) stillNeeded.push('ready time');
  if (over) stillNeeded.push('resolve the price over the limit');
  const canPlace = stillNeeded.length === 0;

  async function copy(text?: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  }

  async function onReceipt(file: File) {
    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const bytes = new Uint8Array(data);
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      const uploaded = await uploadInHouseReceipt(session.access_token, id, btoa(binary));
      setReceiptPath(uploaded.path);
      setReceiptName(file.name);
      if (file.type.startsWith('image/')) setReceiptPreview(URL.createObjectURL(file));
      else setReceiptPreview('');
      toast.success('Receipt saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload receipt');
    } finally {
      setUploading(false);
    }
  }

  function setReadyIn(minutes: number) {
    const ready = new Date(Date.now() + minutes * 60000);
    const hh = String(ready.getHours()).padStart(2, '0');
    const mm = String(ready.getMinutes()).padStart(2, '0');
    setReadyTime(`${hh}:${mm}`);
    setCustomReady(false);
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
      navigate('/in-house?tab=orders');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function problem(code: string) {
    try {
      await raiseInHouseException(session.access_token, id, code);
      toast.success('Problem raised');
      navigate('/in-house?tab=orders');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not raise problem');
    }
  }

  if (!detail) return <div className="p-6 text-slate-200">Loading order…</div>;
  const storeName = detail.merchant?.name || 'Restaurant';
  const orderUrl = String(detail.store?.order_url || '');
  const claimedAgo = detail.task.claimed_at
    ? Math.max(0, Math.floor((Date.now() - new Date(String(detail.task.claimed_at)).getTime()) / 60000))
    : null;

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-slate-950 text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
        <button type="button" className="text-sm text-slate-300" onClick={() => navigate('/in-house?tab=orders')}>← Back to orders</button>
        <div className="font-semibold">
          {storeName} · {String(detail.order?.order_number || '')}
          {claimedAgo != null ? <span className="ml-2 text-sm font-normal text-slate-400">claimed by you {claimedAgo} min ago</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded bg-slate-800 px-2 py-1 text-sm" onClick={() => setShowKeys((open) => !open)}>?</button>
          {detail.task.state === 'claimed' || detail.task.state === 'placing' ? (
            <button type="button" className="text-sm text-slate-300" onClick={() => void releaseInHouseTask(session.access_token, id).then(() => navigate('/in-house?tab=orders'))}>
              Give back to queue
            </button>
          ) : <span />}
        </div>
      </header>
      {showKeys ? (
        <p className="border-b border-slate-800 px-4 py-2 text-sm text-slate-400">Keys: 1–9 copy an item, P mark placed, E raise a problem.</p>
      ) : null}

      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-slate-800 p-4">
          <h2 className="font-medium">1. Place the order on {storeName}</h2>
          {orderUrl ? <a className="inline-block rounded-xl bg-amber-500 px-3 py-2 text-slate-950" href={orderUrl} target="_blank" rel="noreferrer">Open {storeName} ordering ↗</a> : <p className="text-amber-200">No ordering link on this restaurant yet.</p>}
          <p>Order type: carry-out</p>
          <p>Pickup name: {String(detail.task.pickup_code)} <button type="button" className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-sm" onClick={() => void copy(String(detail.task.pickup_code))}>Copy</button></p>
          {itemSteps.map((step) => (
            <div key={step.id} className="space-y-2 rounded border border-slate-800 p-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(ticks[step.id])} onChange={(event) => setTicks((current) => ({ ...current, [step.id]: event.target.checked }))} />
                <span className="font-medium">{step.label}</span>
                <button type="button" className="rounded bg-slate-800 px-2 py-0.5 text-sm" onClick={() => void copy(step.copyText)}>Copy all</button>
              </label>
              {(step.children || []).map((child) => (
                <label key={child.id} className="ml-6 flex items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={Boolean(ticks[child.id])} onChange={(event) => setTicks((current) => ({ ...current, [child.id]: event.target.checked }))} />
                  <span>{child.label}</span>
                  <button type="button" className="rounded bg-slate-800 px-2 py-0.5 text-xs" onClick={() => void copy(child.copyText)}>Copy</button>
                </label>
              ))}
            </div>
          ))}
          <p>Expected cost {money(expected)}</p>
          <p>Customer paid {money(Math.round(Number(detail.order?.total || 0) * 100))}</p>
        </section>

        <section className="space-y-3 rounded-lg border border-slate-800 p-4">
          <h2 className="font-medium">2. Record what you paid</h2>
          <label className="block text-sm">
            External order number
            <input className="mt-1 w-full rounded bg-slate-900 p-2" value={externalOrderRef} onChange={(event) => setExternalOrderRef(event.target.value)} placeholder="e.g. 48291" />
          </label>
          <label className="block text-sm">
            Total charged J$
            <input className="mt-1 w-full rounded bg-slate-900 p-2" value={totalMajor} onChange={(event) => setTotalMajor(event.target.value)} placeholder="e.g. 4280" />
          </label>
          {actualMinor > 0 ? (
            over
              ? <p className="text-amber-300">{money(actualMinor - limit)} over the limit. Choose: swap an item / ask the customer / refund.</p>
              : <p className="text-emerald-300">Within limit · up to {money(limit)} is OK</p>
          ) : (
            <p className="text-slate-400">Up to {money(limit)} is OK</p>
          )}
          <label className="block text-sm">
            Card
            <select className="mt-1 w-full rounded bg-slate-900 p-2" value={cardId} onChange={(event) => setCardId(event.target.value)}>
              {detail.cards.map((card) => (
                <option key={card.id} value={card.id}>{card.label} ·· {card.last4} · daily limit {money(card.daily_limit_minor)}</option>
              ))}
            </select>
          </label>
          {selectedCard && actualMinor > 0 && actualMinor > selectedCard.daily_limit_minor ? (
            <p className="text-amber-300">This charge is above the card&apos;s daily limit of {money(selectedCard.daily_limit_minor)}.</p>
          ) : null}
          <div className="space-y-2 text-sm">
            <span>Ready at</span>
            <div className="flex flex-wrap gap-2">
              {[15, 20, 30].map((mins) => (
                <button key={mins} type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => setReadyIn(mins)}>+{mins}</button>
              ))}
              <button type="button" className="rounded bg-slate-800 px-3 py-1" onClick={() => setCustomReady(true)}>custom</button>
            </div>
            {(customReady || readyTime) ? (
              <input type="time" className="mt-1 w-full rounded bg-slate-900 p-2" value={readyTime} onChange={(event) => setReadyTime(event.target.value)} />
            ) : null}
          </div>
          <div className="space-y-2 text-sm">
            <span>Receipt</span>
            <label className="block">
              <input type="file" accept="image/*,application/pdf" className="mt-1 block" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReceipt(file); }} />
            </label>
            {uploading ? <p className="text-slate-400">Uploading…</p> : null}
            {receiptPath ? (
              <div className="flex items-center gap-3">
                {receiptPreview ? <img src={receiptPreview} alt="" className="h-16 w-16 rounded object-cover" /> : null}
                <div>
                  <p className="text-emerald-300">✓ {receiptName || 'receipt saved'}</p>
                  <label className="text-slate-400 underline">
                    Replace
                    <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReceipt(file); }} />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" disabled={!canPlace || busy} className="rounded-xl bg-amber-500 px-4 py-2 text-slate-950 disabled:opacity-40" onClick={() => void save()}>
            Mark placed
          </button>
          {!canPlace ? <p className="text-sm text-slate-400">Still needed: {stillNeeded.join(' · ')}</p> : null}

          <h2 className="pt-4 font-medium">3. Something wrong?</h2>
          <div className="flex flex-wrap gap-2">
            {EXCEPTIONS.map(([code, label, hint]) => (
              <button key={code} type="button" title={hint} className="rounded bg-slate-800 px-3 py-2" onClick={() => void problem(code)}>{label}</button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Each choice tells the customer what happens next.</p>
        </section>
      </div>

      <section className="border-t border-slate-800 p-4">
        <h2 className="mb-2 font-medium">Messages with the customer</h2>
        <p className="mb-2 text-xs text-slate-500">They see these as coming from the restaurant.</p>
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
    </div>
  );
}
