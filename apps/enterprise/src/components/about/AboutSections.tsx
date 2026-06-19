import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Download,
  Leaf,
  Lightbulb,
  Mail,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  ABOUT_STATS,
  CORE_VALUES,
  LEADERSHIP,
  PRESS_EMAIL,
  PRESS_OUTLETS,
} from '@/lib/aboutContent';

const valueIcons = {
  safety: ShieldAlert,
  innovation: Lightbulb,
  community: Users,
  sustainability: Leaf,
  reliability: BadgeCheck,
};

const valueHoverStyles = {
  'haul-indigo': {
    border: 'hover:border-haul-indigo',
    icon: 'group-hover:bg-haul-indigo group-hover:text-white',
  },
  'secondary-container': {
    border: 'hover:border-secondary-container',
    icon: 'group-hover:bg-secondary-container group-hover:text-white',
  },
  'dash-cyan': {
    border: 'hover:border-dash-cyan',
    icon: 'group-hover:bg-dash-cyan group-hover:text-white',
  },
};

export function AboutHeroSection() {
  return (
    <section className="relative h-[80vh] w-full overflow-hidden">
      <img
        alt="Roam Enterprise team collaborating in a modern office"
        className="absolute inset-0 h-full w-full object-cover"
        src="/images/about-hero.png"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-fleet-slate/90 via-fleet-slate/60 to-transparent" />
      <div className="relative mx-auto flex h-full max-w-[var(--spacing-container-max)] flex-col justify-center px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <span className="mb-4 text-xs font-semibold uppercase tracking-widest text-secondary-container">
          About Roam Enterprise
        </span>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl">
          Moving the World Forward
        </h1>
        <p className="mt-6 max-w-xl text-lg text-surface-variant opacity-90">
          Engineered for reliability, designed for speed. We are building the foundational
          infrastructure for the next generation of global movement.
        </p>
        <div className="mt-10 flex gap-4">
          <a
            href="#stats"
            className="flex items-center gap-2 rounded bg-secondary-container px-8 py-4 text-sm font-medium text-on-secondary-fixed transition-all hover:bg-secondary-container/90"
          >
            Our Impact
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}

export function AboutStorySection() {
  return (
    <section className="border-b border-outline-variant bg-white py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="grid grid-cols-1 items-start gap-[var(--spacing-gutter)] lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="mb-8 text-3xl font-semibold text-fleet-slate">Our Story</h2>
            <p className="leading-relaxed text-on-surface-variant">
              Founded in 2018, Roam Enterprise began with a singular focus: solving the friction of
              modern logistics through data-driven precision. What started as a local fleet
              optimization project has evolved into a comprehensive global mobility ecosystem.
              <br />
              <br />
              We recognized early on that the world&apos;s moving parts were disconnected. By applying
              Kinetic Precision—our proprietary approach to operational efficiency—we&apos;ve enabled
              thousands of partners to move goods and people more intelligently, safely, and
              sustainably than ever before.
            </p>
          </div>
          <div className="hidden h-full border-l border-outline-variant lg:col-span-1 lg:block" />
          <div className="flex flex-col gap-12 lg:col-span-6">
            <div className="border-l-4 border-haul-indigo bg-surface-muted p-8">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-haul-indigo">
                Our Mission
              </h3>
              <p className="text-2xl font-semibold italic text-fleet-slate">
                &ldquo;To redefine global mobility through kinetic precision and technological
                innovation.&rdquo;
              </p>
            </div>
            <div className="border-l-4 border-secondary-container bg-surface-muted p-8">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-on-secondary-container">
                Our Vision
              </h3>
              <p className="text-2xl font-semibold italic text-fleet-slate">
                &ldquo;A world where movement is seamless, sustainable, and accessible to
                everyone.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AboutStatsSection() {
  return (
    <section id="stats" className="relative overflow-hidden bg-fleet-slate py-20 text-white">
      <div className="relative z-10 mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="grid grid-cols-2 gap-[var(--spacing-gutter)] text-center md:grid-cols-4">
          {ABOUT_STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-2">
              <span className="text-5xl font-bold text-secondary-container">{stat.value}</span>
              <span className="text-sm font-medium uppercase tracking-widest opacity-60">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AboutValuesSection() {
  return (
    <section id="values" className="bg-surface py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-semibold text-fleet-slate">Core Values</h2>
          <p className="mx-auto mt-4 max-w-xl text-on-surface-variant">
            The fundamental principles that drive every decision within the Roam Enterprise ecosystem.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-5">
          {CORE_VALUES.map((value) => {
            const Icon = valueIcons[value.icon];
            const styles = valueHoverStyles[value.accent];
            return (
              <div
                key={value.title}
                className={`group border border-outline-variant bg-white p-8 transition-colors ${styles.border}`}
              >
                <div
                  className={`mb-6 flex h-12 w-12 items-center justify-center bg-surface-container transition-all ${styles.icon}`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </div>
                <h4 className="mb-2 text-xl font-semibold text-fleet-slate">{value.title}</h4>
                <p className="text-sm text-on-surface-variant">{value.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function AboutLeadershipSection() {
  return (
    <section id="leadership" className="bg-white py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-16 flex flex-col items-end justify-between gap-4 md:flex-row">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold text-fleet-slate">The Leadership</h2>
            <p className="mt-4 text-on-surface-variant">
              A team of industry veterans and innovators dedicated to scaling precision logistics.
            </p>
          </div>
          <a
            href="mailto:hello@roamenterprise.co?subject=Leadership%20Directory"
            className="flex items-center gap-2 text-sm font-medium text-haul-indigo hover:underline"
          >
            See full directory
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <div className="grid grid-cols-1 gap-[var(--spacing-gutter)] md:grid-cols-3">
          {LEADERSHIP.map((leader) => (
            <div key={leader.name} className="group">
              <div className="mb-6 aspect-[4/5] overflow-hidden border border-outline-variant bg-surface-muted">
                <img
                  src={leader.image}
                  alt={leader.name}
                  className="h-full w-full object-cover grayscale transition-all duration-500 group-hover:grayscale-0"
                />
              </div>
              <h4 className="text-2xl font-semibold text-fleet-slate">{leader.name}</h4>
              <span className="mb-3 block text-sm font-medium uppercase tracking-wider text-secondary-container">
                {leader.role}
              </span>
              <p className="text-on-surface-variant">{leader.bio}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AboutPressSection() {
  return (
    <section className="border-y border-outline-variant bg-surface-muted py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="grid grid-cols-1 gap-20 lg:grid-cols-2">
          <div>
            <h2 className="mb-6 text-3xl font-semibold text-fleet-slate">Press & Media</h2>
            <p className="mb-10 max-w-lg text-on-surface-variant">
              Access our official brand assets, executive bios, and latest news releases for media
              publications.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                href={`mailto:${PRESS_EMAIL}?subject=Press%20Kit%20Request`}
                className="flex items-center justify-center gap-3 bg-fleet-slate px-8 py-4 text-sm font-medium text-white transition-colors hover:bg-haul-indigo"
              >
                <Download className="h-5 w-5" aria-hidden />
                Download Press Kit
              </a>
              <a
                href={`mailto:${PRESS_EMAIL}?subject=Press%20Inquiry`}
                className="flex items-center justify-center gap-3 border border-fleet-slate px-8 py-4 text-sm font-medium text-fleet-slate transition-colors hover:bg-surface-container"
              >
                <Mail className="h-5 w-5" aria-hidden />
                Press Inquiries
              </a>
            </div>
          </div>
          <div>
            <h4 className="mb-8 text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
              In the News
            </h4>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {PRESS_OUTLETS.map((outlet) => (
                <div
                  key={outlet}
                  className="flex h-16 items-center justify-center border border-outline-variant bg-white p-4 opacity-50 transition-opacity hover:opacity-100"
                >
                  <span className="text-center text-xs font-bold tracking-tighter text-fleet-slate">
                    {outlet.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
