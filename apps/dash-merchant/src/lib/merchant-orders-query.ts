import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import type { Session } from '@supabase/supabase-js';
import { normalizeOrder, type Order } from '../types/order';

/**
 * Query key inventory (invalidation uses prefix ['merchant-orders']):
 * - active: OrdersPage, DashboardPage (shared active queue)
 * - history delivered/cancelled: OrdersPage, DashboardPage
 * - order detail: OrderDetailPage ['order', orderId]
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
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders${queryString}`, {
    headers: supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${session.access_token}`,
    }),
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return normalizeOrdersResponse(await res.json());
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
  return normalizeOrdersResponse(await res.json());
}

function normalizeOrdersResponse(data: MerchantOrdersResponse): MerchantOrdersResponse {
  return {
    ...data,
    orders: (data.orders ?? []).map((order) => normalizeOrder(order)),
  };
}

export async function fetchMerchantOrder(session: Session, orderId: string): Promise<Order> {
  const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders/${orderId}`, {
    headers: supabaseAnonFunctionHeaders({
      Authorization: `Bearer ${session.access_token}`,
    }),
  });
  if (!res.ok) throw new Error('Failed to fetch order');
  const data = await res.json();
  return normalizeOrder(data.order);
}
