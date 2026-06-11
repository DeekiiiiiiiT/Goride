import type { RoamConnectionRequestDto } from '@roam/types/roamConnections';
import type { PassengerAuthorizationDto } from '@roam/types/passengerAuthorization';

export function connectionRequestStatusLabel(req: RoamConnectionRequestDto): string {
  if (req.status === 'pending') {
    return req.is_invite ? 'Invite sent · waiting for signup' : 'Waiting for accept';
  }
  if (req.status === 'accepted') return 'Connected';
  if (req.status === 'rejected') return 'Declined';
  if (req.status === 'cancelled') return 'Cancelled';
  if (req.status === 'expired') return 'Expired';
  return req.status;
}

export function authorizationTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60) return `${mins} min left`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`;
}

export function authorizationStatusLabel(auth: PassengerAuthorizationDto): string {
  if (auth.status === 'pending') {
    const remaining = authorizationTimeRemaining(auth.expires_at);
    return remaining === 'Expired' ? 'Expired' : `Waiting · ${remaining}`;
  }
  if (auth.status === 'claimed') return 'Ride authorized';
  if (auth.status === 'consumed') return 'Ride booked';
  if (auth.status === 'expired') return 'Expired';
  if (auth.status === 'cancelled') return 'Cancelled';
  return auth.status;
}

export const CONNECTION_REQUEST_SENT_COPY =
  'Request sent — they need to accept before they appear in Roam Contacts.';

export const CONNECTION_INVITE_SENT_COPY =
  'Invite sent — they will see your request after they install Roam.';
