import type {
  OrderChatPair,
  OrderMessagesResponse,
  SendOrderMessageBody,
  SendOrderMessageResponse,
  OrderMessageDto,
} from '@roam/types/orderChat';

export type RushChatApi = {
  listMessages: (
    orderId: string,
    pair: OrderChatPair,
    opts?: { limit?: number; before?: string },
  ) => Promise<OrderMessagesResponse>;
  sendMessage: (
    orderId: string,
    body: SendOrderMessageBody,
  ) => Promise<SendOrderMessageResponse>;
  reportMessage?: (
    orderId: string,
    messageId: string,
    reason?: string,
  ) => Promise<{ ok: boolean }>;
  reportProblem?: (
    orderId: string,
    details: string,
  ) => Promise<{ ok: boolean; case_id?: string }>;
};

export type RushChatVariant = 'customer' | 'courier' | 'merchant' | 'support';

export type RushChatContext = {
  unreadCount: number;
};

export type { OrderMessageDto };
