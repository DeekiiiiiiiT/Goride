import { useCallback, useEffect, useRef, useState } from 'react';
import type { RideMessageDto } from '@roam/types/rides';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RideChatApi } from './types';

const POLL_MS = 2500;

function mergeMessage(list: RideMessageDto[], incoming: RideMessageDto): RideMessageDto[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
}

function isRealtimeSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg.includes('schema must be one of') || msg.includes('Invalid schema');
}

export function useRideChat(opts: {
  rideId: string;
  enabled: boolean;
  open: boolean;
  api: RideChatApi;
  supabase: SupabaseClient;
}) {
  const { rideId, enabled, open, api, supabase } = opts;
  const [messages, setMessages] = useState<RideMessageDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollOnlyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!rideId || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.listMessages(rideId, { limit: 50 });
      setMessages(res.messages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load messages');
    } finally {
      setLoading(false);
    }
  }, [api, enabled, rideId]);

  useEffect(() => {
    if (!open || !enabled || !rideId) return;
    pollOnlyRef.current = false;
    void refresh();
  }, [open, enabled, rideId, refresh]);

  useEffect(() => {
    if (!open || !enabled || !rideId) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer != null) return;
      pollOnlyRef.current = true;
      pollTimer = setInterval(() => {
        void refresh();
      }, POLL_MS);
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
          if (row?.id) {
            setMessages((prev) => mergeMessage(prev, row));
          }
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

    return () => {
      if (pollTimer != null) clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [open, enabled, rideId, supabase, refresh]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !rideId || !enabled) return false;
      setSending(true);
      setError(null);
      try {
        const res = await api.sendMessage(rideId, { body: trimmed });
        setMessages((prev) => mergeMessage(prev, res.message));
        if (pollOnlyRef.current) {
          void refresh();
        }
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not send message');
        return false;
      } finally {
        setSending(false);
      }
    },
    [api, enabled, rideId, refresh],
  );

  return { messages, loading, sending, error, send, refresh };
}
