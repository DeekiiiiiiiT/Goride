import React from 'react';
import {
  RideChatHost,
  type RideChatContext,
  buildParticipantsFromRide,
  isDelegatedTripChat,
} from '@roam/ride-chat';
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
  children: (openChat: () => void, ctx: RideChatContext) => React.ReactNode;
};

export function DriverRideChatWrap({ ride, children }: Props) {
  const { user } = useAuth();
  const delegated = isDelegatedTripChat(ride);
  const initialParticipants = buildParticipantsFromRide(ride);

  return (
    <RideChatHost
      rideId={ride.id}
      rideStatus={ride.status}
      currentUserId={user?.id}
      peerLabel={delegated ? 'Trip chat' : 'Passenger'}
      variant="driver"
      groupChat={delegated}
      initialParticipants={initialParticipants}
      initialViewerRole="driver"
      api={driverChatApi}
      supabase={supabase}
    >
      {children}
    </RideChatHost>
  );
}
