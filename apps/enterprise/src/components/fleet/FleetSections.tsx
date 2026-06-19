import {
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  Car,
  CheckCircle2,
  CreditCard,
  Fuel,
  Gauge,
  History,
  Landmark,
  LayoutDashboard,
  Map,
  MapPin,
  Plug,
  Receipt,
  Route,
  Shield,
  Star,
  Truck,
  UtensilsCrossed,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  FLEET_APP_URL,
  FLEET_COMMAND_CENTER,
  FLEET_DASHBOARD_HERO,
  FLEET_FEATURES,
  FLEET_INTEGRATIONS,
  FLEET_PRICING,
  FLEET_TESTIMONIALS,
  FLEET_USE_CASES,
} from '@/lib/fleetContent';

const featureIcons = {
  badge: BadgeCheck,
  location: MapPin,
  history: History,
  fuel: Fuel,
  receipt: Receipt,
  build: Wrench,
  monitoring: LayoutDashboard,
  wallet: Wallet,
  security: Shield,
  import: ArrowLeftRight,
};

const accentClasses = {
  secondary: 'text-secondary-container bg-secondary-container/10 group-hover:bg-secondary-container/20',
  'rides-blue': 'text-rides-blue bg-rides-blue/10 group-hover:bg-rides-blue/20',
  'haul-indigo': 'text-haul-indigo bg-haul-indigo/10 group-hover:bg-haul-indigo/20',
  'dash-cyan': 'text-dash-cyan bg-dash-cyan/10 group-hover:bg-dash-cyan/20',
};

const useCaseIcons = {
  taxi: Car,
  delivery: UtensilsCrossed,
  business: Building2,
  rental: Truck,
};

const useCaseAccent = {
  'rides-blue': 'bg-rides-blue/10 text-rides-blue',
  'haul-indigo': 'bg-haul-indigo/10 text-haul-indigo',
  'dash-cyan': 'bg-dash-cyan/10 text-dash-cyan',
  secondary: 'bg-secondary-container/10 text-secondary-container',
};

const integrationIcons = {
  api: Plug,
  erp: Landmark,
  card: CreditCard,
  map: Map,
};

