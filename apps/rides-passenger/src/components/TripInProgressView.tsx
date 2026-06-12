import React, { useState } from 'react';
import {
  ChevronDown,
  MapPin,
  MessageCircle,
  MoreVertical,
  Share2,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { AssignedDriverSummaryDto } from '@roam/types/delegatedRide';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { LiveRideMap } from '@/components/LiveRideMap';
import { LiveRideDriverCard } from '@/components/LiveRideDriverCard';
import { RideChatUnreadDot } from '@roam/ride-chat';
import { RiderRideChatWrap } from '@/components/RiderRideChatWrap';
import { ShareMyTripSheet } from '@/components/trusted-contacts/ShareMyTripSheet';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { CashPaymentCard } from '@/components/CashPaymentCard';
import { isCashRide } from '@/lib/cashSettlementUi';

type LatLng = { lat: number; lng: number };

type Props = {
  ride: RideRequestRow;
  driverLocation: LatLng | null;
  driverHeading: number | null;
  assignedDriver?: AssignedDriverSummaryDto | null;
  onMinimize: () => void;
  canChat?: boolean;
  canCancel?: boolean;
  participantRole?: 'booker' | 'passenger' | 'driver' | 'none' | null;
};

export function tripArrivalHeadline(ride: RideRequestRow): string {
  const mins = ride.duration_estimate_minutes;
  if (mins != null && mins > 0) {
    const rounded = Math.max(1, Math.round(mins));
    return `Arriving in ${rounded} min${rounded === 1 ? '' : 's'}`;
  }
  return 'Trip in progress';
}

export function TripInProgressView({
  ride,
  driverLocation,
  driverHeading,
  assignedDriver,
  onMinimize,
  canChat = false,
  canCancel = false,
  participantRole,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const headline = tripArrivalHeadline(ride);
  const destShort = formatShortAddress(ride.dropoff_address, 3);
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const fare = formatMoneyMinor(
    ride.fare_final_minor ?? ride.fare_estimate_minor,
    ride.currency ?? 'JMD',
  );

  const comingSoon = (label: string) => {
    toast.message(label, { description: 'Coming soon' });
  };

  return (
    <RiderRideChatWrap ride={ride} participantRole={participantRole}>
      {(openChat, { unreadCount }) => (
    <div className="trip-progress-page relative isolate flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden">
      <header className="trip-progress-header">
        <button
          type="button"
          className="trip-progress-header__btn"
          onClick={onMinimize}
          aria-label="Minimize tracker"
        >
          <ChevronDown className="size-6" strokeWidth={2} />
        </button>
        <h1 className="trip-progress-header__brand">Roam</h1>
        <button
          type="button"
          className="trip-progress-header__btn"
          onClick={() => comingSoon('Trip options')}
          aria-label="More options"
        >
          <MoreVertical className="size-6" strokeWidth={2} />
        </button>
      </header>

      <main className="trip-progress-stage relative flex min-h-0 flex-1 overflow-hidden">
        <div className="trip-progress-map-layer">
          <LiveRideMap
            variant="trip"
            pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
            dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
            encodedPolyline={ride.route_polyline_encoded}
            driverLocation={driverLocation}
            driverHeading={driverHeading}
            sheetInsetPx={420}
          />
        </div>
        <div className="trip-progress-map-gradient" aria-hidden />

        <section className="trip-progress-sheet z-40" aria-label="Trip status">
          <div className="trip-progress-sheet__handle" aria-hidden />

          <h2 className="trip-progress-sheet__status">{headline}</h2>
          <p className="trip-progress-sheet__dest">
            <MapPin className="size-[18px]" strokeWidth={2} aria-hidden />
            <span>{destShort}</span>
          </p>

          <LiveRideDriverCard assignedDriver={assignedDriver} serviceLabel={serviceLabel} />

          {isCashRide(ride) ? (
            <div className="px-1 pb-1">
              <CashPaymentCard ride={ride} />
            </div>
          ) : null}

          <div className="trip-progress-actions" role="group" aria-label="Trip actions">
            {canChat ? (
            <button
              type="button"
              className="trip-progress-action"
              onClick={openChat}
              aria-label={unreadCount > 0 ? `Message, ${unreadCount} unread` : 'Message driver'}
            >
              <span className="trip-progress-action__circle relative">
                <MessageCircle className="size-6" strokeWidth={2} />
                <RideChatUnreadDot show={unreadCount > 0} className="right-1 top-1" />
              </span>
              <span className="trip-progress-action__label">Message</span>
            </button>
            ) : null}
            <button type="button" className="trip-progress-action" onClick={() => setSafetyOpen(true)}>
              <span className="trip-progress-action__circle">
                <Share2 className="size-6" strokeWidth={2} />
              </span>
              <span className="trip-progress-action__label">Share Trip</span>
            </button>
            <button
              type="button"
              className="trip-progress-action trip-progress-action--safety"
              onClick={() => setSafetyOpen(true)}
            >
              <span className="trip-progress-action__circle">
                <Shield className="size-6" strokeWidth={2} />
              </span>
              <span className="trip-progress-action__label">Safety</span>
            </button>
          </div>

          <button
            type="button"
            className="trip-progress-details-btn"
            onClick={() => setDetailsOpen((o) => !o)}
            aria-expanded={detailsOpen}
          >
            Trip Details
          </button>

          {detailsOpen && (
            <div className="trip-progress-details-panel">
              <p>
                <strong>Pickup</strong>
                <br />
                {ride.pickup_address ?? '—'}
              </p>
              <p>
                <strong>Drop-off</strong>
                <br />
                {ride.dropoff_address ?? '—'}
              </p>
              <p>
                <strong>Estimated fare</strong>: {fare}
              </p>
            </div>
          )}
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
