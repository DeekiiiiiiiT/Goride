/**
 * Rush in-order chat types + client window helpers.
 * Keep window rules aligned with supabase/functions/delivery/orderChatAccess.ts
 */

import type { OrderStatus } from './delivery';

export type OrderChatPair =
  | 'customer_courier'
  | 'customer_merchant'
  | 'merchant_courier'
  | 'support';

export type OrderChatSenderRole =
  | 'customer'
  | 'merchant'
  | 'courier'
  | 'support'
  | 'system';

export type OrderChatViewerRole = 'customer' | 'merchant' | 'courier' | 'support';

export const ORDER_CHAT_GRACE_MINUTES: Record<OrderChatPair, number> = {
  customer_courier: 30,
  customer_merchant: 60,
  merchant_courier: 15,
  support: 0,
};

export const ORDER_CHAT_OPEN_STATUSES: Record<OrderChatPair, readonly OrderStatus[]> = {
  customer_courier: ['assigned', 'picked_up', 'in_transit', 'delivered'],
  customer_merchant: [
    'accepted',
    'preparing',
    'ready',
    'assigned',
    'picked_up',
    'in_transit',
    'delivered',
  ],
  merchant_courier: ['assigned', 'picked_up'],
  support: [],
};

export interface OrderMessageDto {
  id: string;
  order_id: string;
  pair: OrderChatPair;
  sender_user_id: string | null;
  sender_role: OrderChatSenderRole;
  body: string;
  quick_reply_key: string | null;
  courier_user_id: string | null;
  created_at: string;
}

export interface OrderChatParticipantDto {
  user_id: string | null;
  label: string;
}

export interface OrderChatParticipantsDto {
  customer: OrderChatParticipantDto;
  merchant: OrderChatParticipantDto;
  courier: OrderChatParticipantDto;
}

export interface OrderMessagesResponse {
  messages: OrderMessageDto[];
  participants?: OrderChatParticipantsDto;
  viewer_role?: OrderChatViewerRole;
  pair?: OrderChatPair;
  chat_open?: boolean;
}

export interface SendOrderMessageBody {
  body: string;
  pair: OrderChatPair;
  quick_reply_key?: string;
}

export interface SendOrderMessageResponse {
  message: OrderMessageDto;
}

export type OrderChatWindowInput = {
  status: OrderStatus | string;
  courierId?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
};

function addMinutesOpen(iso: string | null | undefined, minutes: number, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return now.getTime() <= t + minutes * 60_000;
}

/** Client UX gate — must match server assertOrderChatAccess windows. */
export function isOrderChatEnabled(
  pair: OrderChatPair,
  order: OrderChatWindowInput,
  now: Date = new Date(),
): boolean {
  if (pair === 'support') return true;
  const status = String(order.status ?? '');
  if (status === 'cancelled') return false;
  const grace = ORDER_CHAT_GRACE_MINUTES[pair];

  if (pair === 'customer_courier') {
    if (['assigned', 'picked_up', 'in_transit'].includes(status)) return true;
    if (status === 'delivered' || status === 'completed') {
      return addMinutesOpen(order.deliveredAt, grace, now);
    }
    return false;
  }

  if (pair === 'customer_merchant') {
    if (
      ['accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'in_transit'].includes(status)
    ) {
      return true;
    }
    if (status === 'delivered' || status === 'completed') {
      return addMinutesOpen(order.deliveredAt, grace, now);
    }
    return false;
  }

  if (pair === 'merchant_courier') {
    if (status === 'assigned') return true;
    if (['picked_up', 'in_transit', 'delivered', 'completed'].includes(status)) {
      return addMinutesOpen(order.pickedUpAt, grace, now);
    }
    return false;
  }

  return false;
}

export function isOrderChatPreAssignment(
  pair: OrderChatPair,
  order: OrderChatWindowInput,
): boolean {
  if (pair !== 'customer_courier' && pair !== 'merchant_courier') return false;
  const status = String(order.status ?? '');
  return ['placed', 'accepted', 'preparing', 'ready'].includes(status) && !order.courierId;
}

/** Canned quick replies per pair — keys stored as quick_reply_key. */
export const ORDER_CHAT_QUICK_REPLIES: Record<
  Exclude<OrderChatPair, 'support'>,
  ReadonlyArray<{ key: string; label: string }>
> = {
  customer_courier: [
    { key: 'cc.outside', label: "I'm outside" },
    { key: 'cc.gate', label: 'Gate / building access note' },
    { key: 'cc.leave_door', label: 'Leave at door' },
    { key: 'cc.where_meet', label: 'Where should I meet you?' },
  ],
  merchant_courier: [
    { key: 'mc.ready', label: 'Order ready' },
    { key: 'mc.here', label: "I'm here" },
    { key: 'mc.wrong_bag', label: 'Wrong bag / missing item' },
    { key: 'mc.not_ready', label: 'Not ready yet' },
  ],
  customer_merchant: [
    { key: 'cm.how_long', label: 'How much longer?' },
    { key: 'cm.sub_ok', label: 'Substitute OK?' },
    { key: 'cm.unavailable', label: 'Item unavailable — options?' },
    { key: 'cm.missing', label: 'Something missing from my order' },
  ],
};