export function FleetHeroSection() {
  return (
    <section className="kinetic-gradient relative overflow-hidden px-[var(--spacing-margin-mobile)] pb-20 pt-16 text-white">
      <div className="relative z-10 mx-auto flex max-w-[var(--spacing-container-max)] flex-col items-center text-center">
        <span className="mb-4 text-xs font-semibold uppercase tracking-widest text-secondary-container">
          Enterprise Logistics
        </span>
        <h1 className="mb-6 max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
          Complete Fleet Intelligence
        </h1>
        <p className="mb-10 max-w-xl text-lg text-on-primary-container">
          Manage your entire fleet from one powerful platform. Real-time telematics, precision routing,
          and financial reconciliation.
        </p>
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:justify-center">
          <a
            href="mailto:sales@roamenterprise.co?subject=Fleet%20Demo%20Request"
            className="rounded-lg bg-secondary-container px-8 py-4 text-sm font-bold text-on-secondary-fixed transition-all hover:brightness-110 active:scale-95"
          >
            Request Demo
          </a>
          <a
            href={FLEET_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-outline-variant px-8 py-4 text-sm transition-all hover:bg-white/5 active:scale-95"
          >
            Start Free Trial
          </a>
        </div>

        <div className="mt-16 w-full max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-fleet-slate/50 shadow-2xl backdrop-blur-md">
          <img
            src={FLEET_DASHBOARD_HERO}
            alt="Fleet management dashboard with map and vehicle markers"
            className="aspect-video w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}

export function FleetFeaturesSection() {
  return (
    <section className="bg-surface px-[var(--spacing-margin-mobile)] py-20">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <div className="mb-12 flex flex-col gap-4">
          <h2 className="text-3xl font-semibold text-primary">Engineered for Precision</h2>
          <div className="h-1 w-12 bg-secondary-container" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-5">
          {FLEET_FEATURES.map((feature) => {
            const Icon = featureIcons[feature.icon as keyof typeof featureIcons];
            const accent = accentClasses[feature.accent as keyof typeof accentClasses];
            return (
              <div
                key={feature.title}
                className="group rounded-xl border border-outline-variant bg-white p-6 transition-shadow hover:-translate-y-1 hover:shadow-lg"
              >
                <span className={`mb-4 inline-flex rounded-lg p-3 transition-colors ${accent}`}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mb-2 text-2xl font-semibold">{feature.title}</h3>
                <p className="text-sm text-on-surface-variant">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FleetCommandCenterSection() {
  return (
    <section className="overflow-hidden bg-primary-container py-24 text-white">
      <div className="mx-auto grid max-w-[var(--spacing-container-max)] items-center gap-16 px-[var(--spacing-margin-mobile)] lg:grid-cols-2">
        <div className="relative">
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-secondary-container opacity-10 blur-3xl" />
          <h2 className="mb-6 text-4xl font-bold">Real-time Command Center</h2>
          <p className="mb-8 text-lg text-on-primary-container">
            Experience a unified view of your entire operation. Our multi-vehicle tracking system uses
            proprietary algorithms to predict arrival times and detect driver fatigue before incidents
            occur.
          </p>
          <div className="space-y-4">
            <div className="glass-panel flex items-start gap-4 rounded-lg p-4">
              <Gauge className="h-6 w-6 shrink-0 text-secondary-container" aria-hidden />
              <div>
                <h4 className="mb-1 text-sm font-semibold">Live Telemetry</h4>
                <p className="text-xs text-on-primary-container">
                  Monitor speed, braking, and idle time in real-time.
                </p>
              </div>
            </div>
            <div className="glass-panel flex items-start gap-4 rounded-lg p-4">
              <Route className="h-6 w-6 shrink-0 text-secondary-container" aria-hidden />
              <div>
                <h4 className="mb-1 text-sm font-semibold">AI Routing</h4>
                <p className="text-xs text-on-primary-container">
                  Smart rerouting based on live traffic and road conditions.
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="group relative">
          <div className="absolute inset-0 bg-secondary-container/20 blur-2xl transition-all group-hover:bg-secondary-container/30" />
          <div className="relative overflow-hidden rounded-xl border border-white/20 bg-surface shadow-2xl">
            <img
              src={FLEET_COMMAND_CENTER}
              alt="Real-time fleet command center map interface"
              className="aspect-square w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function FleetUseCasesSection() {
  return (
    <section className="bg-surface-muted px-[var(--spacing-margin-mobile)] py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <h2 className="mb-16 text-center text-3xl font-semibold text-primary">
          Built for Every Fleet
        </h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
          {FLEET_USE_CASES.map((useCase) => {
            const Icon = useCaseIcons[useCase.icon as keyof typeof useCaseIcons];
            const accent = useCaseAccent[useCase.accent as keyof typeof useCaseAccent];
            return (
              <div
                key={useCase.title}
                className="flex flex-col items-center rounded-xl border border-outline-variant bg-white p-8 text-center"
              >
                <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full ${accent}`}>
                  <Icon className="h-10 w-10" aria-hidden />
                </div>
                <h3 className="mb-2 text-2xl font-semibold">{useCase.title}</h3>
                <p className="text-sm text-on-surface-variant">{useCase.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FleetIntegrationsSection() {
  return (
    <section className="border-y border-outline-variant bg-white px-[var(--spacing-margin-mobile)] py-20">
      <div className="mx-auto flex max-w-[var(--spacing-container-max)] flex-col items-center text-center">
        <h2 className="mb-12 text-2xl font-semibold">Seamless Ecosystem Integration</h2>
        <div className="flex flex-wrap justify-center gap-12 opacity-60 grayscale">
          {FLEET_INTEGRATIONS.map((item) => {
            const Icon = integrationIcons[item.icon as keyof typeof integrationIcons];
            return (
              <div key={item.label} className="flex items-center gap-2">
                <Icon className="h-5 w-5" aria-hidden />
                <span className="font-bold">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function FleetPricingSection() {
  return (
    <section className="bg-surface px-[var(--spacing-margin-mobile)] py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)]">
        <h2 className="mb-16 text-center text-3xl font-semibold text-primary">Scalable Plans</h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {FLEET_PRICING.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex h-full flex-col rounded-xl p-8 ${
                plan.highlighted
                  ? 'z-10 scale-105 bg-primary-container text-white shadow-xl'
                  : 'border border-outline-variant bg-white'
              }`}
            >
              {'badge' in plan && plan.badge && (
                <div className="absolute right-8 top-0 -translate-y-1/2 rounded-full bg-secondary-container px-3 py-1 text-[10px] font-bold uppercase tracking-tighter text-on-secondary-fixed">
                  {plan.badge}
                </div>
              )}
              <span
                className={`mb-2 text-xs uppercase ${plan.highlighted ? 'text-secondary-container' : 'text-secondary'}`}
              >
                {plan.tier}
              </span>
              <div className="mb-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.period && (
                  <span className={plan.highlighted ? 'text-on-primary-container' : 'text-on-surface-variant'}>
                    {plan.period}
                  </span>
                )}
              </div>
              <ul className="mb-8 flex-grow space-y-4">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary-container" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                href={
                  plan.cta === 'Contact Sales'
                    ? 'mailto:sales@roamenterprise.co?subject=Fleet%20Enterprise'
                    : FLEET_APP_URL
                }
                target={plan.cta === 'Contact Sales' ? undefined : '_blank'}
                rel={plan.cta === 'Contact Sales' ? undefined : 'noopener noreferrer'}
                className={`w-full rounded-lg py-3 text-center text-sm font-medium transition-all ${
                  plan.highlighted
                    ? 'bg-secondary-container font-bold text-on-secondary-fixed hover:brightness-110 active:scale-95'
                    : 'border border-primary text-primary hover:bg-primary hover:text-white'
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FleetTestimonialsSection() {
  return (
    <section className="relative overflow-hidden bg-white px-[var(--spacing-margin-mobile)] py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] text-center">
        <h2 className="mb-12 text-3xl font-semibold text-primary">Trusted by Global Operations</h2>
        <div className="flex flex-col gap-8 md:flex-row">
          {FLEET_TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="flex-1 rounded-xl border border-outline-variant bg-surface-muted p-8 text-left"
            >
              <div className="mb-4 flex text-secondary-container">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-current" aria-hidden />
                ))}
              </div>
              <p className="mb-6 italic text-on-surface">&ldquo;{t.quote}&rdquo;</p>
              <div>
                <p className="font-bold">{t.name}</p>
                <p className="text-sm text-on-surface-variant">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FleetCtaSection() {
  return (
    <section className="kinetic-gradient px-[var(--spacing-margin-mobile)] py-24 text-white">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-6 text-4xl font-bold">Ready to optimize your fleet?</h2>
        <p className="mb-12 text-lg text-on-primary-container">
          Join over 5,000 companies using Roam to power their mobile operations. Schedule a personal
          walkthrough with an expert.
        </p>
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <a
            href="mailto:sales@roamenterprise.co?subject=Schedule%20Fleet%20Demo"
            className="rounded-lg bg-secondary-container px-10 py-4 text-sm font-bold text-on-secondary-fixed transition-transform active:scale-95"
          >
            Schedule a Demo
          </a>
          <a
            href="mailto:sales@roamenterprise.co?subject=Fleet%20Sales%20Inquiry"
            className="rounded-lg bg-white/10 px-10 py-4 text-sm transition-all hover:bg-white/20 active:scale-95"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </section>
  );
}
