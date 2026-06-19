import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle,
  ChevronRight,
  HandHeart,
  Headphones,
  Share2,
  Shield,
  Star,
  Truck,
  User,
  Users,
} from 'lucide-react';
import {
  DRIVER_SAFETY_FEATURES,
  RIDER_SAFETY_FEATURES,
  SAFETY_EMAIL,
} from '@/lib/safetyContent';

const riderIcons = {
  shield: Shield,
  share: Share2,
  emergency: AlertTriangle,
  verified: BadgeCheck,
};

const driverIcons = {
  check: CheckCircle,
  star: Star,
  support: Headphones,
};

export function SafetyHeroSection() {
  return (
    <section className="relative flex h-[80vh] w-full items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          alt="Vehicle interior with advanced safety systems"
          className="h-full w-full object-cover brightness-50"
          src="/images/safety-hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-fleet-slate/95 to-fleet-slate/70" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="max-w-2xl">
          <span className="mb-6 inline-block rounded-full bg-secondary-container px-4 py-1 text-xs font-semibold uppercase tracking-widest text-on-secondary-container">
            Uncompromising Standards
          </span>
          <h2 className="mb-8 text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
            Your Safety is Our Priority
          </h2>
          <p className="mb-10 max-w-lg text-lg text-white/80">
            We engineer trust into every mile. From rigorous screening to real-time incident response,
            Roam Mobility sets the benchmark for secure enterprise logistics.
          </p>
          <a
            href="#ecosystem"
            className="inline-flex items-center gap-2 rounded-lg bg-secondary-container px-8 py-4 text-sm font-medium text-on-secondary-container transition-all hover:brightness-110"
          >
            View Safety Protocol
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}

export function SafetyEcosystemSection() {
  return (
    <section id="ecosystem" className="bg-surface-muted py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-16 text-center">
          <h3 className="mb-4 text-3xl font-semibold text-fleet-slate">Safety Ecosystem</h3>
          <div className="mx-auto h-1 w-24 bg-secondary" />
        </div>

        <div className="grid grid-cols-1 gap-[var(--spacing-gutter)] md:grid-cols-12">
          {/* Rider Safety */}
          <div className="bento-card-hover rounded-xl border border-outline-variant/30 bg-white p-8 shadow-sm md:col-span-8 md:p-12">
            <div className="mb-8 flex items-center gap-3">
              <User className="h-6 w-6 text-rides-blue" aria-hidden />
              <h4 className="text-2xl font-semibold text-fleet-slate">Rider Safety</h4>
            </div>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
              {RIDER_SAFETY_FEATURES.map((feature) => {
                const Icon = riderIcons[feature.icon];
                const isEmergency = feature.accent === 'secondary';
                return (
                  <div key={feature.title} className="flex gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                        isEmergency ? 'bg-secondary-container/20' : 'bg-surface-container'
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${isEmergency ? 'text-secondary' : 'text-primary'}`}
                        aria-hidden
                      />
                    </div>
                    <div>
                      <p
                        className={`mb-1 text-sm font-medium ${
                          isEmergency ? 'text-secondary' : 'text-primary'
                        }`}
                      >
                        {feature.title}
                      </p>
                      <p className="text-on-surface-variant">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Driver Safety */}
          <div className="bento-card-hover rounded-xl bg-fleet-slate p-8 text-white shadow-md md:col-span-4 md:p-12">
            <div className="mb-8 flex items-center gap-3">
              <Truck className="h-6 w-6 text-secondary-container" aria-hidden />
              <h4 className="text-2xl font-semibold">Driver Safety</h4>
            </div>
            <ul className="space-y-8">
              {DRIVER_SAFETY_FEATURES.map((feature) => {
                const Icon = driverIcons[feature.icon];
                return (
                  <li key={feature.title} className="flex items-start gap-4">
                    <Icon className="mt-1 h-5 w-5 shrink-0 text-secondary-container" aria-hidden />
                    <div>
                      <p className="text-sm font-medium">{feature.title}</p>
                      <p className="text-white/60">{feature.description}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Health & Cleanliness */}
          <div className="bento-card-hover rounded-xl bg-surface-container-high p-8 md:col-span-6 md:p-12">
            <div className="flex h-full flex-col">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-white shadow-sm">
                <HandHeart className="h-10 w-10 text-rides-blue" aria-hidden />
              </div>
              <h4 className="mb-4 text-2xl font-semibold text-fleet-slate">
                Health & Cleanliness
              </h4>
              <p className="text-on-surface-variant">
                Maintaining the highest standards of vehicle cleanliness and hygiene for every
                journey. Our fleet undergoes daily sanitation protocols to ensure a sterile
                environment for all passengers.
              </p>
            </div>
          </div>

          {/* Community Standards */}
          <div
            id="community"
            className="bento-card-hover rounded-xl border border-outline-variant bg-white p-8 md:col-span-6 md:p-12"
          >
            <div className="flex h-full flex-col">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-fleet-slate">
                <Users className="h-10 w-10 text-white" aria-hidden />
              </div>
              <h4 className="mb-4 text-2xl font-semibold text-fleet-slate">Community Standards</h4>
              <p className="mb-6 text-on-surface-variant">
                We foster a respectful environment for everyone. Our zero-tolerance policy ensures a
                safe community for riders and drivers alike.
              </p>
              <a
                href={`mailto:${SAFETY_EMAIL}?subject=Community%20Guidelines`}
                className="flex items-center gap-1 text-sm font-medium text-rides-blue transition-all hover:gap-2"
              >
                Read Guidelines
                <ChevronRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SafetyCtaSection() {
  return (
    <section className="border-y border-outline-variant/30 bg-white py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-center md:px-[var(--spacing-margin-desktop)]">
        <h3 className="mb-6 text-3xl font-semibold text-fleet-slate">Committed to Zero Compromise</h3>
        <p className="mx-auto mb-10 max-w-2xl text-lg text-on-surface-variant">
          Our safety protocols are continuously audited and upgraded to meet the demands of modern
          global logistics.
        </p>
        <a
          href={`mailto:${SAFETY_EMAIL}?subject=Learn%20More%20About%20Safety`}
          className="inline-block rounded-lg bg-fleet-slate px-12 py-5 text-sm font-medium text-white shadow-xl transition-all hover:bg-black"
        >
          Learn More about Safety
        </a>
      </div>
    </section>
  );
}

export function SafetyMobileNav() {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-8 rounded-full border border-white/10 bg-fleet-slate/95 px-6 py-4 shadow-2xl backdrop-blur-md md:hidden">
      <Shield className="h-6 w-6 text-secondary-container" aria-hidden />
      <Truck className="h-6 w-6 text-white/60" aria-hidden />
      <Users className="h-6 w-6 text-white/60" aria-hidden />
      <AlertTriangle className="h-6 w-6 text-white/60" aria-hidden />
    </div>
  );
}
