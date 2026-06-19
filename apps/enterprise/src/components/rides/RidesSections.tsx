import { useRef } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Car,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Crown,
  Headphones,
  MapPin,
  Navigation,
  QrCode,
  ShieldAlert,
  Bus,
} from 'lucide-react';
import {
  RIDES_APP_STEPS,
  RIDES_APP_URL,
  RIDES_FEATURES,
  RIDES_PRICING_POINTS,
  RIDES_SAFETY_ITEMS,
  RIDES_SERVICE_TYPES,
  SAFETY_IMAGE,
} from '@/lib/ridesContent';

const featureIcons = {
  'user-plus': (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 7a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6" />
    </svg>
  ),
  calendar: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  locate: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11a3 3 0 100-6 3 3 0 000 6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4.5 8-11a8 8 0 10-16 0c0 6.5 8 11 8 11z" />
    </svg>
  ),
  wallet: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1M6 6h12a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" />
    </svg>
  ),
  receipt: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4M7 3h10a2 2 0 012 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 012-2z" />
    </svg>
  ),
  'shield-heart': (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

const safetyIcons = {
  verified: BadgeCheck,
  headphones: Headphones,
  'shield-alert': ShieldAlert,
};

export function RidesHeroSection() {
  return (
    <section className="relative flex min-h-[85vh] items-end overflow-hidden md:items-center">
      <div className="absolute inset-0 z-0">
        <img
          alt="Passengers enjoying a premium ride in a luxury vehicle"
          className="h-full w-full object-cover"
          src="/images/rides-hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-on-surface/60 via-on-surface/20 to-transparent" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] py-[var(--spacing-gutter)] md:px-[var(--spacing-margin-desktop)]">
        <div className="max-w-2xl text-white">
          <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">Your Ride, Your Way</h1>
          <p className="mb-8 text-lg opacity-90">
            Safe, reliable, and affordable rides at your fingertips. Engineered for the modern
            professional and the weekend explorer.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href={RIDES_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-secondary-container px-8 py-4 text-center text-sm font-medium text-on-secondary-container shadow-lg transition-transform hover:-translate-y-0.5 active:scale-95"
            >
              Download the App
            </a>
            <a
              href={RIDES_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card rounded-full px-8 py-4 text-center text-sm font-medium text-on-surface transition-all hover:bg-white active:scale-95"
            >
              Book a Ride
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RidesFeaturesSection() {
  return (
    <section className="bg-surface-muted py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)]">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-fleet-slate">
            Precision Performance
          </h2>
          <p className="mx-auto max-w-lg text-on-surface-variant">
            Seamless mobility through every layer of the urban grid.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {RIDES_FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="group rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 transition-shadow hover:shadow-md"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                {featureIcons[feature.icon]}
              </div>
              <h3 className="mb-2 text-2xl font-semibold text-fleet-slate">{feature.title}</h3>
              <p className="text-on-surface-variant">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RidesFleetCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -300 : 300,
      behavior: 'smooth',
    });
  };

  return (
    <section className="overflow-hidden py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)]">
        <div className="mb-12 flex flex-col items-end justify-between gap-4 md:flex-row">
          <div>
            <h2 className="mb-2 text-3xl font-semibold tracking-tight text-fleet-slate">
              The Roam Fleet
            </h2>
            <p className="text-on-surface-variant">Tailored mobility solutions for every scenario.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="rounded-full border border-outline p-2 transition-colors hover:bg-surface-container"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="rounded-full border border-outline p-2 transition-colors hover:bg-surface-container"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="-mx-[var(--spacing-margin-mobile)] flex snap-x gap-[var(--spacing-gutter)] overflow-x-auto px-[var(--spacing-margin-mobile)] pb-8 no-scrollbar"
        >
          {RIDES_SERVICE_TYPES.map((service) => (
            <article
              key={service.title}
              className="min-w-[280px] snap-start overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest transition-shadow hover:shadow-xl md:min-w-[340px]"
            >
              <div className="h-48 overflow-hidden">
                <img
                  src={service.image}
                  alt={service.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-6">
                <h4 className="mb-2 text-2xl font-semibold text-fleet-slate">{service.title}</h4>
                <p className="mb-6 text-on-surface-variant">{service.description}</p>
                <a
                  href={RIDES_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 text-sm font-medium text-primary"
                >
                  Learn More
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RidesSafetySection() {
  return (
    <section className="bg-primary py-24 text-white">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)]">
        <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
          <div>
            <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
              Safety in Every Mile
            </h2>
            <p className="mb-8 text-lg opacity-80">
              Your security is our core operational metric. We&apos;ve built safety into every line
              of code and every street we navigate.
            </p>
            <ul className="space-y-6">
              {RIDES_SAFETY_ITEMS.map((item) => {
                const Icon = safetyIcons[item.icon];
                return (
                  <li key={item.title} className="flex items-start gap-4">
                    <Icon className="mt-0.5 h-6 w-6 shrink-0 text-secondary-container" aria-hidden />
                    <div>
                      <h4 className="text-lg font-bold">{item.title}</h4>
                      <p className="opacity-70">{item.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="relative">
            <div className="flex aspect-square items-center justify-center rounded-full bg-on-primary-fixed-variant/20 p-8">
              <img
                src={SAFETY_IMAGE}
                alt="Vehicle safety dashboard with shield icon"
                className="h-full w-full rounded-full border-4 border-white/10 object-cover"
              />
            </div>
            <div className="glass-card absolute -left-4 bottom-8 rounded-xl p-6 text-on-surface shadow-2xl">
              <p className="text-2xl font-bold">100%</p>
              <p className="text-sm font-medium">Insured Journeys</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RidesPricingSection() {
  return (
    <section className="border-b border-outline-variant/30 py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-center">
        <div className="mb-4 inline-block rounded-full bg-secondary-container/10 px-4 py-1">
          <span className="text-sm font-medium text-secondary">Honest Economics</span>
        </div>
        <h2 className="mb-4 text-3xl font-semibold tracking-tight text-fleet-slate">
          Transparent Pricing
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-lg text-on-surface-variant">
          Know your fare before you book. No hidden fees, no surprises. Our algorithmic pricing
          ensures the best value for every kilometer.
        </p>
        <div className="flex flex-wrap justify-center gap-[var(--spacing-gutter)]">
          {RIDES_PRICING_POINTS.map((point) => (
            <div key={point} className="flex items-center gap-3">
              <CheckCheck className="h-5 w-5 text-primary" aria-hidden />
              <span className="text-sm font-medium">{point}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RidesAppShowcaseSection() {
  return (
    <section className="overflow-hidden bg-surface-container-low py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)]">
        <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
          <div className="order-2 md:order-1">
            <div className="relative mx-auto h-[580px] w-[280px] overflow-hidden rounded-[3rem] border-[8px] border-on-surface-variant bg-on-surface shadow-2xl">
              <div className="flex h-full flex-col gap-4 bg-white p-4 pt-12">
                <div className="relative h-40 w-full overflow-hidden rounded-xl bg-surface-container">
                  <div className="absolute inset-0 bg-[radial-gradient(#000_1px,transparent_1px)] opacity-40 [background-size:16px_16px]" />
                  <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary">
                    <Navigation className="h-4 w-4 text-white" aria-hidden />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant px-3">
                    <MapPin className="h-4 w-4 text-primary" aria-hidden />
                    <span className="text-xs text-on-surface-variant">Current Location</span>
                  </div>
                  <div className="flex h-12 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3">
                    <MapPin className="h-4 w-4 text-error" aria-hidden />
                    <span className="text-xs font-bold">Where to?</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex h-20 flex-1 flex-col items-center justify-center rounded-xl border-2 border-primary bg-primary-fixed">
                    <Car className="h-5 w-5" aria-hidden />
                    <span className="text-[10px] font-bold">Standard</span>
                  </div>
                  <div className="flex h-20 flex-1 flex-col items-center justify-center rounded-xl border border-outline-variant">
                    <Crown className="h-5 w-5" aria-hidden />
                    <span className="text-[10px]">Comfort</span>
                  </div>
                  <div className="flex h-20 flex-1 flex-col items-center justify-center rounded-xl border border-outline-variant">
                    <Bus className="h-5 w-5" aria-hidden />
                    <span className="text-[10px]">Fleet</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-auto h-12 rounded-lg bg-primary text-sm font-bold text-white"
                >
                  Confirm Booking
                </button>
              </div>
            </div>
          </div>

          <div className="order-1 md:order-2">
            <h2 className="mb-6 text-3xl font-semibold tracking-tight text-fleet-slate">
              Designed for Seamless Flow
            </h2>
            <p className="mb-8 text-lg text-on-surface-variant">
              The Roam app is a masterpiece of kinetic design. From intuitive map interactions to
              lightning-fast car selection, every gesture is optimized for speed and clarity.
            </p>
            <div className="space-y-4">
              {RIDES_APP_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="flex items-center gap-4 rounded-xl p-4 transition-colors hover:bg-white"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                    {item.step}
                  </span>
                  <div>
                    <p className="font-bold">{item.title}</p>
                    <p className="text-sm opacity-70">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function RidesDownloadCtaSection() {
  return (
    <section className="border-t border-outline-variant bg-surface py-24 text-on-surface">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-center">
        <h2 className="mb-8 text-4xl font-bold tracking-tight">Ready to Move?</h2>
        <div className="flex flex-col items-center justify-center gap-[var(--spacing-gutter)] md:flex-row">
          <div className="rounded-2xl border border-outline-variant bg-white p-4 shadow-sm">
            <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg bg-surface-container-high">
              <div className="absolute inset-0 bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-primary via-on-surface-variant to-primary opacity-20" />
              <QrCode className="relative h-12 w-12 text-primary" aria-hidden />
            </div>
            <p className="mt-4 text-sm font-medium">Scan to download</p>
          </div>

          <div className="flex flex-col gap-4">
            <a
              href={RIDES_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-56 items-center gap-3 rounded-xl bg-on-surface px-8 py-3 text-white transition-transform active:scale-95"
            >
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M3.609 1.814L13.792 12 3.61 22.186a1.003 1.003 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.802 8.99l-2.303 2.303-8.635-8.635z" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] uppercase opacity-70">Get it on</p>
                <p className="text-lg font-bold leading-tight">Google Play</p>
              </div>
            </a>
            <a
              href={RIDES_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-56 items-center gap-3 rounded-xl bg-on-surface px-8 py-3 text-white transition-transform active:scale-95"
            >
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-2.86 2.45-1.28 0-1.64-1.06-3.07-1.06-1.43 0-1.84 1.06-3.12 1.06-1.15 0-2.03-1.21-2.86-2.45C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.07.87.57 0 2.04-.88 3.44-.75 1.58.03 2.96.92 3.83 2.35-3.37 2.05-2.83 7.4 1.05 9.05zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] uppercase opacity-70">Download on the</p>
                <p className="text-lg font-bold leading-tight">App Store</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
