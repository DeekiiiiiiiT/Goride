import type { OrderChatPair } from '@roam/types/orderChat';

const PREFIX = 'roam:order-chat:lastRead:';

export function orderChatLastReadKey(
  orderId: string,
  pair: OrderChatPair,
  courierUserId?: string | null,
): string {
  const courierPart = courierUserId ? `:${courierUserId}` : '';
  return `${PREFIX}${orderId}:${pair}${courierPart}`;
}

export function getOrderChatLastReadId(
  orderId: string,
  pair: OrderChatPair,
  courierUserId?: string | null,
): string | null {
  try {
    return sessionStorage.getItem(orderChatLastReadKey(orderId, pair, courierUserId));
  } catch {
    return null;
  }
}

export function setOrderChatLastReadId(
  orderId: string,
  pair: OrderChatPair,
  messageId: string,
  courierUserId?: string | null,
): void {
  try {
    sessionStorage.setItem(orderChatLastReadKey(orderId, pair, courierUserId), messageId);
  } catch {
    /* ignore */
  }
}
