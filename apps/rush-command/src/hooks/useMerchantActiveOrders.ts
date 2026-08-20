import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/partner-supabase';
import {
  fetchMerchantActiveOrders,
  merchantOrdersKeys,
  type MerchantOrdersChannel,
} from '../lib/merchant-orders-query';
import { isStoreTabletContext } from '../lib/storeTabletUrl';
import { readDeviceSession } from '../lib/store-tablet-session';
import {
  logOrdersSyncDiagnostics,
  resolveOrdersRefetchInterval,
  type MerchantOrdersRealtimeStatus,
} from '../lib/merchant-orders-sync-policy';

interface UseMerchantActiveOrdersOptions {
  realtimeStatus: MerchantOrdersRealtimeStatus;
  isTabVisible: boolean;
  enabled?: boolean;
  /** Default roam-only fetch — omit channel until DB migration is applied. */
  channel?: MerchantOrdersChannel;
}

export function useMerchantActiveOrders({
  realtimeStatus,
  isTabVisible,
  enabled = true,
  channel,
}: UseMerchantActiveOrdersOptions) {
  const refetchInterval = resolveOrdersRefetchInterval({ realtimeStatus, isTabVisible });
  const prevIntervalRef = useRef(refetchInterval);

  useEffect(() => {
    if (prevIntervalRef.current !== refetchInterval) {
      logOrdersSyncDiagnostics('refetch interval changed', {
        from: prevIntervalRef.current,
        to: refetchInterval,
        realtimeStatus,
        isTabVisible,
      });
      prevIntervalRef.current = refetchInterval;
    }
  }, [refetchInterval, realtimeStatus, isTabVisible]);

  const query = useQuery({
    queryKey: merchantOrdersKeys.active(channel),
    queryFn: async () => {
      const device = isStoreTabletContext() ? readDeviceSession() : null;
      if (device) return fetchMerchantActiveOrders(null, channel);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      return fetchMerchantActiveOrders(session, channel);
    },
    enabled,
    refetchInterval,
    refetchIntervalInBackground: false,
  });

  return {
    orders: query.data?.orders ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    isInitialLoading: query.isLoading && !query.data,
  };
}
