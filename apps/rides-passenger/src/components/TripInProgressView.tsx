import React, { useState } from 'react';
import {
  ArrowLeft,
  MapPin,
  MessageCircle,
  MoreVertical,
  Share2,
  Shield,
  Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { LiveRideMap } from '@/components/LiveRideMap';
import { RiderRideChatWrap } from '@/components/RiderRideChatWrap';
import { formatShortAddress } from '@/lib/formatRideAddress';

type LatLng = { lat: number; lng: number };

type Props = {
  ride: RideRequestRow;
  driverLocation: LatLng | null;
  driverHeading: number | null;
  onBack: () => void;
};

const DEFAULT_DRIVER_PHOTO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAdWvx2EJFAKdiJFUQnGtej_Q4tWVIdT9fz67e2AVND-xQu1bJdINh8eIU1psQPKZWUW0vbh8sAyswWJdaSOgIZ4GpDvRxZ1PcXpJRAUdxTUmdL6W14p9f-12C-H6vjHymVBnSizwaq-rsUC4YQnVHfzlmehj5kY0dGpxKcu7-vrd65iaR7QNI5kd_zeCqptx6DFOaoblpjfWY6QbFjYgEjQnBUU_PEOqF0-kfjgaLfhOGiUMPk5EJG3sMhxp5s6PKVwrdIrixrebdMu';

export function tripArrivalHeadline(ride: RideRequestRow): string {
  const mins = ride.duration_estimate_minutes;
  if (mins != null && mins > 0) {
    const rounded = Math.max(1, Math.round(mins));
    return `Arriving in ${rounded} min${rounded === 1 ? '' : 's'}`;
  }
  return 'Trip in progress';
}

export function TripInProgressView({ ride, driverLocation, driverHeading, onBack }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const handleShareTrip = async () => {
    const text = `I'm on a Roam trip to ${ride.dropoff_address ?? 'my destination'}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Share my Roam trip', text });
        return;
      }
    } catch {
      /* cancelled */
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Trip link copied');
    } catch {
      toast.message('Share trip', { description: text });
    }
  };

  return (
    <RiderRideChatWrap ride={ride}>
      {(openChat) => (
    <div className="trip-progress-page">
      <header className="trip-progress-header">
        <button type="button" className="trip-progress-header__btn" onClick={onBack} aria-label="Go back">
          <ArrowLeft className="size-6" strokeWidth={2} />
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

      <main className="trip-progress-stage">
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

        <section className="trip-progress-sheet" aria-label="Trip status">
          <div className="trip-progress-sheet__handle" aria-hidden />

          <h2 className="trip-progress-sheet__status">{headline}</h2>
          <p className="trip-progress-sheet__dest">
            <MapPin className="size-[18px]" strokeWidth={2} aria-hidden />
            <span>{destShort}</span>
          </p>

          <div className="trip-progress-driver">
            <div className="trip-progress-driver__left">
              <img src={DEFAULT_DRIVER_PHOTO} alt="Driver" className="trip-progress-driver__avatar" />
              <div>
                <div className="trip-progress-driver__name-row">
                  <h3 className="trip-progress-driver__name">Your driver</h3>
                  <span className="trip-progress-driver__rating">
                    <Star aria-hidden />
                    4.9
                  </span>
                </div>
                <p className="trip-progress-driver__vehicle">{serviceLabel}</p>
              </div>
            </div>
            <p className="trip-progress-driver__plate">—</p>
          </div>

          <div className="trip-progress-actions" role="group" aria-label="Trip actions">
            <button type="button" className="trip-progress-action" onClick={openChat}>
              <span className="trip-progress-action__circle">
                <MessageCircle className="size-6" strokeWidth={2} />
              </span>
              <span className="trip-progress-action__label">Message</span>
            </button>
            <button type="button" className="trip-progress-action" onClick={() => void handleShareTrip()}>
              <span className="trip-progress-action__circle">
                <Share2 className="size-6" strokeWidth={2} />
              </span>
              <span className="trip-progress-action__label">Share Trip</span>
            </button>
            <button
              type="button"
              className="trip-progress-action trip-progress-action--safety"
              onClick={() => comingSoon('Safety')}
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
    </div>
      )}
    </RiderRideChatWrap>
  );
}
