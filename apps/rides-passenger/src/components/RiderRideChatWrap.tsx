import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@roam/auth-client';
import {
  RideChatHost,
  type RideChatContext,
  buildParticipantsFromRide,
  isDelegatedTripChat,
} from '@roam/ride-chat';
import type { RideChatViewerRole } from '@roam/types/rides';
import type { RideRequestRow } from '@roam/types/rides';
import { ridesListMessages, ridesSendMessage } from '@/services/ridesEdge';

const riderChatApi = {
  listMessages: ridesListMessages,
  sendMessage: ridesSendMessage,
};

type Props = {
  ride: RideRequestRow;
  participantRole?: 'booker' | 'passenger' | 'driver' | 'none' | null;
  groupChat?: boolean;
  children: (openChat: () => void, ctx: RideChatContext) => React.ReactNode;
};

function mapViewerRole(
  participantRole: Props['participantRole'],
): RideChatViewerRole | undefined {
  if (participantRole === 'booker' || participantRole === 'passenger' || participantRole === 'driver') {
    return participantRole;
  }
  return undefined;
}

export function RiderRideChatWrap({ ride, participantRole, groupChat, children }: Props) {
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

  const delegated = groupChat ?? isDelegatedTripChat(ride);
  const initialParticipants = useMemo(() => buildParticipantsFromRide(ride), [ride]);
  const initialViewerRole = mapViewerRole(participantRole);

  return (
    <RideChatHost
      rideId={ride.id}
      rideStatus={ride.status}
      currentUserId={currentUserId}
      peerLabel={delegated ? 'Trip chat' : 'Your driver'}
      variant="rider"
      groupChat={delegated}
      initialParticipants={initialParticipants}
      initialViewerRole={initialViewerRole}
      api={riderChatApi}
      supabase={supabase}
    >
      {children}
    </RideChatHost>
  );
}
