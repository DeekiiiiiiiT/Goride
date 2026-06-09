import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  MapPin,
  MessageCircle,
  MoreVertical,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';
import { buildDelegatedRiderListItems, isOpenDelegatedBooking } from '@roam/types/delegatedRide';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import { LiveRideMap } from '@/components/LiveRideMap';
import { LiveRideDriverCard } from '@/components/LiveRideDriverCard';
import { RideChatUnreadDot } from '@roam/ride-chat';
import { RiderRideChatWrap } from '@/components/RiderRideChatWrap';
import { ShareMyTripSheet } from '@/components/trusted-contacts/ShareMyTripSheet';
import { DelegatedRidersPanel } from '@/components/delegated/DelegatedRidersPanel';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { liveRideStatusHeadline } from '@/components/LiveRideView';

type LatLng = { lat: number; lng: number };

type Props = {
  ride: RideRequestRow;
  driverLocation: LatLng | null;
  driverHeading: number | null;
  passengerName?: string | null;
  assignedDriver?: AssignedDriverSummaryDto | null;
  isFetching?: boolean;
  onMinimize: () => void;
  onCancelTrip: () => void;
  cancelling?: boolean;
  canChat?: boolean;
  canCancel?: boolean;
};

function matchingHeadline(status: RideRequestStatus): string {
  if (status === 'matching') return 'Finding a driver…';
  return liveRideStatusHeadline(status, {} as RideRequestRow);
}

function bookerArrivalHeadline(status: RideRequestStatus, ride: RideRequestRow): string {
  if (status === 'driver_arrived_pickup') return 'Driver has arrived at pickup';
  return liveRideStatusHeadline(status, ride);
}

export function BookerTrackingView({
  ride,
  driverLocation,
  driverHeading,
  passengerName,
  assignedDriver,
  isFetching,
  onMinimize,
  onCancelTrip,
  cancelling,
  canChat = false,
  canCancel = false,
}: Props) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const isMatching = ride.status === 'matching';
  const headline = isMatching
    ? matchingHeadline(ride.status)
    : bookerArrivalHeadline(ride.status, ride);
  const pickupShort = formatShortAddress(ride.pickup_address);
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const riderItems = useMemo(() => buildDelegatedRiderListItems(ride), [ride]);
  const showRiderUpdates = isOpenDelegatedBooking(ride) && riderItems.length > 0;

  const comingSoon = (label: string) => {
    toast.message(label, { description: 'Coming soon' });
  };

  return (
    <RiderRideChatWrap ride={ride} participantRole="booker" groupChat>
      {(openChat, { unreadCount }) => (
        <div className="live-ride-page">
          <header className="live-ride-topbar">
            <button
              type="button"
              className="live-ride-topbar__btn"
              onClick={onMinimize}
              aria-label="Minimize tracker"
            >
              <ChevronDown className="size-6" strokeWidth={2} />
            </button>
            <h1 className="live-ride-topbar__brand">Roam</h1>
            <button
              type="button"
              className="live-ride-topbar__btn"
              onClick={() => comingSoon('Trip options')}
              aria-label="More options"
            >
              <MoreVertical className="size-6" strokeWidth={2} />
            </button>
          </header>

          <main className="live-ride-stage">
            <div className="live-ride-map-pane">
              <LiveRideMap
                variant="live"
                pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
                dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
                encodedPolyline={ride.route_polyline_encoded}
                driverLocation={driverLocation}
                driverHeading={driverHeading}
                sheetInsetPx={48}
              />
            </div>

            {isFetching && (
              <span className="sr-only" aria-live="polite">
                Syncing ride
              </span>
            )}

            <section className="live-ride-panel" aria-label="Trip tracker">
              <div className="live-ride-panel__stack">
                {passengerName ? (
                  <p className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900">
                    Ride booked for {passengerName}
                  </p>
                ) : null}

                {showRiderUpdates ? (
                  <DelegatedRidersPanel riders={riderItems} variant="booker" defaultOpen={false} />
                ) : null}

                <div>
                  <h2 className="live-ride-card__status">{headline}</h2>
                  <p className="live-ride-card__pickup">
                    <MapPin className="size-4" strokeWidth={2} aria-hidden />
                    <span>{pickupShort}</span>
                  </p>
                </div>

                {!isMatching ? (
                  <LiveRideDriverCard
                    assignedDriver={assignedDriver}
                    serviceLabel={serviceLabel}
                    nameFallback="Driver"
                  />
                ) : null}

                <div className="live-ride-actions" role="group" aria-label="Contact and safety">
                  {canChat ? (
                    <button
                      type="button"
                      className="live-ride-action"
                      onClick={openChat}
                      aria-label={unreadCount > 0 ? `Message, ${unreadCount} unread` : 'Message'}
                    >
                      <span className="live-ride-action__circle relative">
                        <MessageCircle className="size-6" strokeWidth={2} />
                        <RideChatUnreadDot show={unreadCount > 0} className="right-1 top-1" />
                      </span>
                      <span className="live-ride-action__label">Message</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="live-ride-action live-ride-action--safety"
                    onClick={() => setSafetyOpen(true)}
                  >
                    <span className="live-ride-action__circle">
                      <Shield className="size-6" strokeWidth={2} />
                    </span>
                    <span className="live-ride-action__label">Safety</span>
                  </button>
                </div>

                {canCancel ? (
                  <button
                    type="button"
                    className="live-ride-cancel"
                    onClick={onCancelTrip}
                    disabled={cancelling}
                  >
                    {cancelling ? 'Cancelling…' : isMatching ? 'Cancel search' : 'Cancel ride'}
                  </button>
                ) : null}
              </div>
            </section>
          </main>
          <ShareMyTripSheet
            open={safetyOpen}
            onClose={() => setSafetyOpen(false)}
            rideId={ride.id}
            onShared={() => toast.success('Trip shared.')}
          />
        </div>
      )}
    </RiderRideChatWrap>
  );
}
