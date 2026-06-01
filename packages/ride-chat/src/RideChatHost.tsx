import React, { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { isRideChatEnabled } from '@roam/types/rides';
import type { RideRequestStatus } from '@roam/types/rides';
import type { SupabaseClient } from '@supabase/supabase-js';
import { playChatPing, vibrateChatAlert } from './playChatPing';
import { RideChatSheet } from './RideChatSheet';
import type { RideChatApi, RideChatContext, RideChatVariant } from './types';
import { useRideChat } from './useRideChat';

type Props = {
  rideId: string;
  rideStatus: RideRequestStatus | string;
  currentUserId: string | null | undefined;
  peerLabel: string;
  variant: RideChatVariant;
  api: RideChatApi;
  supabase: SupabaseClient;
  children: (openChat: () => void, ctx: RideChatContext) => React.ReactNode;
};

function previewBody(body: string, max = 48): string {
  const t = body.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Wraps trip UI with shared chat sheet, unread state, and light incoming alerts. */
export function RideChatHost({
  rideId,
  rideStatus,
  currentUserId,
  peerLabel,
  variant,
  api,
  supabase,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const enabled = isRideChatEnabled(rideStatus);
  const lastAlertAtRef = useRef(0);
  const isDriver = variant === 'driver';

  const onPeerMessage = useCallback(
    (msg: { body: string }) => {
      const now = Date.now();
      if (now - lastAlertAtRef.current < 4000) return;
      lastAlertAtRef.current = now;

      playChatPing(isDriver ? 0.22 : 0.38);
      vibrateChatAlert();

      // Rider: short in-app toast. Driver: badge + tone only (no popup while driving).
      if (!isDriver) {
        toast.message(peerLabel, {
          description: previewBody(msg.body),
          duration: 3500,
        });
      }
    },
    [isDriver, peerLabel],
  );

  const chat = useRideChat({
    rideId,
    enabled,
    open,
    currentUserId,
    api,
    supabase,
    onPeerMessage,
  });

  const openChat = () => {
    if (!enabled) {
      toast.message('Chat unavailable', {
        description: 'Messaging is only available during an active trip.',
      });
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {children(openChat, { unreadCount: chat.unreadCount })}
      <RideChatSheet
        open={open}
        onOpenChange={setOpen}
        peerLabel={peerLabel}
        variant={variant}
        enabled={enabled}
        currentUserId={currentUserId}
        chat={chat}
      />
    </>
  );
}
