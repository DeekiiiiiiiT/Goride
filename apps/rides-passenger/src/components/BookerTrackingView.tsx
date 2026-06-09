import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
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

const DEFAULT_DRIVER_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCZXJaKjzUahPFtn_kc0z6cep2KPKb-SRt6C82Jf5Wb_QcXpkDchP-XLOzCLpQ_ZCSYX_hKaY3SOy_eU3DI9Aw-mPvQXY_msvtgtg8mygaRhuUztTvwyPJs_WF8hPUfcfCXgGgqNFSkWNT4-LUTbDIeZQ5npAXE9r7X07puWio3_zSV55EVQblkv_c1GGLN92BkCOL4WbeqmtVgi03Bwotpi_jOTvtFCL8miF6A7bM4_4t4Bxabz8VOLfioyWC7jgw_DdS5VynI4EB7';

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
  const [vehicleDetailMode, setVehicleDetailMode] = useState<'plate' | 'vehicle'>('plate');
  const isMatching = ride.status === 'matching';
  const headline = isMatching
    ? matchingHeadline(ride.status)
    : bookerArrivalHeadline(ride.status, ride);
  const pickupShort = formatShortAddress(ride.pickup_address);
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const riderItems = useMemo(() => buildDelegatedRiderListItems(ride), [ride]);
  const showRiderUpdates = isOpenDelegatedBooking(ride) && riderItems.length > 0;

  const driverPhoto = assignedDriver?.profile_photo_url?.trim() || DEFAULT_DRIVER_PHOTO;
  const driverName = assignedDriver?.display_name?.trim() || 'Driver';
  const licensePlate = assignedDriver?.license_plate?.trim() || null;
  const vehicleLabel = assignedDriver?.vehicle_label?.trim() || serviceLabel;
  const plateDisplay = licensePlate ?? '—';
  const vehicleSecondary =
    vehicleDetailMode === 'plate'
      ? vehicleLabel
      : licensePlate ?? 'Plate unavailable';

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
                  <div className="live-ride-driver">
                    <div className="live-ride-driver__left">
                      <div className="live-ride-driver__avatar-wrap">
                        <img src={driverPhoto} alt="Driver" className="live-ride-driver__avatar" />
                        <span className="live-ride-driver__rating">
                          4.9 <span className="live-ride-driver__rating-star" aria-hidden>★</span>
                        </span>
                      </div>
                      <div>
                        <p className="live-ride-driver__name">{driverName}</p>
                        <p className="live-ride-driver__vehicle">{vehicleSecondary}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="live-ride-driver__plate-col touch-manipulation active:opacity-80"
                      onClick={() =>
                        setVehicleDetailMode((mode) => (mode === 'plate' ? 'vehicle' : 'plate'))
                      }
                      aria-label={
                        vehicleDetailMode === 'plate'
                          ? 'Show vehicle details'
                          : 'Show license plate'
                      }
                    >
                      <span className="live-ride-driver__plate-icon" aria-hidden>
                        <ArrowLeftRight className="size-6" strokeWidth={2} />
                      </span>
                      <p className="live-ride-driver__plate">
                        {vehicleDetailMode === 'plate' ? plateDisplay : vehicleLabel}
                      </p>
                    </button>
                  </div>
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
