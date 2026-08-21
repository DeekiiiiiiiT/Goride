import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  RushChatHost,
  RushChatUnreadDot,
  createOrderChatApi,
  type RushChatContext,
} from '@roam/rush-chat';
import type { OrderChatPair } from '@roam/types/orderChat';
import { supabase } from '../lib/partner-supabase';

const chatApi = createOrderChatApi(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { access_token: session.access_token } : null;
});

type Props = {
  orderId: string;
  status: string;
  courierId?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  pair: OrderChatPair;
  peerLabel?: string;
  children?: (openChat: () => void, ctx: RushChatContext) => React.ReactNode;
};

export function MerchantOrderChatWrap({
  orderId,
  status,
  courierId,
  pickedUpAt,
  deliveredAt,
  pair,
  peerLabel,
  children,
}: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  const order = useMemo(
    () => ({
      status,
      courierId: courierId ?? null,
      pickedUpAt: pickedUpAt ?? null,
      deliveredAt: deliveredAt ?? null,
    }),
    [status, courierId, pickedUpAt, deliveredAt],
  );

  const label =
    peerLabel ??
    (pair === 'merchant_courier' ? 'Courier' : 'Customer');

  const defaultChildren = (openChat: () => void, ctx: RushChatContext) => (
    <button
      type="button"
      onClick={openChat}
      className="relative inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium"
      aria-label="Open chat"
    >
      <span className="relative">
        <MessageCircle className="h-4 w-4" aria-hidden />
        <RushChatUnreadDot show={ctx.unreadCount > 0} className="-right-1 -top-1" />
      </span>
      Chat with {label}
    </button>
  );

  return (
    <RushChatHost
      orderId={orderId}
      pair={pair}
      order={order}
      currentUserId={currentUserId}
      peerLabel={label}
      variant="merchant"
      api={chatApi}
      supabase={supabase}
    >
      {children ?? defaultChildren}
    </RushChatHost>
  );
}
