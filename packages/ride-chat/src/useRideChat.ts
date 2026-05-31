import { useCallback, useEffect, useRef, useState } from 'react';
import type { RideMessageDto } from '@roam/types/rides';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RideChatApi } from './types';

function mergeMessage(list: RideMessageDto[], incoming: RideMessageDto): RideMessageDto[] {
  if (list.some((m) => m.id === incoming.id)) return list;
  return [...list, incoming];
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
    void refresh();
  }, [open, enabled, rideId, refresh]);

  useEffect(() => {
    if (!open || !enabled || !rideId) return;

    const channel = supabase
      .channel(`ride-chat-${rideId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'rides',
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [open, enabled, rideId, supabase]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !rideId || !enabled) return false;
      setSending(true);
      setError(null);
      try {
        const res = await api.sendMessage(rideId, { body: trimmed });
        setMessages((prev) => mergeMessage(prev, res.message));
        return true;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Could not send message');
        return false;
      } finally {
        setSending(false);
      }
    },
    [api, enabled, rideId],
  );

  return { messages, loading, sending, error, send, refresh };
}
