import { useEffect, useRef } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useCountdown } from '@/hooks/useCountdown';
import type { SingleOffer } from '@/lib/mockOffers';

const MAP_PREVIEW =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBgOYXXmKCfXKrKEf-fZhopfbu7TV6DxKUOSjQ8zqx5RIccJsmpZvb-o6rDmSgKgHEwhY7ViLdPaCUhll0wv7XSV2EItA63XgyykoD_6seB2gWcsLrQeIiKiSBCu5w9e7Vv7Vj-Qs5b_VOJCLvblF23KRKLzF6FhZUchZzC-4Di0GeVmEq4uHdILyfyhLurN1v3kgTmL3p1NnWux-HEF3sdqyWYIMAeXjoLTt2Fp8WFdHYYshZqlhhBPUM-4l332fNcOocDdN2tShw';

const TIMER_CIRCUMFERENCE = 213.6;

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
  initialSeconds = 45,
  onClose,
  onTimerExpire,
  onDecline,
  onAccept,
  onViewDetails,
  onOfferShown,
}: DeliveryOfferPageProps) {
  const shownRef = useRef(false);
  const { seconds } = useCountdown(initialSeconds, onTimerExpire);
  const progress = seconds / initialSeconds;
  const ringOffset = TIMER_CIRCUMFERENCE * (1 - progress);
  const urgent = seconds < 10;
  const storeName = offer.storeName ?? offer.restaurant;
  const isGrocery = offer.vertical_type === 'grocery' || offer.fulfillment_type === 'pick_and_pack';

  useEffect(() => {
    if (!shownRef.current) {
      shownRef.current = true;
      onOfferShown?.();
    }
  }, [onOfferShown]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-col overflow-hidden bg-surface-container-lowest shadow-2xl">
      <div className="relative h-48 shrink-0">
        <img alt="" src={MAP_PREVIEW} className="h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-surface-container-lowest" />
        <div className="absolute left-4 right-4 top-4 z-10 flex justify-between">
          <div className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface/90 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <MaterialIcon name="navigation" className="text-lg text-primary" />
            <span className="text-label-lg font-semibold text-on-surface">{offer.totalDistanceKm} km total</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-outline-variant/30 bg-surface/90 px-3 py-1.5 shadow-sm backdrop-blur-md">
            <MaterialIcon name="schedule" className="text-lg text-primary" />
            <span className="text-label-lg font-semibold text-on-surface">{offer.estMinutes} min total</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-16 rounded-full bg-surface/90 p-2 shadow-sm backdrop-blur-md"
        >
          <MaterialIcon name="close" />
        </button>
      </div>

      <main className="relative z-20 -mt-6 flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-36">
        <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-lg">
          <div>
            <p className="text-label-md uppercase tracking-wider text-on-surface-variant">Guaranteed Earnings</p>
            <h1 className="text-headline-lg-mobile font-extrabold text-primary">${offer.earnings} JMD</h1>
          </div>
          <div className="relative flex h-20 w-20 items-center justify-center">
            <svg className="h-20 w-20 -rotate-90">
              <circle
                className="text-surface-container-high"
                cx="40"
                cy="40"
                fill="transparent"
                r="34"
                stroke="currentColor"
                strokeWidth="6"
              />
              <circle
                className={urgent ? 'text-error' : 'text-primary'}
                cx="40"
                cy="40"
                fill="transparent"
                r="34"
                stroke="currentColor"
                strokeDasharray={TIMER_CIRCUMFERENCE}
                strokeDashoffset={ringOffset}
                strokeWidth="6"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <span className={`absolute text-headline-md font-bold ${urgent ? 'text-error' : 'text-on-surface'}`}>
              {seconds}s
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onViewDetails}
          className="overflow-hidden rounded-xl border border-outline-variant/40 bg-surface text-left shadow-sm active:scale-[0.99]"
        >
          <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10">
                <MaterialIcon name="storefront" className="text-primary" filled />
              </div>
              <div>
                <h2 className="text-headline-md font-bold leading-tight text-on-surface">{storeName}</h2>
                <span className="mt-0.5 inline-block rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-tighter text-on-secondary-container">
                  {isGrocery ? 'Grocery' : 'Restaurant'}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-label-md text-on-surface-variant">Pickup</p>
              <p className="text-label-lg font-semibold text-on-surface">{offer.pickupDistanceKm} km</p>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <MaterialIcon name="shopping_basket" className="text-lg" />
                  <span className="text-label-md">Order Size</span>
                </div>
                <p className="text-label-lg font-semibold text-on-surface">~{offer.itemCount} items</p>
              </div>
              <div className="flex flex-col gap-1 rounded-lg bg-surface-container-low p-3">
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <MaterialIcon name="timer" className="text-lg" />
                  <span className="text-label-md">Est. Shop</span>
                </div>
                <p className="text-label-lg font-semibold text-on-surface">
                  {isGrocery ? '25 min' : `~${Math.max(10, offer.estMinutes - 10)} min`}
                </p>
              </div>
            </div>
            {isGrocery && (
              <div className="flex items-start gap-3 px-1">
                <MaterialIcon name="info" className="mt-0.5 text-on-surface-variant" />
                <p className="text-body-md leading-relaxed text-on-surface-variant">
                  <span className="font-bold text-on-surface">Pick & pack order:</span> Ensure cold items are selected
                  last to maintain freshness. Use the Roam Dash insulated bag.
                </p>
              </div>
            )}
          </div>
        </button>

        <div className="flex items-center gap-4 px-2">
          <div className="flex flex-col items-center">
            <div className="h-3 w-3 rounded-full border-2 border-primary bg-background" />
            <div className="h-8 border-l-2 border-dashed border-outline-variant" />
            <div className="h-3 w-3 rounded-full bg-tertiary" />
          </div>
          <div className="flex flex-1 items-center justify-between py-1">
            <p className="text-label-lg font-semibold text-on-surface">Dropoff Point</p>
            <p className="text-label-md text-on-surface-variant">{offer.dropoffDistanceKm} km from store</p>
          </div>
        </div>
      </main>

      <section className="fixed bottom-0 left-1/2 z-50 w-full max-w-[430px] -translate-x-1/2 border-t border-outline-variant/20 bg-white/80 p-4 backdrop-blur-md">
        <div className="flex h-14 gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-xl border-2 border-outline text-label-lg font-semibold text-on-surface transition-all hover:bg-surface-container-high active:scale-95"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-primary text-label-lg font-semibold text-on-primary shadow-lg shadow-primary/20 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <MaterialIcon name="check_circle" />
            Accept Offer
          </button>
        </div>
      </section>
    </div>
  );
}
