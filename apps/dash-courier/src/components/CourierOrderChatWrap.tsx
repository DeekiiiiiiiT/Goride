import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import {
  RushChatHost,
  RushChatUnreadDot,
  createOrderChatApi,
  type RushChatContext,
} from '@roam/rush-chat';
import type { OrderChatPair } from '@roam/types/orderChat';
import { supabase } from '@/lib/supabase';

const chatApi = createOrderChatApi(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? { access_token: session.access_token } : null;
});

type Props = {
  orderId: string;
  status: string;
  courierUserId: string;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  peerLabel?: string;
  pair?: OrderChatPair;
  children?: (openChat: () => void, ctx: RushChatContext) => React.ReactNode;
};

export function CourierOrderChatWrap({
  orderId,
  status,
  courierUserId,
  pickedUpAt,
  deliveredAt,
  peerLabel,
  pair = 'customer_courier',
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
      courierId: courierUserId,
      pickedUpAt: pickedUpAt ?? null,
      deliveredAt: deliveredAt ?? null,
    }),
    [status, courierUserId, pickedUpAt, deliveredAt],
  );

  const label =
    peerLabel ??
    (pair === 'merchant_courier' ? 'Restaurant' : 'Customer');

  const defaultChildren = (openChat: () => void, ctx: RushChatContext) => (
    <button
      type="button"
      onClick={openChat}
      className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary text-on-primary shadow"
      aria-label="Open chat"
    >
      <MessageCircle className="h-5 w-5" aria-hidden />
      <RushChatUnreadDot show={ctx.unreadCount > 0} className="right-1 top-1" />
    </button>
  );

  return (
    <RushChatHost
      orderId={orderId}
      pair={pair}
      order={order}
      currentUserId={currentUserId}
      peerLabel={label}
      variant="courier"
      api={chatApi}
      supabase={supabase}
    >
      {children ?? defaultChildren}
    </RushChatHost>
  );
}
