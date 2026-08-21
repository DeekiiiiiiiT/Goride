import React, { useCallback, useEffect, useState } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '../../../utils/supabase/client';
import type { OrderMessageDto, OrderChatPair } from '@roam/types/orderChat';
import { Loader2, Send } from 'lucide-react';

type Props = {
  orderId: string;
};

/**
 * Admin support thread viewer — reads all pairs, can inject as Roam Support.
 */
export function OrderChatSupportPanel({ orderId }: Props) {
  const [messages, setMessages] = useState<OrderMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [pair, setPair] = useState<OrderChatPair | 'all'>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const qs = pair === 'all' ? '' : `?pair=${pair}`;
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/admin/orders/${encodeURIComponent(orderId)}/messages${qs}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to load chat');
      setMessages((body.messages ?? []) as OrderMessageDto[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [orderId, pair]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/admin/orders/${encodeURIComponent(orderId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            body: text,
            pair: pair === 'all' ? 'support' : pair,
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Send failed');
      setDraft('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Order chat</h3>
        <select
          value={pair}
          onChange={(e) => setPair(e.target.value as OrderChatPair | 'all')}
          className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="all">All pairs</option>
          <option value="customer_courier">Customer ↔ Courier</option>
          <option value="customer_merchant">Customer ↔ Merchant</option>
          <option value="merchant_courier">Merchant ↔ Courier</option>
          <option value="support">Support</option>
        </select>
      </div>

      <div className="max-h-64 min-h-[8rem] overflow-y-auto rounded bg-slate-50 p-3 text-sm dark:bg-slate-950">
        {loading && messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-slate-500">No messages yet.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded bg-white px-2 py-1.5 shadow-sm dark:bg-slate-800">
                <div className="text-[10px] font-semibold uppercase text-slate-400">
                  {m.pair} · {m.sender_role}
                </div>
                <p className="text-slate-800 dark:text-slate-100">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 500))}
          placeholder="Join as Roam Support…"
          className="flex-1 rounded border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
        />
        <button
          type="button"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
          className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </button>
      </div>
    </div>
  );
}
