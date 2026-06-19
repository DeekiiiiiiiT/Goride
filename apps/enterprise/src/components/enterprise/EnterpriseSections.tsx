import {
  Armchair,
  Briefcase,
  Building,
  Building2,
  CheckCircle2,
  ChevronRight,
  Code2,
  Handshake,
  Hotel,
  PlaneTakeoff,
  Stethoscope,
  Theater,
  Users,
} from 'lucide-react';
import {
  CASE_STUDIES,
  ENTERPRISE_SOLUTIONS,
  INDUSTRIES,
  MANAGEMENT_TOOLS,
  SALES_EMAIL,
} from '@/lib/enterpriseContent';

const solutionIcons = {
  group: Users,
  business: Briefcase,
  event: Armchair,
  handshake: Handshake,
  airport: PlaneTakeoff,
  api: Code2,
};

const industryIcons = {
  hotel: Hotel,
  healthcare: Stethoscope,
  corporate: Building2,
  events: Theater,
  realEstate: Building,
};

export function EnterpriseHeroSection() {
  return (
    <section className="relative flex min-h-[80vh] items-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          alt="Modern corporate office building at dusk"
          className="h-full w-full object-cover grayscale-[20%]"
          src="/images/enterprise-hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-fleet-slate/90 to-haul-indigo/70 mix-blend-multiply opacity-90" />
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 h-full w-1/2 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] opacity-10" />
      <div className="relative z-10 mx-auto w-full max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-white md:px-[var(--spacing-margin-desktop)]">
        <div className="max-w-2xl">
          <span className="mb-6 inline-block rounded-full border border-dash-cyan/40 bg-dash-cyan/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-dash-cyan">
            Enterprise Mobility
          </span>
          <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Mobility Solutions for Your Business
          </h1>
          <p className="mb-10 text-lg leading-relaxed text-surface-container opacity-90">
            Custom transportation programs for enterprises of any size. Scalable, efficient, and
            engineered for professional logistics excellence.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <a
              href={`mailto:${SALES_EMAIL}?subject=Contact%20Sales`}
              className="flex items-center justify-center gap-2 rounded-xl bg-secondary-container px-8 py-4 text-sm font-semibold text-fleet-slate shadow-xl transition-all hover:bg-secondary-fixed active:-translate-y-1"
            >
              Contact Sales
              <ChevronRight className="h-5 w-5" aria-hidden />
            </a>
            <a
              href={`mailto:${SALES_EMAIL}?subject=Proposal%20Request`}
              className="flex items-center justify-center rounded-xl border border-white/40 bg-white/10 px-8 py-4 text-sm font-semibold backdrop-blur-md transition-all hover:bg-white/20"
            >
              Request Proposal
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EnterpriseSolutionsSection() {
  return (
    <section id="solutions" className="bg-white py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-16 flex flex-col items-end justify-between gap-4 md:flex-row">
          <div className="max-w-xl">
            <h2 className="mb-4 text-3xl font-semibold text-fleet-slate">
              Enterprise-Grade Solutions
            </h2>
            <p className="text-on-surface-variant">
              Precision-engineered transit programs tailored to meet the rigorous demands of global
              corporations and institutional partners.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="h-1 w-12 bg-haul-indigo" />
            <div className="h-1 w-4 bg-outline-variant" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {ENTERPRISE_SOLUTIONS.map((item) => {
            const Icon = solutionIcons[item.icon];
            return (
              <div
                key={item.title}
                className="group bento-card-hover rounded-xl border border-outline-variant bg-white p-8 hover:border-haul-indigo"
              >
                <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-container-low text-haul-indigo transition-colors group-hover:bg-haul-indigo group-hover:text-white">
                  <Icon className="h-8 w-8" aria-hidden />
                </div>
                <h3 className="mb-3 text-2xl font-semibold capitalize text-fleet-slate">
                  {item.title}
                </h3>
                <p className="text-on-surface-variant">{item.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function EnterpriseToolsSection() {
  return (
    <section className="border-y border-outline-variant bg-surface-muted py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-semibold text-fleet-slate">
            Precision Management Tools
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-on-surface-variant">
            Full control and visibility over your mobility spend with powerful admin capabilities.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {MANAGEMENT_TOOLS.map((item) => (
            <div
              key={item.title}
              className="flex gap-6 rounded-lg border border-outline-variant bg-white p-6 shadow-sm transition-all hover:shadow-md"
            >
              <CheckCircle2 className="mt-1 h-6 w-6 shrink-0 fill-dash-cyan text-dash-cyan" aria-hidden />
              <div>
                <h4 className="mb-2 text-2xl font-semibold capitalize text-fleet-slate">
                  {item.title}
                </h4>
                <p className="text-on-surface-variant">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EnterpriseCaseStudiesSection() {
  return (
    <section className="bg-fleet-slate py-24 text-white">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <h2 className="mb-12 text-center text-3xl font-semibold md:text-left">
          Strategic Partnerships in Action
        </h2>
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          {CASE_STUDIES.map((study) => (
            <div
              key={study.title}
              className="group relative aspect-[16/10] cursor-pointer overflow-hidden rounded-2xl"
            >
              <div
                className="h-full w-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url('${study.image}')` }}
                role="img"
                aria-label={study.title}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-fleet-slate via-transparent to-transparent opacity-80" />
              <div className="absolute bottom-0 left-0 p-8">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-dash-cyan">
                  Case Study
                </span>
                <h3 className="mb-4 text-3xl font-semibold">{study.title}</h3>
                <p className="text-surface-container-high opacity-80">{study.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function EnterpriseIndustriesSection() {
  return (
    <section className="border-b border-outline-variant bg-white py-16">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <h3 className="mb-10 text-center text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
          Industries Served
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-8 opacity-60 grayscale md:justify-between md:gap-12">
          {INDUSTRIES.map((industry) => {
            const Icon = industryIcons[industry.icon];
            return (
              <div
                key={industry.label}
                className="group flex cursor-default items-center gap-2 transition-all hover:opacity-100 hover:grayscale-0"
              >
                <Icon className="h-6 w-6 text-haul-indigo" aria-hidden />
                <span className="text-2xl font-semibold text-fleet-slate">{industry.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function EnterpriseCtaSection() {
  return (
    <section className="bg-surface-container-low py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] text-center md:px-[var(--spacing-margin-desktop)]">
        <h2 className="mb-6 text-4xl font-bold tracking-tight text-fleet-slate md:text-5xl">
          Ready to optimize your business mobility?
        </h2>
        <p className="mx-auto mb-12 max-w-2xl text-lg text-on-surface-variant">
          Join hundreds of enterprise partners who trust Roam Mobility for their kinetic precision
          requirements.
        </p>
        <div className="flex flex-col justify-center gap-6 sm:flex-row">
          <a
            href={`mailto:${SALES_EMAIL}?subject=Talk%20to%20Sales`}
            className="rounded-xl bg-haul-indigo px-10 py-5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-fleet-slate active:translate-y-1"
          >
            Talk to Sales
          </a>
          <a
            href={`mailto:${SALES_EMAIL}?subject=Custom%20Quote%20Request`}
            className="rounded-xl border-2 border-haul-indigo bg-white px-10 py-5 text-sm font-semibold text-haul-indigo transition-all hover:bg-surface-container active:translate-y-1"
          >
            Get Custom Quote
          </a>
        </div>
      </div>
    </section>
  );
}
