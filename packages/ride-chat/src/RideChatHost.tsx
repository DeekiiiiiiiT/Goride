import React, { useState } from 'react';
import { toast } from 'sonner';
import { isRideChatEnabled } from '@roam/types/rides';
import type { RideRequestStatus } from '@roam/types/rides';
import type { SupabaseClient } from '@supabase/supabase-js';
import { RideChatSheet } from './RideChatSheet';
import type { RideChatApi, RideChatVariant } from './types';

type Props = {
  rideId: string;
  rideStatus: RideRequestStatus | string;
  currentUserId: string | null | undefined;
  peerLabel: string;
  variant: RideChatVariant;
  api: RideChatApi;
  supabase: SupabaseClient;
  children: (openChat: () => void) => React.ReactNode;
};

/** Wraps trip UI with shared chat sheet + open handler. */
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
      {children(openChat)}
      <RideChatSheet
        open={open}
        onOpenChange={setOpen}
        rideId={rideId}
        enabled={enabled}
        currentUserId={currentUserId}
        peerLabel={peerLabel}
        variant={variant}
        api={api}
        supabase={supabase}
      />
    </>
  );
}
