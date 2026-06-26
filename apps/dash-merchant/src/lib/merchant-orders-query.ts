import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import type { Session } from '@supabase/supabase-js';
import type { Order } from '../types/order';
import { getStationAuthHeaders } from './partner-api';
import { isStoreTabletContext } from './storeTabletUrl';
import { readDeviceSession } from './store-tablet-session';

/**
 * Query key inventory (invalidation uses prefix ['merchant-orders']):
 * - active: OrdersPage, DashboardPage (shared active queue)
 * - history delivered/cancelled: OrdersPage, DashboardPage
 * - order detail: OrderDetailPage ['order', orderId]
 * Legacy removed: merchant-orders-all, merchant-orders + filter tab
 */
export type MerchantOrdersHistoryStatus = 'delivered' | 'cancelled';

export interface MerchantOrdersResponse {
  orders: Order[];
}

export const merchantOrdersKeys = {
  all: ['merchant-orders'] as const,
  active: (channel?: MerchantOrdersChannel) =>
    ['merchant-orders', 'active', channel ?? 'legacy'] as const,
  history: (status: MerchantOrdersHistoryStatus) =>
    ['merchant-orders', 'history', status] as const,
  order: (orderId: string) => ['order', orderId] as const,
};

export type MerchantOrdersChannel = 'roam_app' | 'in_store' | 'all';

/** Omit channel for legacy API (pre-migration). Pass explicitly when restaurant mgmt is enabled. */
export async function fetchMerchantActiveOrders(
  session?: Session | null,
  channel?: MerchantOrdersChannel,
): Promise<MerchantOrdersResponse> {
  const channelQuery =
    channel === 'all'
      ? 'channel=all'
      : channel && channel !== 'roam_app'
        ? `channel=${channel}`
        : channel === 'roam_app'
          ? 'channel=roam_app'
          : '';
  const queryString = channelQuery ? `?${channelQuery}` : '';
  const device = isStoreTabletContext() ? readDeviceSession() : null;
  if (device) {
    const headers = await getStationAuthHeaders('');
    const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders${queryString}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  }
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders${queryString}`, {
    headers: supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${session.access_token}`,
    }),
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function fetchMerchantHistoryOrders(
  session: Session,
  status: MerchantOrdersHistoryStatus,
): Promise<MerchantOrdersResponse> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?status=${status}`, {
    headers: supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${session.access_token}`,
    }),
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export function invalidateAllMerchantOrders(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly string[] }) => Promise<void> },
) {
  return queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
}
