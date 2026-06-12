import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Share2, Star, X } from 'lucide-react';
import { vehicleTypeLabel } from '@roam/business-config/ridesVehicleTypes';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { CashSettlementSummarySection } from '@/components/CashSettlementSummarySection';
import { TripSummaryMap } from '@/components/TripSummaryMap';

const KM_TO_MI = 0.621371;

const TIP_PRESETS_JMD = [
  { id: '500', label: '500' },
  { id: '1000', label: '1,000' },
  { id: '2000', label: '2,000' },
] as const;

function formatTripDistanceMi(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  return `${(km * KM_TO_MI).toFixed(1)} mi`;
}

function formatTripDuration(ride: RideRequestRow): string {
  if (ride.trip_started_at && ride.completed_at) {
    const mins = Math.max(
      1,
      Math.round(
        (new Date(ride.completed_at).getTime() - new Date(ride.trip_started_at).getTime()) / 60_000,
      ),
    );
    return `${mins}m`;
  }
  const est = ride.duration_estimate_minutes;
  if (est != null && Number.isFinite(est)) return `${Math.round(est)}m`;
  return '—';
}

type Props = {
  ride: RideRequestRow;
};

export function TripSummaryView({ ride }: Props) {
  const navigate = useNavigate();
  const [rating, setRating] = useState(5);
  const [selectedTip, setSelectedTip] = useState<string | null>(null);

  const fare = formatMoneyMinor(
    ride.fare_final_minor ?? ride.fare_estimate_minor,
    ride.currency ?? 'JMD',
  );
  const serviceLabel = vehicleTypeLabel(ride.vehicle_option);
  const duration = formatTripDuration(ride);
  const distance = formatTripDistanceMi(ride.distance_estimate_km);

  const driverInitial = useMemo(() => {
    return 'D';
  }, []);

  const finish = () => {
    toast.success('Thanks for riding with Roam');
    navigate('/', { replace: true });
  };

  const handleShare = async () => {
    const text = `Trip from ${ride.pickup_address ?? 'pickup'} to ${ride.dropoff_address ?? 'drop-off'} — ${fare}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Roam trip summary', text });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Trip details copied');
    } catch {
      toast.message('Share', { description: text });
    }
  };

  const selectTip = (id: string) => {
    if (id === 'custom') {
      toast.message('Custom tip', { description: 'Coming soon' });
      return;
    }
    setSelectedTip((prev) => (prev === id ? null : id));
  };

  return (
    <div className="trip-summary-page">
      <header className="trip-summary-header">
        <button
          type="button"
          className="trip-summary-icon-btn"
          onClick={finish}
          aria-label="Close trip summary"
        >
          <X className="size-5" strokeWidth={2.25} />
        </button>
        <h1 className="trip-summary-header__title">Trip Summary</h1>
        <button
          type="button"
          className="trip-summary-icon-btn"
          onClick={() => void handleShare()}
          aria-label="Share trip summary"
        >
          <Share2 className="size-5" strokeWidth={2.25} />
        </button>
      </header>

      <main className="trip-summary-main">
        <TripSummaryMap
          pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
          dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
          encodedPolyline={ride.route_polyline_encoded}
        />

        <section className="trip-summary-stats" aria-label="Trip statistics">
          <div className="trip-summary-stats__cell">
            <span className="trip-summary-stats__label">Fare</span>
            <span className="trip-summary-stats__value">{fare}</span>
          </div>
          <div className="trip-summary-stats__cell trip-summary-stats__cell--mid">
            <span className="trip-summary-stats__label">Time</span>
            <span className="trip-summary-stats__value">{duration}</span>
          </div>
          <div className="trip-summary-stats__cell">
            <span className="trip-summary-stats__label">Dist</span>
            <span className="trip-summary-stats__value">{distance}</span>
          </div>
        </section>

        <CashSettlementSummarySection ride={ride} />

        <section className="trip-summary-card" aria-label="Rate your driver">
          <div className="trip-summary-rating__avatar" aria-hidden>
            {driverInitial}
          </div>
          <h2 className="trip-summary-rating__title">Rate your driver</h2>
          <p className="trip-summary-rating__subtitle">
            How was your {serviceLabel} ride?
          </p>
          <div className="trip-summary-stars" role="group" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={`trip-summary-star-btn ${value <= rating ? 'trip-summary-star-btn--active' : ''}`}
                onClick={() => setRating(value)}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                aria-pressed={value <= rating}
              >
                <Star
                  className="size-9"
                  strokeWidth={1.75}
                  fill={value <= rating ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Add a tip">
          <h3 className="trip-summary-tips__label">Add a tip</h3>
          <div className="trip-summary-tips__grid">
            {TIP_PRESETS_JMD.map((tip) => (
              <button
                key={tip.id}
                type="button"
                className={`trip-summary-tip-btn ${
                  selectedTip === tip.id ? 'trip-summary-tip-btn--selected' : ''
                }`}
                onClick={() => selectTip(tip.id)}
              >
                {ride.currency === 'USD' ? `$${tip.label}` : `JMD ${tip.label}`}
              </button>
            ))}
            <button
              type="button"
              className={`trip-summary-tip-btn trip-summary-tip-btn--custom ${
                selectedTip === 'custom' ? 'trip-summary-tip-btn--selected' : ''
              }`}
              onClick={() => selectTip('custom')}
            >
              Custom
            </button>
          </div>
        </section>

        <button type="button" className="trip-summary-done" onClick={finish}>
          Done
        </button>
      </main>
    </div>
  );
}
