import type { RideRequestRow, RideRequestStatus } from './rides';

export type DelegatedRiderPickupStatus = 'waiting' | 'en_route' | 'arrived' | 'picked_up';

export type DelegatedRiderListItem = {
  id: string;
  name: string;
  status: DelegatedRiderPickupStatus;
  statusLabel: string;
};

export interface AssignedDriverSummaryDto {
  display_name: string | null;
  profile_photo_url: string | null;
  vehicle_label: string | null;
  license_plate: string | null;
}

export function isOpenDelegatedBooking(ride: {
  guest_passenger_phone?: string | null;
  passenger_user_id?: string | null;
  rider_user_id?: string | null;
  roam_mode?: string | null;
}): boolean {
  if (ride.roam_mode === 'shadow_roam') return false;
  if (ride.guest_passenger_phone) return true;
  const passengerId = ride.passenger_user_id;
  const bookerId = ride.rider_user_id;
  return Boolean(passengerId && bookerId && passengerId !== bookerId);
}

export function delegatedRiderPickupStatus(
  ride: Pick<RideRequestRow, 'status' | 'pin_verified_at'>,
): DelegatedRiderPickupStatus {
  const status = ride.status as RideRequestStatus;
  if (status === 'on_trip' || ride.pin_verified_at) return 'picked_up';
  if (status === 'driver_arrived_pickup') return 'arrived';
  if (status === 'driver_en_route_pickup' || status === 'driver_assigned') return 'en_route';
  return 'waiting';
}

export function delegatedRiderStatusLabel(status: DelegatedRiderPickupStatus): string {
  switch (status) {
    case 'picked_up':
      return 'Picked up';
    case 'arrived':
      return 'At pickup';
    case 'en_route':
      return 'Driver en route';
    default:
      return 'Waiting';
  }
}

export function buildDelegatedRiderListItems(ride: RideRequestRow): DelegatedRiderListItem[] {
  const status = delegatedRiderPickupStatus(ride);
  const name = ride.guest_passenger_name?.trim() || 'Rider';
  return [
    {
      id: ride.passenger_user_id ?? ride.id,
      name,
      status,
      statusLabel: delegatedRiderStatusLabel(status),
    },
  ];
}
