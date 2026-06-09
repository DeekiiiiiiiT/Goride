import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RideChatParticipantsDto,
  RideChatViewerRole,
  RideMessageDto,
} from '@roam/types/rides';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRideChatLastReadId, setRideChatLastReadId } from './rideChatStorage';
import type { RideChatApi } from './types';

const POLL_OPEN_MS = 2500;
const POLL_BG_MS = 5000;

function mergeMessage(list: RideMessageDto[], incoming: RideMessageDto): RideMessageDto[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

function isRealtimeSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('schema must be one of') || msg.includes('Invalid schema');
}

function countUnreadFromPeer(
  messages: RideMessageDto[],
  currentUserId: string | null | undefined,
  lastReadId: string | null,
): number {
  if (!currentUserId || messages.length === 0) return 0;
  const lastIdx = lastReadId ? messages.findIndex((m) => m.id === lastReadId) : -1;
  const after = lastIdx >= 0 ? messages.slice(lastIdx + 1) : messages;
  return after.filter((m) => m.sender_user_id !== currentUserId).length;
}

export type UseRideChatResult = {
  messages: RideMessageDto[];
  participants: RideChatParticipantsDto | null;
  viewerRole: RideChatViewerRole | null;
  loading: boolean;
  sending: boolean;
  error: string | null;
  unreadCount: number;
  send: (body: string) => Promise<boolean>;
  refresh: () => Promise<void>;
};

export function useRideChat(opts: {
  rideId: string;
  enabled: boolean;
  open: boolean;
  currentUserId: string | null | undefined;
  api: RideChatApi;
  supabase: SupabaseClient;
  onPeerMessage?: (message: RideMessageDto) => void;
}): UseRideChatResult {
  const { rideId, enabled, open, currentUserId, api, supabase, onPeerMessage } = opts;
  const [messages, setMessages] = useState<RideMessageDto[]>([]);
  const [participants, setParticipants] = useState<RideChatParticipantsDto | null>(null);
  const [viewerRole, setViewerRole] = useState<RideChatViewerRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollOnlyRef = useRef(false);
  const lastReadIdRef = useRef<string | null>(null);
  const onPeerMessageRef = useRef(onPeerMessage);
  onPeerMessageRef.current = onPeerMessage;

  const syncUnread = useCallback(
    (list: RideMessageDto[]) => {
      const lastRead = lastReadIdRef.current ?? getRideChatLastReadId(rideId);
      lastReadIdRef.current = lastRead;
      setUnreadCount(countUnreadFromPeer(list, currentUserId, lastRead));
    },
    [currentUserId, rideId],
  );

  const markRead = useCallback(
    (list: RideMessageDto[]) => {
      const last = list[list.length - 1];
      if (!last) {
        setUnreadCount(0);
        return;
      }
      lastReadIdRef.current = last.id;
      setRideChatLastReadId(rideId, last.id);
      setUnreadCount(0);
    },
    [rideId],
  );

  const handleIncoming = useCallback(
    (row: RideMessageDto, notify: boolean) => {
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
    [open, currentUserId, markRead, syncUnread],
  );

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!rideId || !enabled) return;
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const res = await api.listMessages(rideId, { limit: 50 });
        setMessages(res.messages);
        if (res.participants) setParticipants(res.participants);
        if (res.viewer_role) setViewerRole(res.viewer_role);
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
    [api, enabled, rideId, open, markRead, syncUnread],
  );

  useEffect(() => {
    if (!enabled || !rideId) return;
    lastReadIdRef.current = getRideChatLastReadId(rideId);
    pollOnlyRef.current = false;
    void refresh();
  }, [enabled, rideId, refresh]);

  useEffect(() => {
    if (open && messages.length > 0) markRead(messages);
  }, [open, messages, markRead]);

  useEffect(() => {
    if (!enabled || !rideId || open) return;
    const t = setInterval(() => {
      void refresh({ silent: true });
    }, POLL_BG_MS);
    return () => clearInterval(t);
  }, [enabled, rideId, open, refresh]);

  useEffect(() => {
    if (!enabled || !rideId) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer != null) return;
      pollOnlyRef.current = true;
      pollTimer = setInterval(() => {
        void refresh({ silent: true });
      }, POLL_OPEN_MS);
    };

    const channel = supabase
      .channel(`ride-chat-${rideId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_request_id=eq.${rideId}`,
        },
        (payload) => {
          const row = payload.new as RideMessageDto | null;
          if (row?.id) handleIncoming(row, true);
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
          if (!isRealtimeSchemaError(err)) {
            console.warn('ride chat realtime unavailable, using polling', err);
          }
          startPolling();
        }
      });

    if (pollOnlyRef.current) startPolling();

    return () => {
      if (pollTimer != null) clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, rideId, supabase, refresh, handleIncoming]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !rideId || !enabled) return false;
      setSending(true);
      setError(null);
      try {
        const res = await api.sendMessage(rideId, { body: trimmed });
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
    [api, enabled, rideId, refresh, handleIncoming],
  );

  return {
    messages,
    participants,
    viewerRole,
    loading,
    sending,
    error,
    unreadCount,
    send,
    refresh,
  };
}
