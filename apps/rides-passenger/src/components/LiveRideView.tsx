import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Loader2,
  MapPin,
  MessageCircle,
  MoreVertical,
  Phone,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RideRequestRow, RideRequestStatus } from '@roam/types/rides';
import { LiveRideMap } from '@/components/LiveRideMap';
import { RideChatUnreadDot } from '@roam/ride-chat';
import { RiderRideChatWrap } from '@/components/RiderRideChatWrap';
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
  riderPin: string | null;
  waitTime: WaitTimeInfo | null | undefined;
  isFetching?: boolean;
  onBack: () => void;
  onCancelTrip: () => void;
  cancelling?: boolean;
  canChat?: boolean;
};

const DEFAULT_DRIVER_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCZXJaKjzUahPFtn_kc0z6cep2KPKb-SRt6C82Jf5Wb_QcXpkDchP-XLOzCLpQ_ZCSYX_hKaY3SOy_eU3DI9Aw-mPvQXY_msvtgtg8mygaRhuUztTvwyPJs_WF8hPUfcfCXgGgqNFSkWNT4-LUTbDIeZQ5npAXE9r7X07puWio3_zSV55EVQblkv_c1GGLN92BkCOL4WbeqmtVgi03Bwotpi_jOTvtFCL8miF6A7bM4_4t4Bxabz8VOLfioyWC7jgw_DdS5VynI4EB7';

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
  riderPin,
  waitTime,
  isFetching,
  onBack,
  onCancelTrip,
  cancelling,
  canChat = true,
}: Props) {
  const headline = liveRideStatusHeadline(ride.status, ride);
  const pickupShort = formatShortAddress(ride.pickup_address);
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const showPin = Boolean(riderPin);
  const pinAwaitingPickup =
    isRiderPinTripPhase(ride.status) && !ride.pin_verified_at && !shouldShowRiderPin(ride);
  const pinLoadingAtPickup = shouldShowRiderPin(ride) && !riderPin && !ride.pin_verified_at;
  const cancellable =
    ride.status === 'matching' ||
    ride.status === 'driver_assigned' ||
    ride.status === 'driver_en_route_pickup';

  const comingSoon = (label: string) => {
    toast.message(label, { description: 'Coming soon' });
  };

  return (
    <RiderRideChatWrap ride={ride}>
      {(openChat, { unreadCount }) => (
    <div className="live-ride-page">
      <header className="live-ride-topbar">
        <button type="button" className="live-ride-topbar__btn" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="size-6" strokeWidth={2} />
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
        <LiveRideMap
          variant="live"
          pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
          dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
          encodedPolyline={ride.route_polyline_encoded}
          driverLocation={driverLocation}
          driverHeading={driverHeading}
          sheetInsetPx={400}
        />
        {isFetching && (
          <span className="sr-only" aria-live="polite">
            Syncing ride
          </span>
        )}

        <section className="live-ride-card" aria-label="Driver and trip details">
          <div className="live-ride-card__stack">
            <div>
              <h2 className="live-ride-card__status">{headline}</h2>
              <p className="live-ride-card__pickup">
                <MapPin className="size-4" strokeWidth={2} aria-hidden />
                <span>{pickupShort}</span>
              </p>
            </div>

            <div className="live-ride-driver">
              <div className="live-ride-driver__left">
                <div className="live-ride-driver__avatar-wrap">
                  <img
                    src={DEFAULT_DRIVER_PHOTO}
                    alt="Driver"
                    className="live-ride-driver__avatar"
                  />
                  <span className="live-ride-driver__rating">
                    4.9 <span className="live-ride-driver__rating-star" aria-hidden>★</span>
                  </span>
                </div>
                <div>
                  <p className="live-ride-driver__name">Your driver</p>
                  <p className="live-ride-driver__vehicle">{serviceLabel}</p>
                </div>
              </div>
              <div className="live-ride-driver__plate-col">
                <span className="live-ride-driver__plate-icon" aria-hidden>
                  <ArrowLeftRight className="size-6" strokeWidth={2} />
                </span>
                <p className="live-ride-driver__plate">—</p>
              </div>
            </div>

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
                onClick={() => comingSoon('Safety')}
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

            {(ride.status === 'driver_arrived_pickup' || ride.status === 'driver_en_route_pickup') &&
              waitTime && <RiderWaitTimeRow waitTime={waitTime} />}

            {cancellable ? (
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
    </div>
      )}
    </RiderRideChatWrap>
  );
}
