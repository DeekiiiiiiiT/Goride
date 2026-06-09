import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  Loader2,
  MapPin,
  MessageCircle,
  MoreVertical,
  Phone,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import { LiveRideMap } from '@/components/LiveRideMap';
import { LiveRideDriverCard } from '@/components/LiveRideDriverCard';
import { RideChatUnreadDot } from '@roam/ride-chat';
import { RiderRideChatWrap } from '@/components/RiderRideChatWrap';
import { ShareMyTripSheet } from '@/components/trusted-contacts/ShareMyTripSheet';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { isRiderPinTripPhase, shouldShowRiderPin } from '@/lib/riderPin';

type LatLng = { lat: number; lng: number };

interface WaitTimeInfo {
  wait_time_charge_enabled?: boolean;
  wait_time_grace_remaining_seconds?: number;
  wait_time_grace_expired?: boolean;
}

type Props = {
  ride: RideRequestRow;
  driverLocation: LatLng | null;
  driverHeading: number | null;
  assignedDriver?: AssignedDriverSummaryDto | null;
  riderPin: string | null;
  pinEnabled?: boolean;
  waitTime: WaitTimeInfo | null | undefined;
  isFetching?: boolean;
  onMinimize: () => void;
  onCancelTrip: () => void;
  onRetryPin?: () => void;
  cancelling?: boolean;
  canChat?: boolean;
  canCancel?: boolean;
  participantRole?: 'booker' | 'passenger' | 'driver' | 'none' | null;
};

function formatSeconds(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.round(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

export function liveRideStatusHeadline(status: RideRequestStatus, ride: RideRequestRow): string {
  switch (status) {
    case 'driver_assigned':
      return 'Driver assigned';
    case 'driver_en_route_pickup': {
      const secs = ride.eta_pickup_seconds_estimate;
      if (secs != null && secs > 0) {
        const mins = Math.max(1, Math.ceil(secs / 60));
        return `Driver is ${mins} min${mins === 1 ? '' : 's'} away`;
      }
      return 'Driver is on the way';
    }
    case 'driver_arrived_pickup':
      return 'Your driver has arrived';
    default:
      return 'Your ride';
  }
}

function RiderWaitTimeRow({ waitTime }: { waitTime: WaitTimeInfo }) {
  const [remainingSecs, setRemainingSecs] = useState(waitTime.wait_time_grace_remaining_seconds ?? 0);

  useEffect(() => {
    setRemainingSecs(waitTime.wait_time_grace_remaining_seconds ?? 0);
  }, [waitTime.wait_time_grace_remaining_seconds]);

  useEffect(() => {
    if (remainingSecs <= 0) return;
    const interval = setInterval(() => setRemainingSecs((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [remainingSecs > 0]);

  if (!waitTime.wait_time_charge_enabled) return null;
  if (waitTime.wait_time_grace_expired || remainingSecs <= 0) return null;

  return (
    <div className="live-ride-wait">
      <Loader2 className="size-4 shrink-0 animate-spin text-[var(--live-ride-brand)]" aria-hidden />
      <span>Grace period: {formatSeconds(remainingSecs)} remaining</span>
    </div>
  );
}

export function LiveRideView({
  ride,
  driverLocation,
  driverHeading,
  assignedDriver,
  riderPin,
  pinEnabled = false,
  waitTime,
  isFetching,
  onMinimize,
  onCancelTrip,
  onRetryPin,
  cancelling,
  canChat = false,
  canCancel = false,
  participantRole,
}: Props) {
  const [safetyOpen, setSafetyOpen] = useState(false);
  const headline = liveRideStatusHeadline(ride.status, ride);
  const pickupShort = formatShortAddress(ride.pickup_address);
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const showPin = Boolean(riderPin);
  const pinPhase = pinEnabled && isRiderPinTripPhase(ride.status) && !ride.pin_verified_at;
  const pinAwaitingPickup = pinPhase && !shouldShowRiderPin(ride);
  const pinLoadingAtPickup =
    pinEnabled && shouldShowRiderPin(ride) && !riderPin && !ride.pin_verified_at && Boolean(isFetching);
  const pinUnavailable =
    pinEnabled && shouldShowRiderPin(ride) && !riderPin && !ride.pin_verified_at && !isFetching;

  const groupChat = Boolean(
    ride.guest_passenger_phone ||
      (ride.passenger_user_id && ride.passenger_user_id !== ride.rider_user_id),
  );

  const comingSoon = (label: string) => {
    toast.message(label, { description: 'Coming soon' });
  };

  return (
    <RiderRideChatWrap ride={ride} participantRole={participantRole} groupChat={groupChat}>
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

        <section className="live-ride-panel" aria-label="Driver and trip details">
          <div className="live-ride-panel__stack">
            <div>
              <h2 className="live-ride-card__status">{headline}</h2>
              <p className="live-ride-card__pickup">
                <MapPin className="size-4" strokeWidth={2} aria-hidden />
                <span>{pickupShort}</span>
              </p>
            </div>

            <LiveRideDriverCard assignedDriver={assignedDriver} serviceLabel={serviceLabel} />

            <div className="live-ride-actions" role="group" aria-label="Contact and safety">
              {canChat ? (
              <button
                type="button"
                className="live-ride-action"
                onClick={openChat}
                aria-label={unreadCount > 0 ? `Message, ${unreadCount} unread` : 'Message driver'}
              >
                <span className="live-ride-action__circle relative">
                  <MessageCircle className="size-6" strokeWidth={2} />
                  <RideChatUnreadDot show={unreadCount > 0} className="right-1 top-1" />
                </span>
                <span className="live-ride-action__label">Message</span>
              </button>
              ) : null}
              <button type="button" className="live-ride-action" onClick={() => comingSoon('Call')}>
                <span className="live-ride-action__circle">
                  <Phone className="size-6" strokeWidth={2} />
                </span>
                <span className="live-ride-action__label">Call</span>
              </button>
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

            {showPin && (
              <section className="live-ride-pin" aria-label="Trip PIN">
                <p className="live-ride-pin__label">Your trip PIN</p>
                <p className="live-ride-pin__hint">Tell your driver this code to start the trip</p>
                <div className="live-ride-pin__digits">
                  {riderPin!.split('').map((digit, i) => (
                    <span key={i} className="live-ride-pin__digit">
                      {digit}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {pinAwaitingPickup && (
              <p className="live-ride-note">
                Your trip PIN will appear when your driver reaches the pickup location.
              </p>
            )}

            {pinLoadingAtPickup && (
              <div className="live-ride-wait">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                <span>Loading your trip PIN…</span>
              </div>
            )}

            {pinUnavailable && (
              <div className="live-ride-note">
                <p className="mb-2">Could not load your trip PIN.</p>
                {onRetryPin ? (
                  <button
                    type="button"
                    className="font-semibold text-[var(--live-ride-brand)]"
                    onClick={onRetryPin}
                  >
                    Tap to retry
                  </button>
                ) : null}
              </div>
            )}

            {(ride.status === 'driver_arrived_pickup' || ride.status === 'driver_en_route_pickup') &&
              waitTime && <RiderWaitTimeRow waitTime={waitTime} />}

            {canCancel ? (
              <button
                type="button"
                className="live-ride-cancel"
                onClick={onCancelTrip}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling…' : 'Cancel Trip'}
              </button>
            ) : null}
          </div>
        </section>
      </main>
      <ShareMyTripSheet
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        rideId={ride.id}
        onShared={() => toast.success('Trip shared. Your contacts can track your ride from the link we sent.')}
      />
    </div>
      )}
    </RiderRideChatWrap>
  );
}
