export type MerchantOrdersRealtimeStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

/** Safety refetch when realtime is healthy (2 minutes). */
export const REALTIME_CONNECTED_HEARTBEAT_MS = 120_000;

/** Aggressive fallback when realtime is down (15 seconds). */
export const REALTIME_DISCONNECTED_POLL_MS = 15_000;

/** Pause polling when the browser tab is hidden. */
export const TAB_HIDDEN_POLL_MS = false as const;

export interface ResolveOrdersRefetchIntervalInput {
  realtimeStatus: MerchantOrdersRealtimeStatus;
  isTabVisible: boolean;
}

export function resolveOrdersRefetchInterval({
  realtimeStatus,
  isTabVisible,
}: ResolveOrdersRefetchIntervalInput): number | false {
  if (!isTabVisible) {
    return TAB_HIDDEN_POLL_MS;
  }

  if (realtimeStatus === 'connected') {
    return REALTIME_CONNECTED_HEARTBEAT_MS;
  }

  return REALTIME_DISCONNECTED_POLL_MS;
}

export function logOrdersSyncDiagnostics(
  message: string,
  payload?: Record<string, unknown>,
) {
  if (!import.meta.env.DEV) return;
  if (payload) {
    console.debug(`[merchant-orders-sync] ${message}`, payload);
  } else {
    console.debug(`[merchant-orders-sync] ${message}`);
  }
}
