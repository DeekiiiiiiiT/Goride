import { Link } from 'react-router-dom';
import { ArrowLinkIcon, ServiceIcon } from '@/components/icons/SiteIcons';
import { SERVICES } from '@/lib/siteContent';

const accentStyles: Record<string, { iconWrap: string; link: string }> = {
  'rides-blue': {
    iconWrap: 'bg-rides-blue/10 text-rides-blue',
    link: 'text-rides-blue',
  },
  'secondary-container': {
    iconWrap: 'bg-secondary-container/10 text-secondary-container',
    link: 'text-secondary-container',
  },
  'haul-indigo': {
    iconWrap: 'bg-haul-indigo/10 text-haul-indigo',
    link: 'text-haul-indigo',
  },
  white: {
    iconWrap: 'bg-white/10 text-white',
    link: 'text-white',
  },
  'dash-cyan': {
    iconWrap: 'bg-dash-cyan/10 text-dash-cyan',
    link: 'text-dash-cyan',
  },
};

function ServiceCard({
  title,
  description,
  cta,
  href,
  icon,
  variant,
  accent,
  wide,
}: (typeof SERVICES)[number] & { wide?: boolean }) {
  const isDark = variant === 'dark';
  const styles = accentStyles[accent];

  const cardClass = `bento-card-hover group flex min-h-[280px] flex-col justify-between rounded-2xl border p-8 md:min-h-[320px] ${
    wide ? 'md:col-span-2' : ''
  } ${
    isDark ? 'border-white/10 bg-fleet-slate' : 'border-outline-variant bg-white'
  }`;

  const inner = (
    <>
      <div>
        <div
          className={`bento-icon mb-6 flex h-12 w-12 items-center justify-center rounded-xl ${styles.iconWrap}`}
        >
          <ServiceIcon type={icon} className="h-8 w-8" />
        </div>
        <h4 className={`mb-2 text-2xl font-semibold ${isDark ? 'text-white' : 'text-fleet-slate'}`}>
          {title}
        </h4>
        <p className={`max-w-sm text-base ${isDark ? 'text-white/60' : 'text-on-surface-variant'}`}>
          {description}
        </p>
      </div>
      <div className={`mt-8 flex items-center gap-2 text-sm font-bold ${styles.link}`}>
        <span>{cta}</span>
        <ArrowLinkIcon className="h-4 w-4" />
      </div>
    </>
  );

  if (href.startsWith('/')) {
    return (
      <Link to={href} className={cardClass}>
        {inner}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cardClass}>
      {inner}
    </a>
  );
}

export function ServicesSection() {
  return (
    <section id="services" className="bg-surface py-20 md:py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-12 md:mb-16">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-fleet-slate md:text-[2rem]">
            Integrated Ecosystem
          </h2>
          <p className="max-w-2xl text-lg text-on-surface-variant">
            Modular solutions designed to move people, products, and performance forward with
            unparalleled efficiency.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-[var(--spacing-gutter)]">
          {SERVICES.map((service) => (
            <ServiceCard
              key={service.id}
              {...service}
              wide={service.id === 'rides'}
            />
          ))}

          <div className="bento-card-hover flex min-h-[240px] flex-col items-start justify-between gap-8 rounded-2xl border border-outline-variant bg-gradient-to-br from-surface-container-low to-surface-container-high p-8 md:col-span-3 md:flex-row md:items-center">
            <div className="flex-1">
              <div className="bento-icon mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-fleet-slate/10 text-fleet-slate">
                <ServiceIcon type="enterprise" className="h-8 w-8" />
              </div>
              <h4 className="mb-2 text-2xl font-semibold text-fleet-slate">
                Roam Enterprise Solutions
              </h4>
              <p className="max-w-2xl text-base text-on-surface-variant">
                Custom B2B integrations, white-labeled mobility tech, and corporate travel
                programs engineered for scale.
              </p>
            </div>
            <Link
              to="/enterprise"
              className="inline-flex shrink-0 items-center gap-3 rounded-xl bg-fleet-slate px-10 py-4 text-sm font-bold text-white transition-colors hover:bg-fleet-slate/90"
            >
              Connect with Sales
              <ServiceIcon type="enterprise" className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
