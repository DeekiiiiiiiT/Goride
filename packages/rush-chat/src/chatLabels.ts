import type {
  OrderChatParticipantsDto,
  OrderChatSenderRole,
  OrderChatViewerRole,
  OrderMessageDto,
} from '@roam/types/orderChat';

export function messageSenderLabel(
  msg: Pick<OrderMessageDto, 'sender_role' | 'sender_user_id'>,
  viewerRole: OrderChatViewerRole | null | undefined,
  participants: OrderChatParticipantsDto,
  currentUserId: string | null | undefined,
): string | null {
  if (currentUserId && msg.sender_user_id === currentUserId) return null;
  const role: OrderChatSenderRole = msg.sender_role;
  if (role === 'system') return 'System';
  if (role === 'support') return 'Roam Support';
  if (role === 'courier') return participants.courier.label || 'Courier';
  if (role === 'merchant') return participants.merchant.label || 'Restaurant';
  if (role === 'customer') return participants.customer.label || 'Customer';
  return viewerRole ? null : null;
}
