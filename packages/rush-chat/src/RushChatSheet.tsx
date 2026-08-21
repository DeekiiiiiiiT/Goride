import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, Loader2, Send, X } from 'lucide-react';
import type {
  OrderChatPair,
  OrderChatParticipantsDto,
  OrderChatViewerRole,
} from '@roam/types/orderChat';
import { ORDER_CHAT_QUICK_REPLIES } from '@roam/types/orderChat';
import type { UseRushChatResult } from './useRushChat';
import type { RushChatVariant } from './types';
import { messageSenderLabel } from './chatLabels';

const MAX_LEN = 500;

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerLabel: string;
  variant: RushChatVariant;
  pair: OrderChatPair;
  enabled: boolean;
  currentUserId: string | null | undefined;
  chat: UseRushChatResult;
  participants?: OrderChatParticipantsDto | null;
  viewerRole?: OrderChatViewerRole | null;
};

const ACCENT: Record<RushChatVariant, string> = {
  customer: '#e11d48',
  courier: '#0d9488',
  merchant: '#ea580c',
  support: '#4f46e5',
};

export function RushChatSheet({
  open,
  onOpenChange,
  peerLabel,
  variant,
  pair,
  enabled,
  currentUserId,
  chat,
  participants,
  viewerRole,
}: Props) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, loading, sending, error, send, reportMessage } = chat;
  const accent = ACCENT[variant];
  const quickReplies =
    pair === 'support' ? [] : ORDER_CHAT_QUICK_REPLIES[pair] ?? [];

  useEffect(() => {
    if (!open) setDraft('');
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, loading]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleSend = async (text?: string, key?: string) => {
    const body = (text ?? draft).trim();
    if (!body) return;
    const ok = await send(body, key);
    if (ok && !text) setDraft('');
  };

  if (!open) return null;

  const labelParticipants = participants ?? chat.participants;
  const labelViewerRole = viewerRole ?? chat.viewerRole;

  return createPortal(
    <div className="rush-chat-portal" role="presentation">
      <button
        type="button"
        className="fixed inset-0 z-[300] bg-black/50"
        aria-label="Close chat"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[310] mx-auto flex w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{ maxHeight: 'min(70dvh, 520px)', height: 'min(70dvh, 520px)' }}
        role="dialog"
        aria-labelledby="rush-chat-title"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="rush-chat-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Chat
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{peerLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto space-y-3 bg-slate-50 px-4 py-4 dark:bg-slate-950"
        >
          {!enabled ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Messaging is not available for this order right now.
            </p>
          ) : loading && messages.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Send a message to coordinate this order.
            </p>
          ) : (
            messages.map((msg) => {
              const isSystem = msg.sender_role === 'system';
              const isMine = !isSystem && msg.sender_user_id === currentUserId;
              const roleLabel =
                labelParticipants && labelViewerRole
                  ? messageSenderLabel(msg, labelViewerRole, labelParticipants, currentUserId)
                  : null;
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <p className="max-w-[90%] rounded-full bg-slate-200/80 px-3 py-1 text-center text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {msg.body}
                    </p>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`group flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={
                      isMine
                        ? 'relative max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm'
                        : 'relative max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    }
                    style={isMine ? { backgroundColor: accent, color: '#fff' } : undefined}
                  >
                    {roleLabel ? (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                        {roleLabel}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{msg.body}</p>
                    <p
                      className={`mt-1 text-[10px] tabular-nums ${
                        isMine ? 'text-white/70' : 'text-slate-400'
                      }`}
                    >
                      {formatTime(msg.created_at)}
                    </p>
                    {!isMine ? (
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 hidden rounded-full bg-white p-1 text-slate-400 shadow group-hover:block dark:bg-slate-700"
                        aria-label="Report message"
                        onClick={() => void reportMessage(msg.id, 'Reported from chat')}
                      >
                        <Flag className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
          {error ? (
            <p className="text-center text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {enabled && quickReplies.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            {quickReplies.map((q) => (
              <button
                key={q.key}
                type="button"
                disabled={sending}
                onClick={() => void handleSend(q.label, q.key)}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {q.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={enabled ? 'Type a message…' : 'Chat unavailable'}
              disabled={!enabled || sending}
              rows={1}
              className="min-h-[44px] max-h-28 flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 outline-none focus:ring-2 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              style={{ ['--tw-ring-color' as string]: accent }}
              aria-label="Message"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!enabled || sending || !draft.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: accent }}
              aria-label="Send message"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Send className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
