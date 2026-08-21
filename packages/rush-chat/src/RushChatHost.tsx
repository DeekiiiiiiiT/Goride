import React, { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  isOrderChatEnabled,
  isOrderChatPreAssignment,
  type OrderChatPair,
  type OrderChatWindowInput,
} from '@roam/types/orderChat';
import type { SupabaseClient } from '@supabase/supabase-js';
import { playChatPing, vibrateChatAlert } from './playChatPing';
import { RushChatSheet } from './RushChatSheet';
import type { RushChatApi, RushChatContext, RushChatVariant } from './types';
import { useRushChat } from './useRushChat';

type Props = {
  orderId: string;
  pair: OrderChatPair;
  order: OrderChatWindowInput;
  currentUserId: string | null | undefined;
  peerLabel: string;
  variant: RushChatVariant;
  api: RushChatApi;
  supabase: SupabaseClient;
  /** When false, pair feature flag is off client-side. */
  pairFeatureEnabled?: boolean;
  children: (openChat: () => void, ctx: RushChatContext) => React.ReactNode;
};

function previewBody(body: string, max = 48): string {
  const t = body.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function RushChatHost({
  orderId,
  pair,
  order,
  currentUserId,
  peerLabel,
  variant,
  api,
  supabase,
  pairFeatureEnabled = true,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const windowOpen = pairFeatureEnabled && isOrderChatEnabled(pair, order);
  const preAssign = isOrderChatPreAssignment(pair, order);
  const enabled = windowOpen;
  const lastAlertAtRef = useRef(0);

  const onPeerMessage = useCallback(
    (msg: { body: string }) => {
      const now = Date.now();
      if (now - lastAlertAtRef.current < 4000) return;
      lastAlertAtRef.current = now;
      playChatPing(variant === 'courier' ? 0.22 : 0.38);
      vibrateChatAlert();
      if (variant !== 'courier') {
        toast.message(peerLabel, {
          description: previewBody(msg.body),
          duration: 3500,
        });
      }
    },
    [peerLabel, variant],
  );

  const chat = useRushChat({
    orderId,
    pair,
    enabled: enabled || open,
    open,
    currentUserId,
    courierUserId: order.courierId,
    api,
    supabase,
    onPeerMessage,
  });

  const openChat = () => {
    if (!pairFeatureEnabled) {
      toast.message('Chat unavailable', {
        description: 'Messaging is not enabled yet.',
      });
      return;
    }
    if (preAssign) {
      toast.message('Chat unavailable', {
        description: 'A courier will be assigned soon.',
      });
      return;
    }
    if (!windowOpen) {
      toast.message('Chat unavailable', {
        description: 'Messaging is only available during the active delivery window.',
      });
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {children(openChat, { unreadCount: chat.unreadCount })}
      <RushChatSheet
        open={open}
        onOpenChange={setOpen}
        peerLabel={peerLabel}
        variant={variant}
        pair={pair}
        enabled={enabled}
        currentUserId={currentUserId}
        chat={chat}
        participants={chat.participants}
        viewerRole={chat.viewerRole}
      />
    </>
  );
}
