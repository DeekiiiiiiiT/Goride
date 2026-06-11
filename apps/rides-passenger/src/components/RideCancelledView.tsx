import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CircleX, Headphones, History, Share2 } from 'lucide-react';
import type { RideRequestRow } from '@roam/types/rides';
import { TripSummaryMap } from '@/components/TripSummaryMap';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { formatCancelReasonBadge, formatRideDisplayId } from '@/lib/formatCancelReason';

type Props = {
  ride: RideRequestRow;
};

export function RideCancelledView({ ride }: Props) {
  const navigate = useNavigate();
  const pickupLabel = formatShortAddress(ride.pickup_address, 2);
  const dropoffLabel = formatShortAddress(ride.dropoff_address, 2);
  const reasonBadge = formatCancelReasonBadge(ride.cancel_reason, ride.cancelled_by);
  const displayId = formatRideDisplayId(ride.id);

  const goHome = () => navigate('/', { replace: true });
  const bookAgain = () => navigate('/', { replace: true });

  const handleShare = async () => {
    const text = `Cancelled ride ${displayId}: ${ride.pickup_address ?? 'Pickup'} → ${ride.dropoff_address ?? 'Drop-off'}. Reason: ${reasonBadge}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Roam ride status', text });
        return;
      }
    } catch {
      /* user dismissed */
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Ride details copied');
    } catch {
      toast.message('Share', { description: text });
    }
  };

  return (
    <div className="ride-cancelled-page">
      <header className="ride-cancelled-header">
        <button
          type="button"
          className="ride-cancelled-icon-btn"
          onClick={goHome}
          aria-label="Go back"
        >
          <ArrowLeft className="size-6" strokeWidth={2} />
        </button>
        <h1 className="ride-cancelled-header__title">Ride Status</h1>
        <button
          type="button"
          className="ride-cancelled-icon-btn"
          onClick={() => void handleShare()}
          aria-label="Share ride status"
        >
          <Share2 className="size-6" strokeWidth={2} />
        </button>
      </header>

      <main className="ride-cancelled-main">
        <section className="ride-cancelled-status-card" aria-label="Cancellation status">
          <div className="ride-cancelled-status-card__icon" aria-hidden>
            <CircleX className="size-10" strokeWidth={2} fill="currentColor" />
          </div>
          <div>
            <h2 className="ride-cancelled-status-card__title">Ride Cancelled</h2>
            <p className="ride-cancelled-status-card__id">ID: {displayId}</p>
          </div>
          <p className="ride-cancelled-status-card__badge">{reasonBadge}</p>
        </section>

        <section className="space-y-3" aria-labelledby="ride-cancelled-summary-heading">
          <h3 id="ride-cancelled-summary-heading" className="ride-cancelled-section-label px-1">
            Trip Summary
          </h3>
          <div className="ride-cancelled-summary-card">
            <TripSummaryMap
              pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
              dropoff={{ lat: ride.dropoff_lat, lng: ride.dropoff_lng }}
              encodedPolyline={ride.route_polyline_encoded}
            />
            <div className="ride-cancelled-route">
              <div className="ride-cancelled-route__timeline">
                <div className="ride-cancelled-route__line" aria-hidden />
                <div className="ride-cancelled-route__stop">
                  <div className="ride-cancelled-route__marker ride-cancelled-route__marker--pickup">
                    <span className="ride-cancelled-route__marker--pickup-inner" />
                  </div>
                  <div>
                    <p className="ride-cancelled-route__label">Pickup</p>
                    <p className="ride-cancelled-route__address">{pickupLabel}</p>
                  </div>
                </div>
                <div className="ride-cancelled-route__stop">
                  <div className="ride-cancelled-route__marker ride-cancelled-route__marker--dropoff">
                    <span className="ride-cancelled-route__marker--dropoff-inner" />
                  </div>
                  <div>
                    <p className="ride-cancelled-route__label">Drop-off</p>
                    <p className="ride-cancelled-route__address">{dropoffLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ride-cancelled-actions" aria-label="Support actions">
          <button
            type="button"
            className="ride-cancelled-action-btn"
            onClick={() => toast.message('Support', { description: 'Contact support is coming soon.' })}
          >
            <Headphones className="size-6" strokeWidth={2} />
            Contact Support
          </button>
          <button
            type="button"
            className="ride-cancelled-action-btn"
            onClick={() => navigate('/activity')}
          >
            <History className="size-6" strokeWidth={2} />
            Ride History
          </button>
        </section>
      </main>

      <footer className="ride-cancelled-footer">
        <div className="ride-cancelled-footer__inner">
          <button type="button" className="ride-cancelled-footer__primary" onClick={bookAgain}>
            Book Again
          </button>
          <button type="button" className="ride-cancelled-footer__secondary" onClick={goHome}>
            Back to Home
          </button>
        </div>
      </footer>
    </div>
  );
}
