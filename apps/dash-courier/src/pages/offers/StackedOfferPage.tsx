import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { StackedOffer } from '@/lib/mockOffers';

const STACKED_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBQo5FpPW3-pSVLLvqJo2yyY3muQLypOLZEd9dtuTOfVGOZZEvu6dNHaVwrEhL7eZfKK4Ukdddbbdu1rSsz2PZiL4K1rEXMjWtrDkqN1FeeeOt8T8CwYKZk_ORY7qv9D_nhXk2uCXUJessjR0mY56c0cUeKRJb9q8BSABeTbZyDcEyX8gX_OzvWe1RTghuWQ9mFoIAt_sKnda5kmSaW0LBRtpbvT1doxMC8b-v21ivDVn-0AH12Ts5eO7uvjHcTsMmlqVLu4BIJdzk';

type StackedOfferPageProps = {
  offer: StackedOffer;
  initialSeconds?: number;
  onTimerExpire: () => void;
  onDecline: () => void;
  onAccept: () => void;
};

function stopIcon(vertical?: string) {
  if (vertical === 'grocery') return 'shopping_bag';
  if (vertical === 'restaurant') return 'restaurant';
  return 'storefront';
}

export function StackedOfferPage({ offer, onDecline, onAccept }: StackedOfferPageProps) {
  return (
    <div className="flex min-h-0 h-full w-full flex-col overflow-hidden bg-background">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-4 pt-safe backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button type="button" className="rounded-full p-2 text-primary transition-transform active:scale-95">
            <MaterialIcon name="menu" />
          </button>
          <h1 className="text-headline-md font-bold text-primary">Earnings</h1>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-secondary-container px-3 py-1">
          <MaterialIcon name="account_balance_wallet" className="text-lg text-on-secondary-container" />
          <span className="text-label-lg font-semibold text-on-secondary-container">
            ${offer.totalEarnings} JMD
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-4 pb-28 pt-20">
        <div className="relative mb-6 h-48 overflow-hidden rounded-xl border border-outline-variant shadow-sm">
          <img alt="" src={STACKED_MAP} className="h-full w-full object-cover opacity-80" />
          <div className="absolute left-4 top-4">
            <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-label-md font-semibold text-on-primary shadow-lg">
              <MaterialIcon name="auto_awesome" className="text-sm" />
              Efficient route
            </span>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="mb-1 text-headline-lg-mobile font-bold text-on-surface">
            Stacked delivery — {offer.stops.length} stops
          </h2>
          <div className="flex items-center gap-2 text-on-surface-variant">
            <MaterialIcon name="timer" className="text-lg" />
            <span className="text-body-md">Approx. {offer.estMinutes} mins total</span>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-outline-variant bg-surface p-4 shadow-sm">
          <div className="relative">
            {offer.stops.map((stop, index) => (
              <div key={stop.id} className={`relative flex gap-4 ${index < offer.stops.length - 1 ? 'pb-8' : ''}`}>
                {index < offer.stops.length - 1 && (
                  <div
                    className="absolute bottom-0 left-4 top-8 w-0.5"
                    style={{
                      background:
                        'repeating-linear-gradient(to bottom, #707a6c 0, #707a6c 4px, transparent 4px, transparent 8px)',
                    }}
                  />
                )}
                <div
                  className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                    stop.vertical === 'grocery'
                      ? 'border-secondary/20 bg-secondary-container/30'
                      : 'border-primary/20 bg-primary-container/20'
                  }`}
                >
                  <MaterialIcon
                    name={stopIcon(stop.vertical)}
                    className={stop.vertical === 'grocery' ? 'text-secondary' : 'text-primary'}
                    filled
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={`mb-1 text-label-md uppercase tracking-wider ${
                          stop.vertical === 'grocery' ? 'text-secondary' : 'text-primary'
                        }`}
                      >
                        Stop {stop.label} · {stop.vertical === 'grocery' ? 'Grocery' : 'Restaurant'}
                      </p>
                      <h3 className="text-headline-md font-bold text-on-surface">{stop.restaurant}</h3>
                    </div>
                    <span className="shrink-0 text-label-lg font-semibold text-on-surface-variant">
                      {stop.distanceLabel}
                    </span>
                  </div>
                  {stop.detail && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-2">
                      {stop.detail.includes('Ready') && (
                        <MaterialIcon name="check_circle" className="animate-pulse text-lg text-primary" />
                      )}
                      <span className="text-body-md text-on-surface-variant">{stop.detail}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex gap-4 pt-2">
              <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline bg-surface-container-highest">
                <MaterialIcon name="person_pin_circle" className="text-on-surface-variant" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-label-md uppercase tracking-wider text-on-surface-variant">
                      Final Destination
                    </p>
                    <h3 className="text-headline-md font-bold text-on-surface">
                      Deliver to {offer.customerName ?? 'Customer'}
                    </h3>
                  </div>
                  {offer.customerDistanceKm != null && (
                    <span className="text-label-lg font-semibold text-on-surface-variant">
                      {offer.customerDistanceKm} km
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-md text-on-surface-variant">Total route: {offer.totalDistanceKm} km</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 flex items-center justify-between rounded-xl border border-primary/20 bg-primary-container/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <MaterialIcon name="payments" className="text-on-primary" />
            </div>
            <div>
              <p className="text-label-md text-primary">Potential Earnings</p>
              <p className="text-headline-md font-bold text-on-primary-container">${offer.totalEarnings} JMD</p>
            </div>
          </div>
          <button type="button" className="rounded-full p-2 transition-colors hover:bg-primary/10">
            <MaterialIcon name="info" className="text-primary" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-label-lg font-semibold text-on-primary shadow-md transition-all hover:bg-primary/90 active:scale-95"
          >
            Accept Offer
            <MaterialIcon name="chevron_right" />
          </button>
          <button
            type="button"
            onClick={onDecline}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-surface-container-high text-label-lg font-semibold text-on-surface-variant transition-all active:scale-95"
          >
            Decline
          </button>
        </div>
      </main>
    </div>
  );
}
