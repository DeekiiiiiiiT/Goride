import { Link } from 'react-router-dom';
import { CtaArrowIcon } from '@/components/icons/SiteIcons';

export function HeroSection() {
  return (
    <section className="relative flex min-h-[85vh] items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          alt="Enterprise mobility — sedan and logistics van on a city street at golden hour"
          className="h-full w-full object-cover"
          src="/images/hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-fleet-slate/90 via-fleet-slate/50 to-fleet-slate/20" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="max-w-2xl text-white">
          <span className="mb-6 inline-block rounded-full bg-secondary-container px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-on-secondary-container">
            Roam Global Network 2.0
          </span>

          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-[3rem] lg:leading-[3.5rem]">
            The Future of Mobility,{' '}
            <span className="text-secondary-container">Delivered</span>
          </h1>

          <p className="mb-10 max-w-xl text-lg leading-relaxed text-white/75">
            Rideshare. Logistics. Food Delivery. Fleet Management. All in one ecosystem
            powered by kinetic precision and autonomous intelligence.
          </p>

          <div className="mb-12 flex flex-col gap-4 sm:flex-row">
            <a
              href="#services"
              className="group flex items-center justify-center gap-2 rounded-xl bg-secondary-container px-8 py-4 text-sm font-bold text-on-secondary-container transition-all hover:bg-secondary-container/90"
            >
              Explore Our Services
              <CtaArrowIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <Link
              to="/contact"
              className="rounded-xl border-2 border-white/30 px-8 py-4 text-center text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/10"
            >
              Partner With Us
            </Link>
          </div>

          <div className="opacity-90">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/70">
              Download Roam Rides
            </span>
            <div className="flex gap-3">
              <div className="flex h-10 w-32 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-[10px] leading-tight text-white">
                App Store
              </div>
              <div className="flex h-10 w-32 items-center justify-center rounded-lg border border-white/20 bg-black/40 text-[10px] leading-tight text-white">
                Google Play
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
