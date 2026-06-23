import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@roam/auth-client';
import { merchantOrdersKeys } from '../lib/merchant-orders-query';
import {
  logOrdersSyncDiagnostics,
  type MerchantOrdersRealtimeStatus,
} from '../lib/merchant-orders-sync-policy';

interface UseMerchantOrdersRealtimeOptions {
  merchantId: string;
  enabled?: boolean;
  onInsert?: (payload: { new: Record<string, unknown> }) => void;
  onUpdate?: (payload: { new: Record<string, unknown> }) => void;
}

export function useMerchantOrdersRealtime({
  merchantId,
  enabled = true,
  onInsert,
  onUpdate,
}: UseMerchantOrdersRealtimeOptions) {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] =
    useState<MerchantOrdersRealtimeStatus>('connecting');
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
  }, [onInsert, onUpdate]);

  useEffect(() => {
    if (!enabled || !merchantId) return;

    setRealtimeStatus('connecting');
    logOrdersSyncDiagnostics('subscribing to merchant orders channel', { merchantId });

    const channel = supabase
      .channel(`merchant-orders-${merchantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'delivery',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
          onInsertRef.current?.(payload);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'delivery',
          table: 'orders',
          filter: `merchant_id=eq.${merchantId}`,
        },
        (payload) => {
          void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
          onUpdateRef.current?.(payload);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          logOrdersSyncDiagnostics('realtime connected', { merchantId });
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setRealtimeStatus(status === 'CHANNEL_ERROR' ? 'error' : 'disconnected');
          logOrdersSyncDiagnostics('realtime disconnected', { merchantId, status });
        }
      });

    return () => {
      logOrdersSyncDiagnostics('removing merchant orders channel', { merchantId });
      void supabase.removeChannel(channel);
    };
  }, [enabled, merchantId, queryClient]);

  return { realtimeStatus };
}

interface UseOrderDetailRealtimeOptions {
  orderId: string;
  enabled?: boolean;
}

export function useOrderDetailRealtime({ orderId, enabled = true }: UseOrderDetailRealtimeOptions) {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] =
    useState<MerchantOrdersRealtimeStatus>('connecting');

  useEffect(() => {
    if (!enabled || !orderId) return;

    setRealtimeStatus('connecting');

    const channel = supabase
      .channel(`merchant-order-detail-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'delivery',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.order(orderId) });
          void queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setRealtimeStatus(status === 'CHANNEL_ERROR' ? 'error' : 'disconnected');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, orderId, queryClient]);

  return { realtimeStatus };
}
