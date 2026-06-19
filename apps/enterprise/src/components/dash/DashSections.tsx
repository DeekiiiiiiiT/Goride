import { useState } from 'react';
import {
  History,
  LayoutDashboard,
  MapPin,
  Percent,
  ShoppingCart,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import {
  CUSTOMER_FEATURES,
  CUSTOMER_FLOW,
  DASH_APP_MOCKUP,
  DASH_CUSTOMER_URL,
  DASH_MERCHANT_URL,
  DASH_PORTAL_MOCKUP,
  MERCHANT_BENEFITS,
  MERCHANT_FLOW,
  MERCHANT_KITCHEN_IMAGE,
} from '@/lib/dashContent';

const customerIcons = {
  restaurant: UtensilsCrossed,
  cart: ShoppingCart,
  tracking: MapPin,
  payment: Wallet,
  history: History,
};

const merchantIcons = {
  trending: TrendingUp,
  dashboard: LayoutDashboard,
  percent: Percent,
};

type FlowTab = 'customer' | 'merchant';

export function DashHeroSection() {
  return (
    <section className="relative flex min-h-[80vh] items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          alt="Food delivery handoff at a modern office building"
          className="h-full w-full object-cover brightness-[0.4]"
          src="/images/dash-hero.png"
        />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-white md:px-[var(--spacing-margin-desktop)]">
        <div className="max-w-2xl">
          <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">
            Delicious Food, <span className="text-secondary-container">Delivered Fast</span>
          </h1>
          <p className="mb-8 text-lg opacity-90">
            Order from your favorite local restaurants and experience professional-grade logistics
            with every bite.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href={DASH_CUSTOMER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-secondary-container px-8 py-4 text-center text-sm font-medium text-on-secondary-container shadow-lg transition-all hover:bg-secondary-container/90 active:scale-95"
            >
              Order Now
            </a>
            <a
              href={DASH_MERCHANT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/20 bg-white/10 px-8 py-4 text-center text-sm font-medium backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
            >
              Partner Your Restaurant
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashCustomerFeaturesSection() {
  return (
    <section className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] py-20 md:px-[var(--spacing-margin-desktop)]">
      <div className="mb-16 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-dash-cyan">Experience</span>
        <h2 className="mt-2 text-3xl font-semibold">Elevating the Customer Journey</h2>
      </div>
      <div className="grid grid-cols-1 gap-[var(--spacing-gutter)] md:grid-cols-3 lg:grid-cols-5">
        {CUSTOMER_FEATURES.map((feature) => {
          const Icon = customerIcons[feature.icon];
          return (
            <div
              key={feature.title}
              className="kinetic-shadow rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-8 transition-transform hover:-translate-y-1"
            >
              <Icon className="mb-6 h-10 w-10 text-dash-cyan" aria-hidden />
              <h3 className="mb-2 text-2xl font-semibold">{feature.title}</h3>
              <p className="text-on-surface-variant">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DashMerchantSection() {
  return (
    <section className="overflow-hidden bg-fleet-slate py-24 text-white">
      <div className="mx-auto grid max-w-[var(--spacing-container-max)] items-center gap-16 px-[var(--spacing-margin-mobile)] md:grid-cols-2 md:px-[var(--spacing-margin-desktop)]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-dash-cyan">
            Enterprise Logistics
          </span>
          <h2 className="mb-8 mt-4 text-3xl font-semibold">
            Scale Your Business with Kinetic Precision
          </h2>
          <div className="space-y-8">
            {MERCHANT_BENEFITS.map((item) => {
              const Icon = merchantIcons[item.icon];
              return (
                <div key={item.title} className="flex gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/10">
                    <Icon className="h-6 w-6 text-secondary-container" aria-hidden />
                  </div>
                  <div>
                    <h4 className="text-2xl font-semibold">{item.title}</h4>
                    <p className="opacity-70">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <img
              src={MERCHANT_KITCHEN_IMAGE}
              alt="Chef using tablet in professional kitchen"
              className="h-96 w-full rounded-xl object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashHowItWorksSection() {
  const [tab, setTab] = useState<FlowTab>('customer');
  const flow = tab === 'customer' ? CUSTOMER_FLOW : MERCHANT_FLOW;
  const accent = tab === 'customer' ? 'dash-cyan' : 'secondary-container';

  return (
    <section className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] py-24 md:px-[var(--spacing-margin-desktop)]">
      <div className="mb-16 text-center">
        <h2 className="text-3xl font-semibold">How It Works</h2>
      </div>
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 flex justify-center gap-8 border-b border-outline-variant">
          <button
            type="button"
            onClick={() => setTab('customer')}
            className={`pb-4 text-sm font-medium transition-colors ${
              tab === 'customer'
                ? 'border-b-2 border-secondary-container text-on-surface'
                : 'text-on-surface-variant'
            }`}
          >
            For Customers
          </button>
          <button
            type="button"
            onClick={() => setTab('merchant')}
            className={`pb-4 text-sm font-medium transition-colors ${
              tab === 'merchant'
                ? 'border-b-2 border-secondary-container text-on-surface'
                : 'text-on-surface-variant'
            }`}
          >
            For Restaurants
          </button>
        </div>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {flow.map((step) => (
            <div key={step.step} className="text-center">
              <div
                className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 bg-surface-container ${
                  accent === 'dash-cyan' ? 'border-dash-cyan' : 'border-secondary-container'
                }`}
              >
                <span
                  className={`text-2xl font-semibold ${
                    accent === 'dash-cyan' ? 'text-dash-cyan' : 'text-secondary-container'
                  }`}
                >
                  {step.step}
                </span>
              </div>
              <h5 className="mb-1 text-sm font-medium">{step.title}</h5>
              <p className="text-sm opacity-60">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function DashPreviewSection() {
  return (
    <section className="bg-surface-muted px-[var(--spacing-margin-mobile)] py-24 md:px-[var(--spacing-margin-desktop)]">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <div className="flex flex-col items-center gap-[var(--spacing-gutter)] lg:flex-row">
          <div className="flex w-full flex-col items-center lg:w-1/3">
            <div className="relative mb-6 h-[560px] w-[280px] overflow-hidden rounded-[3rem] border-[8px] border-slate-800 bg-black shadow-2xl">
              <div className="absolute left-1/2 top-0 z-20 h-6 w-1/3 -translate-x-1/2 rounded-b-xl bg-slate-800" />
              <img src={DASH_APP_MOCKUP} alt="Roam Dash customer app" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <p className="text-center text-sm text-on-surface-variant">Intuitive Customer App</p>
          </div>

          <div className="w-full lg:w-2/3">
            <div className="mb-6 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-2 shadow-2xl">
              <div className="mb-2 flex h-6 w-full items-center gap-2 bg-slate-100 px-4">
                <div className="h-2 w-2 rounded-full bg-red-400" />
                <div className="h-2 w-2 rounded-full bg-amber-400" />
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <img
                src={DASH_PORTAL_MOCKUP}
                alt="Roam Dash merchant portal dashboard"
                className="aspect-video w-full object-cover"
              />
            </div>
            <p className="text-center text-sm text-on-surface-variant">Powerful Merchant Portal</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashCtaSection() {
  return (
    <section className="px-[var(--spacing-margin-mobile)] py-24 text-center">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-8 text-4xl font-bold tracking-tight md:text-3xl">
          Ready to transform your delivery experience?
        </h2>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <a
            href={DASH_CUSTOMER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-dash-cyan px-10 py-4 text-sm font-medium text-white shadow-md transition-all hover:brightness-110 active:scale-95"
          >
            Start Ordering
          </a>
          <a
            href={DASH_MERCHANT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-fleet-slate px-10 py-4 text-sm font-medium text-white shadow-md transition-all hover:bg-slate-800 active:scale-95"
          >
            Become a Partner
          </a>
        </div>
      </div>
    </section>
  );
}
