import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  OrderChatPair,
  OrderChatParticipantsDto,
  OrderChatViewerRole,
  OrderMessageDto,
} from '@roam/types/orderChat';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrderChatLastReadId, setOrderChatLastReadId } from './orderChatStorage';
import type { RushChatApi } from './types';

const POLL_OPEN_MS = 2500;
const POLL_BG_MS = 5000;

function mergeMessage(list: OrderMessageDto[], incoming: OrderMessageDto): OrderMessageDto[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

function isRealtimeSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('schema must be one of') || msg.includes('Invalid schema');
}

function countUnreadFromPeer(
  messages: OrderMessageDto[],
  currentUserId: string | null | undefined,
  lastReadId: string | null,
): number {
  if (!currentUserId || messages.length === 0) return 0;
  const lastIdx = lastReadId ? messages.findIndex((m) => m.id === lastReadId) : -1;
  const after = lastIdx >= 0 ? messages.slice(lastIdx + 1) : messages;
  return after.filter(
    (m) => m.sender_user_id !== currentUserId && m.sender_role !== 'system',
  ).length;
}

export type UseRushChatResult = {
  messages: OrderMessageDto[];
  participants: OrderChatParticipantsDto | null;
  viewerRole: OrderChatViewerRole | null;
  chatOpen: boolean;
  loading: boolean;
  sending: boolean;
  error: string | null;
  unreadCount: number;
  send: (body: string, quickReplyKey?: string) => Promise<boolean>;
  reportMessage: (messageId: string, reason?: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

export function useRushChat(opts: {
  orderId: string;
  pair: OrderChatPair;
  enabled: boolean;
  open: boolean;
  currentUserId: string | null | undefined;
  courierUserId?: string | null;
  api: RushChatApi;
  supabase: SupabaseClient;
  onPeerMessage?: (message: OrderMessageDto) => void;
}): UseRushChatResult {
  const {
    orderId,
    pair,
    enabled,
    open,
    currentUserId,
    courierUserId,
    api,
    supabase,
    onPeerMessage,
  } = opts;
  const [messages, setMessages] = useState<OrderMessageDto[]>([]);
  const [participants, setParticipants] = useState<OrderChatParticipantsDto | null>(null);
  const [viewerRole, setViewerRole] = useState<OrderChatViewerRole | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollOnlyRef = useRef(false);
  const lastReadIdRef = useRef<string | null>(null);
  const onPeerMessageRef = useRef(onPeerMessage);
  onPeerMessageRef.current = onPeerMessage;

  const syncUnread = useCallback(
    (list: OrderMessageDto[]) => {
      const lastRead =
        lastReadIdRef.current ?? getOrderChatLastReadId(orderId, pair, courierUserId);
      lastReadIdRef.current = lastRead;
      setUnreadCount(countUnreadFromPeer(list, currentUserId, lastRead));
    },
    [currentUserId, orderId, pair, courierUserId],
  );

  const markRead = useCallback(
    (list: OrderMessageDto[]) => {
      const last = list[list.length - 1];
      if (!last) {
        setUnreadCount(0);
        return;
      }
      lastReadIdRef.current = last.id;
      setOrderChatLastReadId(orderId, pair, last.id, courierUserId);
      setUnreadCount(0);
    },
    [orderId, pair, courierUserId],
  );

  const handleIncoming = useCallback(
    (row: OrderMessageDto, notify: boolean) => {
      if (row.pair && row.pair !== pair) return;
      if (
        courierUserId &&
        row.courier_user_id &&
        row.courier_user_id !== courierUserId &&
        (pair === 'customer_courier' || pair === 'merchant_courier')
      ) {
        return;
      }
      setMessages((prev) => {
        const next = mergeMessage(prev, row);
        if (open) {
          markRead(next);
        } else if (currentUserId && row.sender_user_id !== currentUserId) {
          syncUnread(next);
          if (notify) onPeerMessageRef.current?.(row);
        }
        return next;
      });
    },
    [open, currentUserId, markRead, syncUnread, pair, courierUserId],
  );

  const refresh = useCallback(
    async (refreshOpts?: { silent?: boolean }) => {
      if (!orderId || !enabled) return;
      const silent = refreshOpts?.silent === true;
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const res = await api.listMessages(orderId, pair, { limit: 50 });
        setMessages(res.messages);
        if (res.participants) setParticipants(res.participants);
        if (res.viewer_role) setViewerRole(res.viewer_role);
        setChatOpen(Boolean(res.chat_open));
        if (open) {
          markRead(res.messages);
        } else {
          syncUnread(res.messages);
        }
      } catch (e: unknown) {
        if (!silent) {
          setError(e instanceof Error ? e.message : 'Could not load messages');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [api, enabled, orderId, pair, open, markRead, syncUnread],
  );

  useEffect(() => {
    if (!enabled || !orderId) return;
    lastReadIdRef.current = getOrderChatLastReadId(orderId, pair, courierUserId);
    pollOnlyRef.current = false;
    void refresh();
  }, [enabled, orderId, pair, courierUserId, refresh]);

  useEffect(() => {
    if (open && messages.length > 0) markRead(messages);
  }, [open, messages, markRead]);

  useEffect(() => {
    if (!enabled || !orderId || open) return;
    const t = setInterval(() => {
      void refresh({ silent: true });
    }, POLL_BG_MS);
    return () => clearInterval(t);
  }, [enabled, orderId, open, refresh]);

  useEffect(() => {
    if (!enabled || !orderId) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer != null) return;
      pollOnlyRef.current = true;
      pollTimer = setInterval(() => {
        void refresh({ silent: true });
      }, POLL_OPEN_MS);
    };

    const channel = supabase
      .channel(`order-chat-${orderId}-${pair}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_messages',
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const row = payload.new as OrderMessageDto | null;
          if (row?.id) handleIncoming(row, true);
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
          if (!isRealtimeSchemaError(err)) {
            console.warn('order chat realtime unavailable, using polling', err);
          }
          startPolling();
        }
      });

    if (pollOnlyRef.current) startPolling();

    return () => {
      if (pollTimer != null) clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, orderId, pair, supabase, refresh, handleIncoming]);

  const send = useCallback(
    async (body: string, quickReplyKey?: string) => {
      const trimmed = body.trim();
      if (!trimmed || !orderId || !enabled) return false;
      setSending(true);
      setError(null);
      try {
        const res = await api.sendMessage(orderId, {
          body: trimmed,
          pair,
          quick_reply_key: quickReplyKey,
        });
        handleIncoming(res.message, false);
        if (pollOnlyRef.current) void refresh();
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not send message');
        return false;
      } finally {
        setSending(false);
      }
    },
    [api, enabled, orderId, pair, refresh, handleIncoming],
  );

  const reportMessage = useCallback(
    async (messageId: string, reason?: string) => {
      if (!api.reportMessage) return false;
      try {
        await api.reportMessage(orderId, messageId, reason);
        return true;
      } catch {
        return false;
      }
    },
    [api, orderId],
  );

  return {
    messages,
    participants,
    viewerRole,
    chatOpen,
    loading,
    sending,
    error,
    unreadCount,
    send,
    reportMessage,
    refresh,
  };
}
