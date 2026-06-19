import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  BadgeCheck,
  Bell,
  Check,
  Clock,
  CreditCard,
  Fuel,
  Headphones,
  MapPin,
  Search,
  Shield,
  Star,
  Users,
} from 'lucide-react';
import {
  calculateWeeklyPayout,
  DRIVER_APP_URL,
  DRIVER_ONBOARDING_STEPS,
  DRIVER_SUPPORT_ITEMS,
  HEATMAP_IMAGE,
} from '@/lib/driverContent';

export function DriverHeroSection() {
  return (
    <section className="relative flex h-[751px] w-full items-end">
      <div className="absolute inset-0 z-0">
        <img
          alt="Professional Roam driver in a premium vehicle"
          className="h-full w-full object-cover brightness-[0.85]"
          src="/images/driver-hero.png"
        />
      </div>
      <div className="relative z-10 w-full bg-gradient-to-t from-primary/80 via-primary/30 to-transparent px-[var(--spacing-margin-mobile)] pb-12 pt-32">
        <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
          Drive Your Own Success
        </h1>
        <p className="mb-8 max-w-sm text-lg text-white/90">
          Flexible hours, competitive earnings, and full support at every turn.
        </p>
        <div className="flex flex-col gap-3">
          <a
            href={DRIVER_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-secondary-container py-4 text-center text-sm font-medium text-on-secondary-container shadow-lg transition-transform active:scale-95"
          >
            Start Earning Today
          </a>
          <a
            href="#benefits"
            className="rounded-lg border border-white/30 bg-white/10 py-4 text-center text-sm font-medium text-white backdrop-blur-md transition-all hover:bg-white/20"
          >
            Learn More
          </a>
        </div>
      </div>
    </section>
  );
}

export function DriverEarningsCalculator() {
  const [hours, setHours] = useState(40);
  const payout = calculateWeeklyPayout(hours);

  return (
    <section className="bg-surface px-[var(--spacing-margin-mobile)] py-12">
      <div className="glass-card mb-8 rounded-xl border border-outline-variant p-6 shadow-sm">
        <h2 className="mb-2 text-2xl font-semibold text-primary">Estimate Your Earnings</h2>
        <p className="mb-6 text-on-surface-variant">
          See how much you can earn based on your weekly hours.
        </p>
        <div className="space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-primary">Weekly Hours</span>
              <span className="text-2xl font-semibold text-primary">{hours} hrs</span>
            </div>
            <input
              type="range"
              min={1}
              max={80}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-container-high accent-secondary-container"
              aria-label="Weekly hours"
            />
          </div>
          <div className="rounded-lg bg-primary p-6 text-center">
            <span className="mb-1 block text-xs uppercase tracking-widest text-on-primary-container">
              Potential Weekly Payout
            </span>
            <div className="text-4xl font-bold text-white md:text-5xl">
              ${payout.toLocaleString()}
            </div>
            <div className="mt-4 flex justify-center gap-4">
              <div className="flex items-center gap-1 text-xs text-on-primary-container">
                <Check className="h-4 w-4" aria-hidden />
                <span>Weekly Payouts</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-on-primary-container">
                <Star className="h-4 w-4" aria-hidden />
                <span>Peak Bonuses</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DriverBenefitsSection() {
  return (
    <section id="benefits" className="bg-surface-container-low px-[var(--spacing-margin-mobile)] py-12">
      <h2 className="mb-8 text-center text-3xl font-semibold text-primary">Why Roam?</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 rounded-xl border border-outline-variant/30 bg-white p-6 kinetic-shadow">
          <Clock className="mb-4 h-10 w-10 text-secondary-container" aria-hidden />
          <h3 className="mb-2 text-2xl font-semibold">Flexible Schedule</h3>
          <p className="text-on-surface-variant">
            Drive when you want. You are the boss of your own time.
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/30 bg-white p-5 kinetic-shadow">
          <CreditCard className="mb-3 h-6 w-6 text-rides-blue" aria-hidden />
          <h3 className="mb-1 text-sm font-bold text-primary">Keep More</h3>
          <p className="text-[13px] leading-tight text-on-surface-variant">
            Industry leading service fees mean more in your pocket.
          </p>
        </div>
        <div className="rounded-xl border border-outline-variant/30 bg-white p-5 kinetic-shadow">
          <Fuel className="mb-3 h-6 w-6 text-error" aria-hidden />
          <h3 className="mb-1 text-sm font-bold text-primary">Fuel Savings</h3>
          <p className="text-[13px] leading-tight text-on-surface-variant">
            Exclusive discounts at over 5,000 stations nationwide.
          </p>
        </div>
        <div className="relative col-span-2 overflow-hidden rounded-xl bg-fleet-slate p-6 text-white">
          <div className="relative z-10">
            <BadgeCheck className="mb-4 h-10 w-10 text-dash-cyan" aria-hidden />
            <h3 className="mb-2 text-2xl font-semibold">Safety & Insurance</h3>
            <p className="text-white/70">
              Full coverage from the moment you go online until you finish your shift.
            </p>
          </div>
          <Shield
            className="absolute -bottom-10 -right-10 h-[180px] w-[180px] opacity-10"
            aria-hidden
          />
        </div>
      </div>
    </section>
  );
}

export function DriverOnboardingSection() {
  return (
    <section className="bg-white px-[var(--spacing-margin-mobile)] py-16">
      <h2 className="mb-12 text-3xl font-semibold text-primary">Getting Started</h2>
      <div className="space-y-12">
        {DRIVER_ONBOARDING_STEPS.map((step, index) => (
          <div key={step.step} className="flex gap-6">
            <div className="flex flex-col items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {step.step}
              </div>
              {index < DRIVER_ONBOARDING_STEPS.length - 1 && (
                <div className="mt-2 w-px flex-grow bg-outline-variant" />
              )}
            </div>
            <div>
              <h3 className="mb-3 text-2xl font-semibold">{step.title}</h3>
              {'items' in step && step.items ? (
                <ul className="space-y-3">
                  {step.items.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-on-surface-variant" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-on-surface-variant">{step.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-72 shrink-0 snap-center rounded-[40px] border-4 border-slate-900 bg-surface-container-highest p-3 shadow-2xl">
      {children}
    </div>
  );
}

export function DriverAppShowcaseSection() {
  return (
    <section className="overflow-hidden bg-primary py-16">
      <div className="mb-10 px-[var(--spacing-margin-mobile)]">
        <h2 className="mb-4 text-3xl font-semibold text-white">
          Precision Engineering for Drivers
        </h2>
        <p className="text-on-primary-container">
          The Roam Driver App is built for high-performance logistics.
        </p>
      </div>

      <div className="flex snap-x gap-6 overflow-x-auto px-[var(--spacing-margin-mobile)] pb-8 no-scrollbar">
        <PhoneFrame>
          <div className="relative h-[480px] overflow-hidden rounded-[32px] bg-white">
            <div className="flex h-12 items-center justify-between bg-primary px-6">
              <span className="text-xs font-bold text-white">Earnings Dashboard</span>
              <Bell className="h-4 w-4 text-white" aria-hidden />
            </div>
            <div className="p-6">
              <div className="mb-4 flex h-24 w-full flex-col justify-center rounded-lg bg-surface-container-low px-4">
                <span className="text-[10px] uppercase tracking-tighter text-on-surface-variant">
                  Current Balance
                </span>
                <div className="text-2xl font-bold">$184.50</div>
              </div>
              <div className="space-y-4">
                <div className="flex h-32 items-end justify-between gap-2 rounded-lg bg-surface-container px-4 pb-4">
                  {[80, 60, 95, 40, 70].map((h, i) => (
                    <div
                      key={i}
                      className="w-full rounded-t-sm bg-primary"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between rounded-lg border border-outline-variant p-3">
                  <span className="text-sm font-medium">Weekly Total</span>
                  <span className="text-sm font-bold text-rides-blue">$1,240.00</span>
                </div>
              </div>
            </div>
          </div>
        </PhoneFrame>

        <PhoneFrame>
          <div className="relative h-[480px] overflow-hidden rounded-[32px] bg-white">
            <div className="absolute inset-0 bg-slate-200">
              <img src={HEATMAP_IMAGE} alt="High demand zone map" className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/30 via-red-500/40 to-transparent mix-blend-multiply" />
            </div>
            <div className="absolute inset-x-4 top-4 flex h-12 items-center gap-3 rounded-full bg-white/90 px-6 shadow-md backdrop-blur">
              <Search className="h-4 w-4 text-rides-blue" aria-hidden />
              <span className="text-xs font-bold uppercase tracking-widest">High Demand Zone</span>
            </div>
            <div className="absolute inset-x-6 bottom-6">
              <button type="button" className="w-full rounded-full bg-primary py-3 font-bold text-white shadow-lg">
                Go Online
              </button>
            </div>
          </div>
        </PhoneFrame>

        <PhoneFrame>
          <div className="h-[480px] overflow-hidden rounded-[32px] bg-white">
            <div className="flex h-12 items-center bg-primary px-6">
              <span className="text-xs font-bold text-white">Trip Details</span>
            </div>
            <div className="space-y-4 p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container">
                  <Users className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <div>
                  <div className="text-sm font-bold">Marcus Chen</div>
                  <div className="text-xs text-on-surface-variant">Airport Terminal 4</div>
                </div>
              </div>
              <div className="h-px bg-outline-variant" />
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-on-surface-variant">Estimated Earnings</span>
                  <span className="font-bold">$24.50 + $5 Tip</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-on-surface-variant">Distance</span>
                  <span className="font-bold">12.4 miles</span>
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-lg bg-secondary-container py-3 font-bold text-on-secondary-container"
              >
                Accept Trip
              </button>
            </div>
          </div>
        </PhoneFrame>
      </div>
    </section>
  );
}

export function DriverSupportSection() {
  const icons = {
    support: Headphones,
    community: Users,
    location: MapPin,
  };

  return (
    <section className="px-[var(--spacing-margin-mobile)] py-16">
      <h2 className="mb-8 text-2xl font-semibold text-primary">We&apos;re with you every mile</h2>
      <div className="space-y-4">
        {DRIVER_SUPPORT_ITEMS.map((item) => {
          const Icon = icons[item.icon];
          return (
            <div
              key={item.title}
              className="flex items-center gap-4 rounded-xl border border-outline-variant/50 bg-white p-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container-high">
                <Icon className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <div>
                <h4 className="text-sm font-bold text-primary">{item.title}</h4>
                <p className="text-[13px] text-on-surface-variant">{item.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DriverCtaSection() {
  return (
    <section className="bg-primary px-[var(--spacing-margin-mobile)] py-20 text-center">
      <h2 className="mb-6 text-4xl font-bold text-white">Ready to hit the road?</h2>
      <p className="mb-10 text-on-primary-container">
        Join the fleet of professional partners driving the future of mobility.
      </p>
      <a
        href={DRIVER_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-12 block w-full rounded-lg bg-secondary-container py-4 text-2xl font-semibold text-on-secondary-container shadow-lg transition-transform active:scale-95"
      >
        Sign Up to Drive
      </a>
      <div className="flex flex-col items-center gap-4">
        <span className="text-xs uppercase tracking-widest text-on-primary-container">
          Download the App
        </span>
        <div className="flex gap-4">
          <a
            href={DRIVER_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-36 items-center gap-2 rounded border border-white/20 bg-white/10 px-3"
          >
            <span className="text-white">&#63743;</span>
            <div className="text-left">
              <div className="text-[8px] leading-none text-white/70">Download on the</div>
              <div className="text-sm font-bold leading-none text-white">App Store</div>
            </div>
          </a>
          <a
            href={DRIVER_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 w-36 items-center gap-2 rounded border border-white/20 bg-white/10 px-3"
          >
            <span className="text-white">&#9654;</span>
            <div className="text-left">
              <div className="text-[8px] leading-none text-white/70">GET IT ON</div>
              <div className="text-sm font-bold leading-none text-white">Google Play</div>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
