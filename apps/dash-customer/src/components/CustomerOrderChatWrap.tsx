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
  courierId?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  peerLabel?: string;
  pair?: OrderChatPair;
  children?: (openChat: () => void, ctx: RushChatContext) => React.ReactNode;
};

/** Customer ↔ courier (default) or customer ↔ merchant chat on tracking surfaces. */
export function CustomerOrderChatWrap({
  orderId,
  status,
  courierId,
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
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
    (pair === 'customer_merchant' ? 'Restaurant' : 'Your courier');

  const defaultChildren = (openChat: () => void, ctx: RushChatContext) => (
    <button
      type="button"
      onClick={openChat}
      className="relative inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow"
      aria-label="Open chat"
    >
      <span className="relative">
        <MessageCircle className="h-5 w-5" aria-hidden />
        <RushChatUnreadDot show={ctx.unreadCount > 0} className="-right-0.5 -top-0.5" />
      </span>
      Message
    </button>
  );

  return (
    <RushChatHost
      orderId={orderId}
      pair={pair}
      order={order}
      currentUserId={currentUserId}
      peerLabel={label}
      variant="customer"
      api={chatApi}
      supabase={supabase}
    >
      {children ?? defaultChildren}
    </RushChatHost>
  );
}
