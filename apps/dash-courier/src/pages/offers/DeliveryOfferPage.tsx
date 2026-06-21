import React, { useEffect, useRef } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { useCountdown } from '@/hooks/useCountdown';
import type { SingleOffer } from '@/lib/mockOffers';

const MAP_PREVIEW =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDQBH5q7_3ksAQFS8tbjGMja1g2svciZY7QwSfFb9x1g7EVZABCHevLSawNo0oy5IEkSkvRETmYM8FWAA7vR4XdXM5BYAhM-9XVtuxr-SpGre2ZpENYkrslkkqE79uGisVTF9mXOQfTarTlNqdZjPJXHJaP5o6v-1JdpSdVMXNkjJP63q5Hlot8NRRcJWbpGZHC0kDbFG3RRcAw6__hPf1y1OYreXt8TJUGoYH7DHZMg17mCDeg3nOEUG-8T_sPd4dsNFsgoUjmIoQ';

type DeliveryOfferPageProps = {
  offer: SingleOffer;
  initialSeconds?: number;
  onClose: () => void;
  onTimerExpire: () => void;
  onDecline: () => void;
  onAccept: () => void;
  onViewDetails: () => void;
  onOfferShown?: () => void;
};

export function DeliveryOfferPage({
  offer,
  initialSeconds = 90,
  onClose,
  onTimerExpire,
  onDecline,
  onAccept,
  onViewDetails,
  onOfferShown,
}: DeliveryOfferPageProps) {
  const shownRef = useRef(false);
  const { seconds } = useCountdown(initialSeconds, onTimerExpire);

  useEffect(() => {
    if (!shownRef.current) {
      shownRef.current = true;
      onOfferShown?.();
    }
  }, [onOfferShown]);

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden bg-background courier-offer-pulse-border">
      <header className="flex justify-between items-center px-[var(--spacing-edge)] h-14 w-full z-50 bg-surface shadow-sm shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-on-surface hover:bg-surface-container-high transition-colors p-2 rounded-full flex items-center justify-center"
        >
          <MaterialIcon name="close" />
        </button>
        <h1 className="text-xl font-bold text-on-surface uppercase tracking-tight">Delivery Offer</h1>
        <div className="w-10" aria-hidden />
      </header>

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] pt-6 pb-36 flex flex-col gap-6">
        <section className="flex flex-col items-center">
          <CountdownRing seconds={seconds} totalSeconds={initialSeconds} />
          <div className="text-center">
            <h2 className="text-[28px] leading-9 font-bold text-success">J${offer.earnings}</h2>
            {offer.tip > 0 && (
              <p className="text-[11px] text-muted bg-surface-container px-3 py-1 rounded-full mt-2 inline-block">
                Includes J${offer.tip} tip
              </p>
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={onViewDetails}
          className="bg-surface rounded-xl shadow-lg p-4 flex flex-col gap-4 relative overflow-hidden text-left w-full active:scale-[0.99] transition-transform"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
              <MaterialIcon name="restaurant" className="text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-on-surface mb-1">{offer.restaurant}</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-muted flex items-center gap-1">
                <MaterialIcon name="directions_walk" className="text-base" />
                {offer.pickupDistanceKm} km to pickup
              </span>
            </div>
          </div>
          <hr className="border-surface-variant" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-muted uppercase font-medium">Total Distance</span>
              <p className="text-base font-semibold text-on-surface">{offer.totalDistanceKm} km</p>
            </div>
            <div>
              <span className="text-[11px] text-muted uppercase font-medium">Est. Time</span>
              <p className="text-base font-semibold text-on-surface">~{offer.estMinutes} min</p>
            </div>
            <div className="col-span-2">
              <span className="text-[11px] text-muted uppercase font-medium">Dropoff</span>
              <p className="text-sm text-on-surface flex items-center gap-1">
                <MaterialIcon name="location_on" className="text-base text-muted" />
                {offer.dropoffDistanceKm} km to customer
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-[11px] text-muted uppercase font-medium">Items</span>
              <p className="text-sm text-on-surface flex items-center gap-1">
                <MaterialIcon name="shopping_bag" className="text-base text-muted" />
                {offer.itemCount} items
              </p>
            </div>
          </div>
        </button>

        <section className="h-32 rounded-xl overflow-hidden shadow-sm border border-surface-variant relative">
          <img src={MAP_PREVIEW} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface/50 to-transparent" />
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.04)] px-[var(--spacing-edge)] pt-4 pb-safe border-t border-surface-variant md:max-w-md md:mx-auto">
        <div className="flex gap-3 items-stretch pb-4">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 min-h-[60px] rounded-xl text-lg font-bold border-2 border-outline-variant text-muted hover:bg-surface-container-low transition-colors active:scale-95 flex items-center justify-center gap-2"
          >
            <MaterialIcon name="close" className="text-2xl" />
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-[2] min-h-[60px] rounded-xl text-lg font-bold bg-success text-on-primary hover:bg-primary-container transition-colors shadow-lg shadow-success/20 active:scale-95 flex items-center justify-center gap-2"
          >
            <MaterialIcon name="check" className="text-2xl" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
