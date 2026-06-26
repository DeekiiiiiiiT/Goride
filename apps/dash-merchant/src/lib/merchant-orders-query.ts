import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import type { Session } from '@supabase/supabase-js';
import type { Order } from '../types/order';
import { getStationAuthHeaders } from './partner-api';
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
  active: (channel: MerchantOrdersChannel = 'roam_app') =>
    ['merchant-orders', 'active', channel] as const,
  history: (status: MerchantOrdersHistoryStatus) =>
    ['merchant-orders', 'history', status] as const,
  order: (orderId: string) => ['order', orderId] as const,
};

export type MerchantOrdersChannel = 'roam_app' | 'in_store' | 'all';

export async function fetchMerchantActiveOrders(
  session?: Session | null,
  channel: MerchantOrdersChannel = 'roam_app',
): Promise<MerchantOrdersResponse> {
  const channelQuery = channel === 'all' ? 'channel=all' : `channel=${channel}`;
  const device = readDeviceSession();
  if (device) {
    const headers = await getStationAuthHeaders('');
    const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?${channelQuery}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  }
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?${channelQuery}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...supabaseAnonFunctionHeaders(),
    },
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export async function fetchMerchantHistoryOrders(
  session: Session,
  status: MerchantOrdersHistoryStatus,
): Promise<MerchantOrdersResponse> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?status=${status}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

export function invalidateAllMerchantOrders(
  queryClient: { invalidateQueries: (opts: { queryKey: readonly string[] }) => Promise<void> },
) {
  return queryClient.invalidateQueries({ queryKey: merchantOrdersKeys.all });
}
