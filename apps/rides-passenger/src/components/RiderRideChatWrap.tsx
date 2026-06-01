import React from 'react';
import { supabase } from '@roam/auth-client';
import { RideChatHost, type RideChatContext } from '@roam/ride-chat';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesListMessages, ridesSendMessage } from '@/services/ridesEdge';

const riderChatApi = {
  listMessages: ridesListMessages,
  sendMessage: ridesSendMessage,
};

type Props = {
  ride: RideRequestRow;
  children: (openChat: () => void, ctx: RideChatContext) => React.ReactNode;
};

export function RiderRideChatWrap({ ride, children }: Props) {
  return (
    <RideChatHost
      rideId={ride.id}
      rideStatus={ride.status}
      currentUserId={ride.rider_user_id}
      peerLabel="Your driver"
      variant="rider"
      api={riderChatApi}
      supabase={supabase}
    >
      {children}
    </RideChatHost>
  );
}
