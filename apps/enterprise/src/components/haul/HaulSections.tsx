import {
  ArrowRight,
  BadgeCheck,
  Box,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  Construction,
  FileText,
  LayoutDashboard,
  Map,
  MapPin,
  Receipt,
  Shield,
  TrendingUp,
  Truck,
  Bus,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  APP_FEATURES,
  COMPLIANCE_ITEMS,
  HAULER_FEATURES,
  HAUL_APP_URL,
  SHIPPER_FEATURES,
  VEHICLE_TYPES,
} from '@/lib/haulContent';

export function HaulHeroSection() {
  return (
    <section className="relative flex h-[85vh] items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          alt="High-tech logistics truck on a modern highway at sunset"
          className="h-full w-full object-cover grayscale-[20%]"
          src="/images/haul-hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-fleet-slate/90 via-fleet-slate/60 to-transparent" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)]">
        <div className="max-w-2xl space-y-6">
          <h1 className="text-4xl font-bold leading-none tracking-tight text-white md:text-5xl">
            Haul More.
            <br />
            <span className="text-secondary-fixed">Earn More.</span>
          </h1>
          <p className="max-w-md text-lg text-white/80">
            Connect with freight opportunities and grow your hauling business with the
            industry&apos;s most precise logistics engine.
          </p>
          <div className="flex flex-col gap-3 pt-4">
            <a
              href={HAUL_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-secondary-container px-8 py-4 text-sm font-bold text-on-secondary-container shadow-lg shadow-secondary-container/20"
            >
              Become a Hauler
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="mailto:haul@roamenterprise.co?subject=Ship%20With%20Us"
              className="flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-sm font-bold text-white backdrop-blur-md"
            >
              Ship With Us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const haulerIcons = {
  payments: Wallet,
  calendar: CalendarCheck,
  dispatch: Zap,
};

const shipperIcons = {
  bolt: Zap,
  calendar: Calendar,
  tracking: MapPin,
  proof: ClipboardCheck,
};

const vehicleIcons = {
  pickup: Truck,
  van: Bus,
  heavy: Construction,
  box: Box,
  flatbed: Truck,
};

const appFeatureIcons = {
  'load-board': LayoutDashboard,
  earnings: TrendingUp,
};

const complianceIcons = {
  shield: Shield,
  verified: BadgeCheck,
  docs: FileText,
};

export function HaulAudienceSection() {
  return (
    <section className="bg-white px-[var(--spacing-margin-mobile)] py-16">
      <div className="grid grid-cols-1 gap-8">
        <div className="group relative overflow-hidden rounded-2xl bg-fleet-slate p-8 text-white shadow-2xl">
          <div className="absolute right-0 top-0 p-8 opacity-10">
            <Construction className="h-36 w-36" aria-hidden />
          </div>
          <h2 className="mb-6 flex items-center gap-3 text-3xl font-semibold">
            <span className="h-8 w-2 rounded-full bg-secondary-fixed" />
            For Haulers
          </h2>
          <ul className="grid grid-cols-1 gap-6">
            {HAULER_FEATURES.map((item) => {
              const Icon = haulerIcons[item.icon];
              return (
                <li key={item.title} className="flex items-start gap-4">
                  <span className="rounded-lg bg-white/5 p-2 text-secondary-fixed">
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="text-sm text-slate-400">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-8">
            <div className="rounded-lg bg-white/5 p-3 text-center">
              <p className="text-xs text-slate-400">Document Vault</p>
              <BadgeCheck className="mx-auto mt-1 h-6 w-6" aria-hidden />
            </div>
            <div className="rounded-lg bg-white/5 p-3 text-center">
              <p className="text-xs text-slate-400">Digital Settlements</p>
              <Wallet className="mx-auto mt-1 h-6 w-6" aria-hidden />
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-low p-8 shadow-sm">
          <div className="absolute right-0 top-0 p-8 opacity-5">
            <Construction className="h-36 w-36" aria-hidden />
          </div>
          <h2 className="mb-6 flex items-center gap-3 text-3xl font-semibold text-fleet-slate">
            <span className="h-8 w-2 rounded-full bg-haul-indigo" />
            For Shippers
          </h2>
          <ul className="space-y-6">
            {SHIPPER_FEATURES.map((item) => {
              const Icon = shipperIcons[item.icon];
              return (
                <li
                  key={item.title}
                  className="flex items-center gap-4 rounded-xl border border-outline-variant/30 bg-white p-4 shadow-sm"
                >
                  <Icon className="h-6 w-6 text-haul-indigo" aria-hidden />
                  <span className="text-sm font-bold">{item.title}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function HaulVehicleNetworkSection() {
  return (
    <section className="bg-fleet-slate px-[var(--spacing-margin-mobile)] py-16 text-white">
      <div className="mb-12 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-secondary-fixed">
          Fleet Variety
        </span>
        <h2 className="mt-2 text-3xl font-semibold">Versatile Vehicle Network</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {VEHICLE_TYPES.map((vehicle) => {
          const Icon = vehicleIcons[vehicle.icon];
          if (vehicle.wide) {
            return (
              <div
                key={vehicle.title}
                className="haul-bento-card col-span-2 flex items-center justify-between rounded-2xl bg-haul-indigo p-6"
              >
                <div>
                  <p className="text-sm font-bold">{vehicle.title}</p>
                  <p className="text-xs text-white/60">{vehicle.subtitle}</p>
                </div>
                <Icon className="h-10 w-10" aria-hidden />
              </div>
            );
          }
          return (
            <div
              key={vehicle.title}
              className="haul-bento-card glass-panel flex flex-col items-center justify-center rounded-2xl p-6 text-center"
            >
              <Icon className="mb-3 h-10 w-10 text-secondary-fixed" aria-hidden />
              <span className="text-sm font-bold">{vehicle.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HaulAppShowcaseSection() {
  return (
    <section className="bg-surface px-[var(--spacing-margin-mobile)] py-16">
      <div className="mb-12">
        <h2 className="text-3xl font-semibold text-fleet-slate">The Hauler Control Center</h2>
        <p className="mt-2 text-on-surface-variant">Professional tools for professional drivers.</p>
      </div>

      <div className="relative mx-auto mb-16 max-w-xs">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[3rem] border-8 border-fleet-slate bg-white shadow-2xl">
          <div className="absolute inset-x-0 top-0 flex h-6 justify-center bg-fleet-slate">
            <div className="h-4 w-20 rounded-b-xl bg-fleet-slate" />
          </div>
          <div className="flex h-full flex-col gap-4 overflow-hidden p-4 pt-10">
            <div className="flex h-12 items-center gap-2 rounded-lg bg-surface-container px-3">
              <div className="h-8 w-8 rounded-full bg-haul-indigo" />
              <div className="h-2 w-24 rounded bg-outline-variant" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex h-20 flex-col justify-between rounded-xl bg-primary-container p-3">
                <TrendingUp className="h-5 w-5 text-secondary-fixed" aria-hidden />
                <div className="h-2 w-12 rounded bg-white/20" />
              </div>
              <div className="flex h-20 flex-col justify-between rounded-xl bg-surface-container p-3">
                <Map className="h-5 w-5 text-haul-indigo" aria-hidden />
                <div className="h-2 w-12 rounded bg-outline-variant" />
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-outline-variant/20 bg-surface-container p-3">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-3 w-16 rounded bg-fleet-slate" />
                <div className="h-3 w-8 rounded bg-outline-variant" />
              </div>
              <div className="space-y-3">
                <div className="h-10 rounded-lg border border-outline-variant/30 bg-white" />
                <div className="h-10 rounded-lg border border-outline-variant/30 bg-white" />
                <div className="h-10 rounded-lg border border-outline-variant/30 bg-white" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute -left-4 top-1/4 flex items-center gap-3 rounded-xl border border-outline-variant bg-white p-3 shadow-xl">
          <LayoutDashboard className="h-5 w-5 text-haul-indigo" aria-hidden />
          <span className="text-xs font-semibold">Dashboard Monitoring</span>
        </div>
        <div className="absolute -right-4 bottom-1/4 flex items-center gap-3 rounded-xl border border-outline-variant bg-white p-3 shadow-xl">
          <Receipt className="h-5 w-5 text-dash-cyan" aria-hidden />
          <span className="text-xs font-semibold">Manifests</span>
        </div>
      </div>

      <div className="space-y-4">
        {APP_FEATURES.map((feature) => {
          const Icon = appFeatureIcons[feature.icon];
          return (
            <div
              key={feature.title}
              className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-white p-5 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high">
                <Icon className="h-6 w-6 text-haul-indigo" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-bold">{feature.title}</p>
                <p className="text-xs text-on-surface-variant">{feature.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HaulComplianceSection() {
  return (
    <section className="border-y border-outline-variant bg-white px-[var(--spacing-margin-mobile)] py-16">
      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <BadgeCheck className="h-12 w-12 fill-haul-indigo text-haul-indigo" aria-hidden />
        <h2 className="text-2xl font-semibold text-fleet-slate">Trust & Compliance First</h2>
        <p className="text-on-surface-variant">
          We maintain the highest standards in the hauling industry.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {COMPLIANCE_ITEMS.map((item) => {
          const Icon = complianceIcons[item.icon];
          return (
            <div
              key={item.title}
              className="flex items-center gap-4 rounded-xl border border-outline-variant/50 p-4"
            >
              <Icon className="h-8 w-8 text-dash-cyan" aria-hidden />
              <span className="text-sm font-bold">{item.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HaulCtaSection() {
  return (
    <section className="relative overflow-hidden bg-fleet-slate px-[var(--spacing-margin-mobile)] py-20 text-center text-white">
      <div className="absolute left-0 top-0 h-full w-full opacity-10">
        <div className="absolute -left-32 -top-32 h-64 w-64 rounded-full bg-secondary-fixed blur-[100px]" />
        <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-haul-indigo blur-[100px]" />
      </div>
      <div className="relative z-10 space-y-8">
        <h2 className="text-3xl font-semibold">Ready to Scale Your Fleet?</h2>
        <p className="mx-auto max-w-sm text-white/70">
          Join thousands of carriers and shippers driving the future of logistics.
        </p>
        <div className="flex flex-col gap-4">
          <a
            href={HAUL_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-secondary-container py-5 text-sm font-bold text-on-secondary-container shadow-xl"
          >
            Sign Up as Hauler
          </a>
          <a
            href="mailto:haul@roamenterprise.co?subject=Quote%20Request"
            className="rounded-full border border-white/20 bg-transparent py-5 text-sm font-bold text-white"
          >
            Request a Quote
          </a>
        </div>
      </div>
    </section>
  );
}
