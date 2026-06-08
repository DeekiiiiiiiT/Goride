import React, { useEffect, useState } from 'react';
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
  groupChat?: boolean;
  children: (openChat: () => void, ctx: RideChatContext) => React.ReactNode;
};

export function RiderRideChatWrap({ ride, groupChat, children }: Props) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <RideChatHost
      rideId={ride.id}
      rideStatus={ride.status}
      currentUserId={currentUserId}
      peerLabel={groupChat ? 'Trip chat' : 'Your driver'}
      variant="rider"
      groupChat={groupChat}
      api={riderChatApi}
      supabase={supabase}
    >
      {children}
    </RideChatHost>
  );
}
