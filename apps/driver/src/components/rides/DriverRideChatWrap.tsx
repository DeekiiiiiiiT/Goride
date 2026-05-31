import React from 'react';
import { RideChatHost } from '@roam/ride-chat';
import type { RideRequestRow } from '@roam/types/rides';
import { useAuth } from '../../contexts/AuthContext';
import { ridesDriverListMessages, ridesDriverSendMessage } from '../../services/ridesDriverEdge';
import { supabase } from '../../utils/supabase/client';

const driverChatApi = {
  listMessages: ridesDriverListMessages,
  sendMessage: ridesDriverSendMessage,
};

type Props = {
  ride: RideRequestRow;
  children: (openChat: () => void) => React.ReactNode;
};

export function DriverRideChatWrap({ ride, children }: Props) {
  const { user } = useAuth();

  return (
    <RideChatHost
      rideId={ride.id}
      rideStatus={ride.status}
      currentUserId={user?.id}
      peerLabel="Passenger"
      variant="driver"
      api={driverChatApi}
      supabase={supabase}
    >
      {children}
    </RideChatHost>
  );
}
