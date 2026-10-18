import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Copy,
  Flag,
  HelpCircle,
  Hourglass,
  MessageSquare,
  Receipt,
  Send,
  Store,
  TriangleAlert,
} from 'lucide-react';
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

/** Stitch Oceanic Blue — Order Workspace (order-workspace.html). */
const S = {
  page: 'bg-[#060f17] text-[#d2e8ff]',
  header: 'border-b border-[#354a5c]/40 bg-[#071520]',
  surface: 'rounded-xl border border-[#354a5c]/40 bg-[#0a1b28] shadow-sm',
  surfaceLow: 'bg-[#071520]',
  surfaceHigh: 'bg-[#0f212f]',
  muted: 'text-[#98adc3]',
  outline: 'border-[#354a5c]',
  primary: 'text-[#adc6ff]',
  tertiary: 'text-[#7de9ff]',
  input:
    'w-full rounded-lg border border-[#354a5c]/60 bg-[#071520] px-3 py-2 text-xs font-medium text-[#d2e8ff] placeholder:text-[#98adc3]/40 focus:border-[#7de9ff] focus:outline-none focus:ring-1 focus:ring-[#7de9ff]',
  chip: 'rounded-lg border border-[#354a5c]/40 py-1.5 px-1 text-center text-xs font-medium text-[#98adc3] transition hover:bg-[#122839]/50 hover:text-[#d2e8ff]',
  chipOn:
    'rounded-lg border-2 border-[#7de9ff] bg-[#3adffa]/20 py-1.5 px-1 text-center text-xs font-bold text-[#7de9ff] shadow-[0_0_10px_rgba(34,211,238,0.2)]',
  ghostBtn:
    'rounded-lg border border-[#354a5c]/60 px-3 py-1.5 text-xs font-medium text-[#98adc3] transition hover:border-[#63788c] hover:bg-[#122839]/40 hover:text-white',
  cta: 'flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#22d3ee] px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:shadow-cyan-500/20 active:scale-95 disabled:opacity-40',
} as const;

const EXCEPTIONS = [
  ['store_closed', 'Site Down', 'Site down → we pause and retry or refund.'],
  ['card_declined', 'Card Declined', 'Card declined → try another card or refund.'],
  ['price_increase_over_tolerance', 'Price Mismatch', 'Price went up → swap an item, ask the customer, or refund.'],
  ['other', 'Flag Problem…', 'Other → ops will sort it out.'],
] as const;

const QUICK_REPLIES = ['Order in oven', 'Slight delay (5m)', 'Driver on the way'] as const;

function money(minor: number) {
  return formatMoney(minor / 100);
}

