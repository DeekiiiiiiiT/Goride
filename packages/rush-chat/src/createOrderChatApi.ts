import { API_ENDPOINTS } from '@roam/api-client';
import type {
  OrderChatPair,
  OrderMessagesResponse,
  SendOrderMessageBody,
  SendOrderMessageResponse,
} from '@roam/types/orderChat';
import type { RushChatApi } from '@roam/rush-chat';

type AuthSession = { access_token: string };

export function createOrderChatApi(
  getSession: () => Promise<AuthSession | null>,
): RushChatApi {
  async function authHeaders(): Promise<Record<string, string>> {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Sign in required');
    return {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  return {
    async listMessages(orderId, pair, opts) {
      const headers = await authHeaders();
      const qs = new URLSearchParams({ pair });
      if (opts?.limit) qs.set('limit', String(opts.limit));
      if (opts?.before) qs.set('before', opts.before);
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/orders/${encodeURIComponent(orderId)}/messages?${qs}`,
        { headers },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || body.error || 'Failed to load messages');
      return body as OrderMessagesResponse;
    },
    async sendMessage(orderId, body: SendOrderMessageBody) {
      const headers = await authHeaders();
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/orders/${encodeURIComponent(orderId)}/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || 'Failed to send');
      return json as SendOrderMessageResponse;
    },
    async reportMessage(orderId, messageId, reason) {
      const headers = await authHeaders();
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/orders/${encodeURIComponent(orderId)}/messages/${encodeURIComponent(messageId)}/report`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ reason }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || 'Failed to report');
      return { ok: true };
    },
    async reportProblem(orderId, details) {
      const headers = await authHeaders();
      const res = await fetch(
        `${API_ENDPOINTS.delivery}/orders/${encodeURIComponent(orderId)}/chat/report-problem`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ details }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || 'Failed to report');
      return { ok: true, case_id: json.case_id };
    },
  };
}

export type { OrderChatPair };
