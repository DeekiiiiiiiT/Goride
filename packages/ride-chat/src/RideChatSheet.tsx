import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Send, X } from 'lucide-react';
import { useRideChat } from './useRideChat';
import type { RideChatSheetProps } from './types';

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

export function RideChatSheet({
  open,
  onOpenChange,
  rideId,
  enabled,
  currentUserId,
  peerLabel,
  variant,
  api,
  supabase,
}: RideChatSheetProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, loading, sending, error, send } = useRideChat({
    rideId,
    enabled,
    open,
    api,
    supabase,
  });

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

  const handleSend = async () => {
    const ok = await send(draft);
    if (ok) setDraft('');
  };

  const isRiderTheme = variant === 'rider';
  const accent = isRiderTheme ? '#004ac6' : '#10b981';
  const mineBg = isRiderTheme ? '#004ac6' : '#10b981';
  const mineText = '#ffffff';

  if (!open) return null;

  const isDriver = variant === 'driver';

  return createPortal(
    <div className="ride-chat-portal" role="presentation">
      <button
        type="button"
        className="fixed inset-0 z-[300] bg-black/50"
        aria-label="Close chat"
        onClick={() => onOpenChange(false)}
      />
      <div
        className="fixed inset-x-0 z-[310] mx-auto flex w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        style={{
          bottom: isDriver ? 'var(--driver-bottom-nav-total, 0px)' : 0,
          maxHeight: isDriver
            ? 'min(78dvh, calc(100dvh - var(--driver-bottom-nav-total, 4rem) - 1rem))'
            : 'min(85dvh, 640px)',
          height: isDriver
            ? 'min(78dvh, calc(100dvh - var(--driver-bottom-nav-total, 4rem) - 1rem))'
            : 'min(85dvh, 640px)',
        }}
        role="dialog"
        aria-labelledby="ride-chat-title"
        aria-modal="true"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="ride-chat-title" className="text-lg font-semibold text-slate-900 dark:text-white">
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
            <p className="py-8 text-center text-sm text-slate-500">Chat is not available for this trip.</p>
          ) : loading && messages.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
            </div>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Send a message to coordinate pickup or drop-off.
            </p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_user_id === currentUserId;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={
                      isMine
                        ? 'max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm'
                        : 'max-w-[85%] rounded-2xl bg-white px-4 py-2.5 text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                    }
                    style={isMine ? { backgroundColor: mineBg, color: mineText } : undefined}
                  >
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{msg.body}</p>
                    <p
                      className={`mt-1 text-[10px] tabular-nums ${
                        isMine ? 'text-white/70' : 'text-slate-400'
                      }`}
                    >
                      {formatTime(msg.created_at)}
                    </p>
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