function agoLabel(iso?: string | null) {
  if (!iso) return null;
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function slaRemaining(dueAt?: string | null) {
  if (!dueAt) return null;
  const mins = Math.round((new Date(dueAt).getTime() - Date.now()) / 60000);
  return mins;
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
  const [readyMins, setReadyMins] = useState<number | null>(null);
  const [customReady, setCustomReady] = useState(false);
  const [receiptPath, setReceiptPath] = useState('');
  const [receiptName, setReceiptName] = useState('');
  const [receiptPreview, setReceiptPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [messages, setMessages] = useState<Array<{ id: string; body: string; sender_role: string; created_at?: string }>>([]);
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

  // Fill the shell content column only — never cover the left nav (old fixed inset-0).
  useEffect(() => {
    const main = document.querySelector('.dash-admin-shell-main');
    const wrap = main?.firstElementChild as HTMLElement | null;
    const mainClasses = ['!p-0', '!overflow-hidden', 'flex', 'flex-col', 'min-h-0'];
    const wrapClasses = ['!max-w-none', '!mx-0', 'min-h-0', 'flex-1', 'flex', 'flex-col', 'h-full'];
    main?.classList.add(...mainClasses);
    wrap?.classList.add(...wrapClasses);
    return () => {
      main?.classList.remove(...mainClasses);
      wrap?.classList.remove(...wrapClasses);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void save();
      }
      if (event.key === 'Escape') navigate('/in-house?tab=orders');
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

  // Stitch 4-step buyer checklist progress
  const portalOpen = Boolean(detail?.store?.order_url);
  const stepPayDone = Boolean(externalOrderRef.trim() && actualMinor > 0 && cardId && readyTime);
  const stepReceiptDone = Boolean(receiptPath);
  const activeStep = !itemsTicked ? 2 : !stepPayDone ? 3 : !stepReceiptDone ? 4 : 4;
  const stepLabel = `Step ${Math.min(activeStep, 4)} of 4`;

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
    setReadyMins(minutes);
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

  async function sendReply(body: string) {
    const orderId = String(detail?.order?.id || '');
    if (!orderId || !body.trim()) return;
    try {
      await sendInHouseChat(session.access_token, orderId, body.trim());
      const chat = await listInHouseChat(session.access_token, orderId);
      setMessages(chat.messages || []);
      setReply('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send');
    }
  }

  if (!detail) {
    return <div className={`flex h-full items-center justify-center p-6 ${S.page}`}>Loading order…</div>;
  }

  const storeName = detail.merchant?.name || 'Restaurant';
  const orderNumber = String(detail.order?.order_number || detail.task.id || '');
  const orderUrl = String(detail.store?.order_url || '');
  const claimedAgo = agoLabel(detail.task.claimed_at ? String(detail.task.claimed_at) : null);
  const customerTotalMinor = Math.round(Number(detail.order?.total || 0) * 100) || expected;
  const cart = detail.cart || [];
  const itemSummary = cart.slice(0, 3).map((line) => `${line.quantity}x ${line.name}`).join(', ');
  const slaMins = slaRemaining(detail.task.sla_due_at ? String(detail.task.sla_due_at) : null);
  const slaDueLabel = detail.task.sla_due_at
    ? new Date(String(detail.task.sla_due_at)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const matchPct = expected > 0 && actualMinor > 0 ? Math.round((actualMinor / expected) * 100) : null;
  const withinLimit = actualMinor > 0 && !over;
  const operatorName = String(session.user?.email || 'Operator').split('@')[0];
  const operatorInitials = operatorName.slice(0, 2).toUpperCase();

  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${S.page}`}>
      {/* Top sticky bar — Stitch Order Workspace */}
      <header className={`flex h-14 shrink-0 items-center justify-between px-4 sm:px-6 ${S.header}`}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${S.muted} hover:bg-[#122839]/50 hover:text-[#d2e8ff]`}
            onClick={() => navigate('/in-house?tab=orders')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Orders
          </button>
          <div className="hidden h-4 w-px bg-[#354a5c]/50 sm:block" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-base font-bold tracking-tight text-[#d2e8ff]">
              {storeName} · {orderNumber}
            </span>
            <button
              type="button"
              className={`rounded p-1 ${S.muted} hover:bg-[#122839]/50 hover:text-[#adc6ff]`}
              title="Copy order ID"
              onClick={() => void copy(orderNumber)}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          {claimedAgo != null ? (
            <div className="ml-1 hidden items-center gap-1.5 rounded-full border border-[#a4c9ff]/30 bg-[#003c70]/60 px-2.5 py-0.5 text-xs font-medium text-[#a4c9ff] sm:flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7de9ff]" />
              Claimed by you · {claimedAgo}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full border border-[#354a5c]/40 bg-[#0a1b28] px-3 py-1 text-xs text-[#d2e8ff] md:flex">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="font-medium text-emerald-400">Desk Open</span>
          </div>
          <button type="button" className={`rounded-lg p-1.5 ${S.muted} hover:bg-[#122839]/50 hover:text-[#d2e8ff]`} title="Keyboard shortcuts" onClick={() => setShowKeys((v) => !v)}>
            <HelpCircle className="h-4 w-4" />
          </button>
          {(detail.task.state === 'claimed' || detail.task.state === 'placing') ? (
            <button
              type="button"
              className={`hidden text-xs ${S.muted} hover:text-[#d2e8ff] sm:inline`}
              onClick={() => void releaseInHouseTask(session.access_token, id).then(() => navigate('/in-house?tab=orders'))}
            >
              Give back
            </button>
          ) : null}
          <div className="hidden h-5 w-px bg-[#354a5c]/40 lg:block" />
          <div className="hidden items-center gap-2 pl-1 lg:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0e69dc] text-xs font-bold text-white ring-2 ring-[#354a5c]/40">
              {operatorInitials}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-semibold leading-tight text-[#d2e8ff]">{operatorName}</span>
              <span className={`text-[10px] leading-tight ${S.muted}`}>Operator</span>
            </div>
          </div>
        </div>
      </header>

      {showKeys ? (
        <p className={`border-b border-[#354a5c]/40 px-4 py-2 text-xs ${S.muted}`}>
          ⌘/Ctrl+Enter mark placed · Esc back · 1–9 copy item · P place · E problem
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Main work column + bottom bar (stays clear of messages) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#060f17]">
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          {/* Summary strip */}
          <div className="p-5 pb-0">
            <div className={`${S.surface} flex flex-wrap items-center justify-between gap-4 p-4`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-[#354a5c]/50 ${S.surfaceHigh} ${S.primary}`}>
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <span className={`block text-[11px] font-medium uppercase tracking-wider ${S.muted}`}>Customer Total</span>
                  <span className="text-lg font-bold tracking-tight text-[#d2e8ff]">{money(customerTotalMinor)}</span>
                </div>
              </div>
              <div className="hidden h-8 w-px bg-[#354a5c]/30 md:block" />
              <div>
                <span className={`block text-[11px] font-medium uppercase tracking-wider ${S.muted}`}>Merchant</span>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-[#d2e8ff]">
                  <span>{storeName}</span>
                  {orderUrl ? (
                    <a href={orderUrl} target="_blank" rel="noreferrer" className={`text-xs font-normal ${S.tertiary} hover:underline`}>
                      Open site ↗
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="hidden h-8 w-px bg-[#354a5c]/30 md:block" />
              <div>
                <span className={`block text-[11px] font-medium uppercase tracking-wider ${S.muted}`}>Items Breakdown</span>
                <span className="text-sm font-medium text-[#d2e8ff]">
                  {cart.length || itemSteps.length} items{' '}
                  {itemSummary ? <span className={`text-xs ${S.muted}`}>({itemSummary})</span> : null}
                </span>
              </div>
              <div className="hidden h-8 w-px bg-[#354a5c]/30 md:block" />
              <div>
                <span className={`block text-[11px] font-medium uppercase tracking-wider ${S.muted}`}>SLA Target</span>
                <div className="flex items-center gap-2">
                  {slaMins != null ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                        slaMins < 0
                          ? 'border-rose-800/50 bg-rose-950/60 text-rose-300'
                          : 'border-emerald-800/50 bg-emerald-950/60 text-emerald-400'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${slaMins < 0 ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                      {slaMins < 0 ? `Late (${Math.abs(slaMins)}m)` : `On time (${slaMins}m remaining)`}
                    </span>
                  ) : (
                    <span className={`text-xs ${S.muted}`}>No SLA set</span>
                  )}
                  {slaDueLabel ? <span className={`text-xs font-medium ${S.muted}`}>Due {slaDueLabel}</span> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-12">
            {/* Checklist + line items */}
            <section className="flex flex-col gap-5 xl:col-span-7">
              <div className={`${S.surface} p-5`}>
                <div className="mb-3 flex items-center justify-between border-b border-[#354a5c]/30 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={`h-5 w-5 ${S.primary}`} />
                    <h2 className="text-sm font-bold text-[#d2e8ff]">Buyer Checklist & Order Line Items</h2>
                  </div>
                  <span className={`rounded-md border border-[#354a5c]/30 ${S.surfaceHigh} px-2.5 py-1 text-xs font-medium ${S.muted}`}>
                    {stepLabel}
                  </span>
                </div>

                <div className="mb-5 space-y-2">
                  <CheckRow
                    n={1}
                    label="Open merchant portal / call desk"
                    done={portalOpen || Boolean(ticks['portal'])}
                    active={!portalOpen && !ticks['portal']}
                    meta={portalOpen ? 'Completed' : 'Pending'}
                    onToggle={() => setTicks((c) => ({ ...c, portal: !c.portal }))}
                  />
                  <CheckRow
                    n={2}
                    label="Pick order items and verify custom notes"
                    done={itemsTicked}
                    active={!itemsTicked && (portalOpen || Boolean(ticks['portal']))}
                    meta={itemsTicked ? `${leafTicks.length || cart.length} items verified` : 'In progress'}
                  />
                  <CheckRow
                    n={3}
                    label="Pay with corporate buyer card"
                    done={stepPayDone}
                    active={itemsTicked && !stepPayDone}
                    meta={stepPayDone ? 'Completed' : itemsTicked ? 'In Progress' : 'Pending'}
                  />
                  <CheckRow
                    n={4}
                    label="Capture & attach printed/digital receipt"
                    done={stepReceiptDone}
                    active={stepPayDone && !stepReceiptDone}
                    meta={stepReceiptDone ? 'Completed' : 'Pending'}
                    dim={!stepPayDone}
                  />
                </div>

                {/* Line items */}
                <div className={`overflow-hidden rounded-lg border border-[#354a5c]/30 ${S.surfaceLow}`}>
                  <div className={`flex justify-between border-b border-[#354a5c]/30 ${S.surfaceHigh} px-4 py-2 text-[11px] font-semibold uppercase tracking-wider ${S.muted}`}>
                    <span>Item details & requirements</span>
                    <span>Actions</span>
                  </div>
                  <div className="divide-y divide-[#354a5c]/20">
                    {itemSteps.length > 0 ? itemSteps.map((step) => (
                      <div key={step.id} className="space-y-2 p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(ticks[step.id])}
                              onChange={(event) => setTicks((current) => ({ ...current, [step.id]: event.target.checked }))}
                              className="rounded border-[#354a5c]"
                            />
                            <span className="text-xs font-bold text-[#d2e8ff]">{step.label}</span>
                          </label>
                          <button type="button" className={S.ghostBtn} onClick={() => void copy(step.copyText)}>Copy</button>
                        </div>
                        {(step.children || []).map((child) => (
                          <label key={child.id} className="ml-6 flex items-center justify-between gap-2 text-xs text-[#98adc3]">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={Boolean(ticks[child.id])}
                                onChange={(event) => setTicks((current) => ({ ...current, [child.id]: event.target.checked }))}
                                className="rounded border-[#354a5c]"
                              />
                              {child.label}
                            </span>
                            <button type="button" className={S.ghostBtn} onClick={() => void copy(child.copyText)}>Copy</button>
                          </label>
                        ))}
                      </div>
                    )) : cart.map((line, idx) => (
                      <div key={`${line.name}-${idx}`} className="flex items-start justify-between p-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded border border-[#adc6ff]/20 bg-[#0e69dc]/30 px-1.5 py-0.5 text-xs font-bold text-[#a4c9ff]">
                              {line.quantity}x
                            </span>
                            <span className="text-xs font-bold text-[#d2e8ff]">{line.name}</span>
                          </div>
                          {(line.options || []).map((opt) => (
                            <div key={opt} className="flex items-center gap-1.5 pl-6 text-xs font-medium text-amber-300">
                              <TriangleAlert className="h-3 w-3" />
                              <span>{opt}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {itemSteps.length === 0 && cart.length === 0 ? (
                      <p className={`p-4 text-xs ${S.muted}`}>No line items on this order.</p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between border-t border-[#354a5c]/30 bg-[#0f212f]/80 px-4 py-2.5 text-xs">
                    <span className={`font-semibold ${S.muted}`}>Merchant Basket Total</span>
                    <span className={`text-sm font-bold ${S.tertiary}`}>{money(expected || customerTotalMinor)}</span>
                  </div>
                </div>

                <p className={`mt-3 text-xs ${S.muted}`}>
                  Pickup name: <span className="font-semibold text-[#d2e8ff]">{String(detail.task.pickup_code)}</span>{' '}
                  <button type="button" className={`ml-1 ${S.ghostBtn}`} onClick={() => void copy(String(detail.task.pickup_code))}>Copy</button>
                </p>
              </div>

              {/* Issue row */}
              <div className={`${S.surface} flex flex-wrap items-center justify-between gap-3 p-4`}>
                <div className="flex items-center gap-2">
                  <TriangleAlert className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-semibold text-[#d2e8ff]">Encountering an issue?</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {EXCEPTIONS.map(([code, label, hint]) => (
                    <button
                      key={code}
                      type="button"
                      title={hint}
                      className={
                        code === 'other'
                          ? 'flex items-center gap-1 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-950/30'
                          : S.ghostBtn
                      }
                      onClick={() => void problem(code)}
                    >
                      {code === 'other' ? <Flag className="h-3 w-3" /> : null}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Placement form */}
            <section className="flex flex-col gap-5 xl:col-span-5">
              <div className={`${S.surface} flex flex-col gap-4 p-5`}>
                <div className="flex items-center justify-between border-b border-[#354a5c]/30 pb-3">
                  <div className="flex items-center gap-2">
                    <Store className={`h-5 w-5 ${S.tertiary}`} />
                    <h2 className="text-sm font-bold text-[#d2e8ff]">Merchant Placement Details</h2>
                  </div>
                  <span className={`font-mono text-[11px] ${S.tertiary}`}>STEP 3 / PLACEMENT</span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#d2e8ff]">
                    Merchant Order / Confirmation # <span className={S.primary}>*</span>
                  </label>
                  <div className="relative">
                    <input
                      className={S.input}
                      value={externalOrderRef}
                      onChange={(event) => setExternalOrderRef(event.target.value)}
                      placeholder="e.g. SPC-99214"
                    />
                    {externalOrderRef.trim() ? (
                      <CheckCircle2 className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-emerald-400" />
                    ) : null}
                  </div>
                  <p className={`mt-1 text-[10px] ${S.muted}`}>Found on the restaurant&apos;s order summary screen</p>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#d2e8ff]">
                    Total Charged at Restaurant <span className={S.primary}>*</span>
                  </label>
                  <div className="relative flex items-center">
                    <span className={`absolute left-3 text-xs font-bold ${S.muted}`}>J$</span>
                    <input
                      className={`${S.input} pl-9`}
                      value={totalMajor}
                      onChange={(event) => setTotalMajor(event.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                    />
                  </div>
                  {actualMinor > 0 ? (
                    <div className={`mt-1 flex items-center gap-1.5 text-[11px] font-medium ${withinLimit ? 'text-emerald-400' : 'text-rose-300'}`}>
                      <CheckCircle2 className="h-3 w-3" />
                      <span>
                        {withinLimit
                          ? `Within authorized limit${matchPct != null ? ` (Match ${matchPct}%)` : ''}`
                          : `${money(actualMinor - limit)} over the absorb limit`}
                      </span>
                    </div>
                  ) : (
                    <p className={`mt-1 text-[11px] ${S.muted}`}>OK up to {money(limit)}</p>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#d2e8ff]">Ready Time / Prep Estimate</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[10, 15, 20, 30].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        className={readyMins === mins && !customReady ? S.chipOn : S.chip}
                        onClick={() => setReadyIn(mins)}
                      >
                        {mins}m
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`${customReady ? S.chipOn : S.chip} border-dashed`}
                      onClick={() => { setCustomReady(true); setReadyMins(null); }}
                    >
                      + Custom
                    </button>
                  </div>
                  {(customReady || readyTime) ? (
                    <input
                      type="time"
                      className={`mt-2 ${S.input}`}
                      value={readyTime}
                      onChange={(event) => { setReadyTime(event.target.value); setCustomReady(true); setReadyMins(null); }}
                    />
                  ) : null}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#d2e8ff]">
                    Buyer Payment Method <span className={S.primary}>*</span>
                  </label>
                  <div className="relative">
                    <select
                      className={`${S.input} appearance-none pr-8`}
                      value={cardId}
                      onChange={(event) => setCardId(event.target.value)}
                    >
                      {detail.cards.length === 0 ? <option value="">No cards</option> : null}
                      {detail.cards.map((card) => (
                        <option key={card.id} value={card.id}>
                          {card.label} ···· {card.last4} · daily {money(card.daily_limit_minor)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className={`pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 ${S.muted}`} />
                  </div>
                  {selectedCard ? (
                    <p className="mt-1 font-mono text-[10px] text-emerald-400">
                      Daily Limit: {money(selectedCard.daily_limit_minor)}
                    </p>
                  ) : null}
                  {selectedCard && actualMinor > 0 && actualMinor > selectedCard.daily_limit_minor ? (
                    <p className="mt-1 text-[11px] text-amber-300">This charge is above the card&apos;s daily limit.</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[#d2e8ff]">
                    Receipt Scan or Screenshot{' '}
                    <span className={`font-normal ${S.muted}`}>(required to place)</span>
                  </label>
                  <label className="group block cursor-pointer rounded-xl border-2 border-dashed border-[#354a5c]/50 bg-[#071520]/50 p-4 text-center transition hover:border-[#7de9ff]/60 hover:bg-[#0f212f]/40">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={(event) => { const file = event.target.files?.[0]; if (file) void onReceipt(file); }}
                    />
                    {receiptPath ? (
                      <div className="flex items-center justify-center gap-3">
                        {receiptPreview ? <img src={receiptPreview} alt="" className="h-12 w-12 rounded object-cover" /> : null}
                        <div className="text-left">
                          <p className="text-xs font-semibold text-emerald-400">✓ {receiptName || 'Receipt saved'}</p>
                          <p className={`text-[10px] ${S.muted}`}>Click to replace</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full ${S.surfaceHigh} ${S.tertiary} transition group-hover:scale-110`}>
                          <CloudUpload className="h-4 w-4" />
                        </div>
                        <p className="mb-0.5 text-xs font-semibold text-[#d2e8ff]">
                          {uploading ? 'Uploading…' : 'Drop receipt scan or click to browse'}
                        </p>
                        <p className={`text-[10px] ${S.muted}`}>Supports JPG, PNG or PDF up to 10MB</p>
                      </>
                    )}
                  </label>
                </div>
              </div>
            </section>
          </div>
        </main>

      {/* Bottom action bar */}
      <footer className="z-10 flex shrink-0 items-center justify-between border-t border-[#354a5c]/40 bg-[#071520]/95 px-4 py-2.5 shadow-2xl backdrop-blur sm:px-6">
        <div className={`hidden items-center gap-4 text-xs ${S.muted} sm:flex`}>
          <div className="flex items-center gap-1.5">
            <kbd className={`rounded border border-[#354a5c]/50 ${S.surfaceHigh} px-1.5 py-0.5 font-mono text-[11px] text-[#d2e8ff]`}>⌘ + Enter</kbd>
            <span>to confirm placement</span>
          </div>
          <div className="hidden items-center gap-1.5 md:flex">
            <kbd className={`rounded border border-[#354a5c]/50 ${S.surfaceHigh} px-1.5 py-0.5 font-mono text-[11px] text-[#d2e8ff]`}>Esc</kbd>
            <span>to back</span>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-400 md:flex">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>
            {canPlace ? 'Ready to mark placed' : `Still needed: ${stillNeeded.slice(0, 2).join(' · ')}${stillNeeded.length > 2 ? '…' : ''}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={S.ghostBtn} onClick={() => navigate('/in-house?tab=orders')}>
            Save Draft
          </button>
          <button type="button" disabled={!canPlace || busy} className={S.cta} onClick={() => void save()}>
            <span>{busy ? 'Saving…' : 'Mark Placed'}</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </footer>
        </div>

        {/* Customer messages drawer */}
        <aside className="hidden w-80 shrink-0 flex-col border-l border-[#354a5c]/30 bg-[#0a1b28] lg:flex lg:w-96">
          <div className={`flex items-center justify-between border-b border-[#354a5c]/30 ${S.surfaceHigh} p-4`}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#003c70]/60 text-[#a4c9ff] ring-1 ring-[#a4c9ff]/40">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-[#d2e8ff]">Customer Messages</h3>
                <span className={`text-[10px] font-medium ${S.tertiary}`}>Connected proxy link</span>
              </div>
            </div>
          </div>
          <div className={`flex items-center gap-2 border-b border-[#354a5c]/20 ${S.surfaceLow} px-4 py-2 text-[11px] ${S.muted}`}>
            They see these as coming from the restaurant.
          </div>
          <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className={`text-xs ${S.muted}`}>No messages yet.</p>
            ) : (
              messages.map((message) => {
                const fromOps = /ops|buyer|restaurant|agent|you/i.test(message.sender_role);
                return (
                  <div key={message.id} className={`flex max-w-[88%] flex-col ${fromOps ? 'ml-auto items-end' : 'items-start'}`}>
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className={`text-[11px] font-semibold ${fromOps ? S.tertiary : 'text-[#d2e8ff]'}`}>
                        {fromOps ? 'You (as Restaurant)' : 'Customer'}
                      </span>
                      {message.created_at ? (
                        <span className={`text-[10px] ${S.muted}`}>{agoLabel(message.created_at)}</span>
                      ) : null}
                    </div>
                    <div
                      className={
                        fromOps
                          ? 'rounded-2xl rounded-tr-sm bg-[#0e69dc] p-3 text-xs leading-relaxed text-white shadow-sm'
                          : 'rounded-2xl rounded-tl-sm border border-[#354a5c]/30 bg-[#0f212f] p-3 text-xs leading-relaxed text-[#d2e8ff] shadow-sm'
                      }
                    >
                      {message.body}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-[#354a5c]/20 bg-[#071520]/50 px-4 py-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              {QUICK_REPLIES.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="whitespace-nowrap rounded-full border border-[#354a5c]/40 bg-[#0f212f] px-2.5 py-1 text-[#98adc3] transition hover:border-[#7de9ff] hover:text-[#d2e8ff]"
                  onClick={() => void sendReply(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
          <form
            className={`border-t border-[#354a5c]/30 ${S.surfaceHigh} p-3`}
            onSubmit={(event) => {
              event.preventDefault();
              void sendReply(reply);
            }}
          >
            <div className="relative flex items-center">
              <input
                className={`${S.input} rounded-xl py-2.5 pr-10`}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply as the restaurant…"
              />
              <button
                type="submit"
                className="absolute right-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#22d3ee] text-white shadow-md transition hover:opacity-90 active:scale-95"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className={`mt-2 flex items-center justify-between px-1 text-[10px] ${S.muted}`}>
              <span>SMS mask active</span>
              <span>Enter to send</span>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

function CheckRow({
  n,
  label,
  done,
  active,
  meta,
  dim,
  onToggle,
}: {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
  meta: string;
  dim?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-2.5 ${
        active
          ? 'border-[#a4c9ff]/40 bg-[#003c70]/20 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
          : done
            ? 'border-[#354a5c]/30 bg-[#071520]/70'
            : `border-[#354a5c]/20 bg-[#071520]/40 ${dim ? 'opacity-70' : ''}`
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!onToggle}
          onClick={onToggle}
          className={`flex h-5 w-5 items-center justify-center rounded ${
            done
              ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
              : active
                ? 'animate-pulse bg-[#0e69dc] text-white'
                : 'border border-[#354a5c]/50 text-[#98adc3]'
          }`}
        >
          {done ? <Check className="h-3 w-3 font-bold" /> : active ? <Hourglass className="h-3 w-3" /> : <span className="text-[10px]">{n}</span>}
        </button>
        <span className={`text-xs ${active ? 'font-semibold text-[#adc6ff]' : done ? 'font-medium text-[#d2e8ff]' : 'text-[#98adc3]'}`}>
          {n}. {label}
        </span>
      </div>
      <span
        className={`text-[11px] font-medium ${
          active ? 'rounded bg-[#003c70]/60 px-2 py-0.5 font-semibold text-[#a4c9ff]' : done ? 'text-emerald-400' : 'text-[#98adc3]'
        }`}
      >
        {meta}
      </span>
    </div>
  );
}
