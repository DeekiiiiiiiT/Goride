import type {
  RideChatParticipantsDto,
  RideChatViewerRole,
  RideMessageDto,
  RideMessageSenderRole,
} from '@roam/types/rides';

export function firstNameFromDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? '';
}

export function isDelegatedTripChat(ride: {
  guest_passenger_phone?: string | null;
  passenger_user_id?: string | null;
  rider_user_id?: string | null;
}): boolean {
  if (ride.guest_passenger_phone) return true;
  const passengerId = ride.passenger_user_id;
  const bookerId = ride.rider_user_id;
  return Boolean(passengerId && bookerId && passengerId !== bookerId);
}

export function buildParticipantsFromRide(ride: {
  assigned_driver_user_id?: string | null;
  rider_user_id?: string | null;
  passenger_user_id?: string | null;
  guest_passenger_name?: string | null;
}): RideChatParticipantsDto {
  const passengerFirst = firstNameFromDisplayName(ride.guest_passenger_name) || 'Rider';
  return {
    driver: {
      user_id: ride.assigned_driver_user_id ?? null,
      label: 'Driver',
    },
    booker: {
      user_id: ride.rider_user_id ?? null,
      label: 'Booker',
    },
    passenger: {
      user_id: ride.passenger_user_id ?? null,
      label: passengerFirst,
    },
  };
}

export function mergeParticipants(
  base: RideChatParticipantsDto,
  fromApi?: RideChatParticipantsDto | null,
): RideChatParticipantsDto {
  if (!fromApi) return base;
  return {
    driver: fromApi.driver?.label ? fromApi.driver : base.driver,
    booker: fromApi.booker?.label ? fromApi.booker : base.booker,
    passenger: fromApi.passenger?.label ? fromApi.passenger : base.passenger,
  };
}

export function messageSenderLabel(
  msg: Pick<RideMessageDto, 'sender_role' | 'sender_user_id'>,
  viewerRole: RideChatViewerRole | null | undefined,
  participants: RideChatParticipantsDto,
  currentUserId: string | null | undefined,
): string | null {
  if (currentUserId && msg.sender_user_id === currentUserId) return null;

  const role: RideMessageSenderRole = msg.sender_role;
  if (role === 'driver') return 'Driver';

  if (role === 'booker') {
    if (viewerRole === 'driver') return 'Booker';
    return participants.booker.label || 'Booker';
  }

  // sender_role "rider" = passenger in the trip
  if (viewerRole === 'driver') return 'Rider';
  if (viewerRole === 'booker') return participants.passenger.label || 'Rider';
  return participants.passenger.label || 'Rider';
}
