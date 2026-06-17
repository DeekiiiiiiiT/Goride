import React, { useEffect, useState } from 'react';
import { ArrowLeft, Car, X } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { supabase } from '@roam/auth-client';
import { LiveRideMap } from '@/components/LiveRideMap';
import { DEFAULT_PROFILE_AVATAR_URL } from '@/lib/roamHomeAssets';

type Props = {
  ride: RideRequestRow;
  onMinimize: () => void;
  onCancelTrip: () => void;
  cancelling?: boolean;
  canCancel?: boolean;
};

export function FindingDriverView({
  ride,
  onMinimize,
  onCancelTrip,
  cancelling = false,
  canCancel = true,
}: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      const url =
        (user?.user_metadata?.avatar_url as string | undefined) ||
        (user?.user_metadata?.picture as string | undefined) ||
        null;
      setAvatarUrl(url);
    });
  }, []);

  return (
    <div className="finding-driver-page">
      <header className="finding-driver-header">
        <div className="finding-driver-header__left">
          <button
            type="button"
            className="finding-driver-header__back"
            onClick={onMinimize}
            aria-label="Minimize tracker"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <div className="min-w-0">
            <h1 className="finding-driver-header__title">Live ride</h1>
            <p className="finding-driver-header__subtitle">Live updates when driver is assigned</p>
          </div>
        </div>
        <div className="finding-driver-header__avatar" aria-hidden>
          <img src={avatarUrl ?? DEFAULT_PROFILE_AVATAR_URL} alt="" />
        </div>
      </header>

      <main className="finding-driver-stage">
        <div className="finding-driver-map-layer">
          <LiveRideMap
            variant="live"
            pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
            dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
            encodedPolyline={ride.route_polyline_encoded}
            sheetInsetPx={420}
          />
        </div>

        <div className="finding-driver-map-overlay" aria-hidden>
          <div className="finding-driver-map-pulse">
            <div className="finding-driver-map-pulse__ring" />
            <div className="finding-driver-map-pulse__dot" />
          </div>
          <div className="finding-driver-map-orbit">
            <Car className="finding-driver-map-orbit__car h-8 w-8" strokeWidth={2} />
            <div className="finding-driver-map-orbit__dot" />
          </div>
        </div>

        <section className="finding-driver-sheet" aria-label="Driver search status">
          <div className="finding-driver-sheet__handle" />

          <div className="finding-driver-status-row">
            <div>
              <div className="finding-driver-status-label">
                <span className="finding-driver-status-label__dot" />
                Status
              </div>
              <h2 className="finding-driver-headline">Finding a nearby driver...</h2>
            </div>
            <div className="finding-driver-spinner" aria-hidden>
              <div className="finding-driver-spinner__track" />
              <div className="finding-driver-spinner__arc" />
            </div>
          </div>

          <div className="finding-driver-route">
            <div className="finding-driver-route__timeline">
              <div className="finding-driver-route__pickup-dot" />
              <div className="finding-driver-route__line" />
              <div className="finding-driver-route__drop-dot" />
            </div>
            <div className="finding-driver-route__details">
              <div>
                <span className="finding-driver-route__label">Pickup</span>
                <p className="finding-driver-route__address">{ride.pickup_address ?? 'Pickup'}</p>
              </div>
              <div>
                <span className="finding-driver-route__label">Drop-off</span>
                <p className="finding-driver-route__address">{ride.dropoff_address ?? 'Drop-off'}</p>
              </div>
            </div>
          </div>

          {canCancel ? (
            <button
              type="button"
              onClick={onCancelTrip}
              disabled={cancelling}
              className="finding-driver-cancel"
            >
              <X className="h-5 w-5" aria-hidden />
              {cancelling ? 'Cancelling…' : 'Cancel search'}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
