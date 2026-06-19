import { STATS } from '@/lib/siteContent';

export function StatsSection() {
  return (
    <section className="border-b border-outline-variant bg-surface-container-lowest py-16 md:py-20">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center md:text-left">
              <h3 className="mb-1 text-[2.5rem] font-bold leading-none text-fleet-slate">
                {stat.value}
              </h3>
              <p className="text-sm font-medium text-on-surface-variant">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
