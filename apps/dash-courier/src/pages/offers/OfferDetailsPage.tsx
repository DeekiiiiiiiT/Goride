import React, { useRef } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { useCountdown } from '@/hooks/useCountdown';
import type { SingleOffer } from '@/lib/mockOffers';

const ROUTE_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAmG81cDRs_EbNGa5z8Sog8gNE_hPjDEyeAnUB9IALOjRy7xeP33kq2Drb1fOQXWBnbz0PA64TqezF3cqwgNUk5ok1tf2YQhED9idlaER0Vt4GPpRD5npWy1tnDrcxxnnnDnP2lQZ9JBkTLkSXw13nMWHguWMwJnVYaWnCgvE5XQ1RBMQGu-UDG-vPSTWMfwmun_NBeBfjsaQpffU3W9jOTBJQ4osxYPl5VqENWH-Kb95tHNrIwRDfWh0bKrIY-kEXqjvrpi-JJhMg';

type OfferDetailsPageProps = {
  offer: SingleOffer;
  initialSeconds?: number;
  onBack: () => void;
  onTimerExpire: () => void;
  onDecline: () => void;
  onAccept: () => void;
};

export function OfferDetailsPage({
  offer,
  initialSeconds = 24,
  onBack,
  onTimerExpire,
  onDecline,
  onAccept,
}: OfferDetailsPageProps) {
  const { seconds } = useCountdown(initialSeconds, onTimerExpire);
  const touchStartY = useRef(0);
  const dragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    dragging.current = true;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 120) onBack();
  };

  return (
    <div
      className="flex flex-col flex-1 min-h-0 h-full w-full overflow-hidden bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="w-12 h-1 bg-surface-variant rounded-full mx-auto mt-2 shrink-0" />
      <header className="fixed top-0 w-full z-50 bg-surface/90 backdrop-blur-md shadow-sm h-14 flex items-center px-[var(--spacing-edge)] justify-between shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Go back"
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-surface-container-high transition-colors active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <span className="text-xl font-semibold text-on-surface">Offer Details</span>
        <div className="w-10" aria-hidden />
      </header>

      <main className="flex-1 overflow-y-auto mt-14 px-[var(--spacing-edge)] pt-4 pb-36">
        <div className="bg-surface rounded-xl shadow-soft p-4 mb-4 flex flex-col items-center">
          <CountdownRing seconds={seconds} totalSeconds={initialSeconds} size="sm" label="SEC" />
          <p className="text-sm text-on-surface-variant text-center mt-2">Swipe down to dismiss</p>
        </div>

        <div className="bg-primary text-on-primary rounded-xl p-4 mb-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide block opacity-80 mb-1">
              Estimated Earnings
            </span>
            <span className="text-[28px] leading-9 font-bold">J${offer.earnings}</span>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold uppercase tracking-wide block opacity-80 mb-1">
              Total Distance
            </span>
            <span className="text-xl font-semibold">{offer.totalDistanceKm} km</span>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden mb-4 h-48 relative shadow-sm border border-outline-variant/30">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url('${ROUTE_MAP}')` }}
          />
          <div className="absolute top-[30%] left-[20%]">
            <div className="w-8 h-8 bg-surface rounded-full shadow-md flex items-center justify-center border-2 border-primary">
              <MaterialIcon name="restaurant" className="text-primary text-lg" filled />
            </div>
          </div>
          <div className="absolute top-[60%] right-[30%]">
            <div className="absolute w-8 h-8 bg-tertiary rounded-full courier-pulse-circle" />
            <div className="w-8 h-8 bg-tertiary rounded-full shadow-md flex items-center justify-center relative z-10 border-2 border-surface">
              <MaterialIcon name="home" className="text-on-primary text-lg" filled />
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-soft mb-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <div className="p-4 pl-6">
            <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">Pickup</span>
            <h3 className="text-xl font-semibold text-on-surface">{offer.restaurant}</h3>
            <p className="text-sm text-on-surface-variant">{offer.pickupAddress}</p>
            <div className="flex gap-2 mt-4 flex-wrap">
              {offer.cuisine && (
                <span className="inline-flex items-center gap-1 bg-surface-container px-3 py-1.5 rounded-full text-[11px] text-on-surface-variant">
                  <MaterialIcon name="category" className="text-base text-muted" />
                  {offer.cuisine}
                </span>
              )}
              <span className="inline-flex items-center gap-1 bg-success/10 px-3 py-1.5 rounded-full text-[11px] text-success">
                <MaterialIcon name="timer" className="text-base" />
                Usually ready on time
              </span>
            </div>
          </div>
          <div className="h-px bg-surface-container-high w-full" />
          <div className="p-4 pl-6 bg-surface-bright">
            <span className="text-[11px] text-muted uppercase tracking-wider block mb-2">
              Order Items ({offer.itemCount})
            </span>
            <ul className="space-y-2">
              {offer.items.map((item) => (
                <li key={item.name} className="flex items-start gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded">
                    x{item.qty}
                  </span>
                  <span className="text-sm text-on-surface">{item.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-soft mb-4 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary" />
          <div className="p-4 pl-6">
            <span className="text-[11px] text-muted uppercase tracking-wider block mb-1">Dropoff</span>
            <h3 className="text-xl font-semibold text-on-surface">{offer.dropoffLabel}</h3>
            <p className="text-sm text-on-surface-variant">4 min drive from pickup</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {offer.dropoffNotes.map((note) => (
                <span
                  key={note}
                  className="inline-flex items-center gap-1 bg-surface-container px-3 py-1.5 rounded-full text-[11px] text-on-surface-variant"
                >
                  <MaterialIcon
                    name={note.includes('door') ? 'meeting_room' : 'apartment'}
                    className="text-base text-muted"
                  />
                  {note}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-soft mb-4 p-4">
          <span className="text-[11px] text-muted uppercase tracking-wider block mb-4">
            Earnings Breakdown
          </span>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">Base Fare</span>
              <span className="text-sm text-on-surface">J${offer.baseFare}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">
                Distance ({offer.totalDistanceKm}km)
              </span>
              <span className="text-sm text-on-surface">J${offer.distanceFare}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-on-surface-variant">Included Tip</span>
              <span className="text-sm text-success">J${offer.tip}</span>
            </div>
            {offer.peakPay != null && offer.peakPay > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-on-surface-variant">Peak Pay</span>
                <span className="text-sm text-warning">+J${offer.peakPay}</span>
              </div>
            )}
            <div className="h-px bg-surface-container-high w-full my-2" />
            <div className="flex justify-between">
              <span className="text-xl font-semibold text-on-surface">Total</span>
              <span className="text-xl font-semibold text-on-surface">J${offer.earnings}</span>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full bg-surface/90 backdrop-blur-md shadow-[0_-8px_20px_rgba(0,0,0,0.06)] p-4 pb-safe z-50 border-t border-outline-variant/20">
        <div className="flex gap-4 max-w-lg mx-auto">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 bg-surface border border-outline-variant text-on-surface text-xs font-semibold uppercase tracking-wide h-14 rounded-xl flex items-center justify-center gap-1 hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="close" className="text-xl" />
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-[2] bg-primary text-on-primary text-xl font-semibold h-14 rounded-xl shadow-[0_6px_12px_rgba(0,108,73,0.2)] flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95"
          >
            Accept Delivery
            <MaterialIcon name="arrow_forward" className="text-2xl" />
          </button>
        </div>
      </div>
    </div>
  );
}
