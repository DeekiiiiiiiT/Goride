import { useMemo, useState } from 'react';
import {
  Briefcase,
  ChevronRight,
  Code,
  Gauge,
  Headphones,
  HeartPulse,
  MapPin,
  Megaphone,
  Network,
  Package,
  Search,
  Settings,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  CAREERS_EMAIL,
  DEPARTMENTS,
  DEPARTMENT_FILTER_OPTIONS,
  JOB_LISTINGS,
  TALENT_NETWORK_EMAIL,
  WHY_ROAM,
} from '@/lib/careersContent';

const whyIcons = {
  collaborative: Users,
  health: HeartPulse,
  growth: TrendingUp,
  remote: Network,
};

const departmentIcons = {
  engineering: Code,
  product: Package,
  operations: Settings,
  marketing: Megaphone,
  support: Headphones,
};

const departmentAccent: Record<string, string> = {
  'dash-cyan': 'text-dash-cyan',
  'secondary-container': 'text-secondary-container',
  'secondary-fixed-dim': 'text-secondary-fixed',
  'rides-blue': 'text-rides-blue',
  'error-container': 'text-outline',
};

const INITIAL_VISIBLE = 4;
const LOAD_MORE_STEP = 4;

export function CareersHeroSection() {
  return (
    <section className="relative flex h-[85vh] flex-col justify-end overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          alt="Team collaborating in a modern office"
          className="h-full w-full object-cover"
          src="/images/careers-hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-fleet-slate via-fleet-slate/40 to-transparent" />
      </div>
      <div className="relative z-10 space-y-4 px-[var(--spacing-margin-mobile)] pb-12">
        <h1 className="max-w-[90%] text-4xl font-bold tracking-tight text-white">
          Build the Future of Mobility
        </h1>
        <p className="max-w-[85%] text-lg text-white/80">
          Join a team that&apos;s transforming transportation across the globe with kinetic precision
          and human-centric design.
        </p>
        <div className="pt-4">
          <a
            href="#jobs"
            className="inline-block rounded-xl bg-secondary-container px-6 py-4 text-sm font-bold text-on-secondary-container shadow-lg transition-transform active:scale-95"
          >
            View Open Positions
          </a>
        </div>
      </div>
    </section>
  );
}

export function CareersWhySection() {
  return (
    <section className="space-y-8 px-[var(--spacing-margin-mobile)] py-16">
      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-rides-blue">
          Why Roam
        </span>
        <h2 className="text-3xl font-semibold text-fleet-slate">A culture of quiet power</h2>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {WHY_ROAM.map((item) => {
          const Icon = whyIcons[item.icon];
          return (
            <div
              key={item.title}
              className="kinetic-shadow space-y-4 rounded-xl border border-outline-variant/50 bg-white p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container-low">
                <Icon className="h-6 w-6 text-rides-blue" aria-hidden />
              </div>
              <h3 className="text-2xl font-semibold text-fleet-slate">{item.title}</h3>
              <p className="text-on-surface-variant">{item.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CareersDepartmentsSection() {
  return (
    <section className="bg-fleet-slate py-12 text-white">
      <div className="mb-6 px-[var(--spacing-margin-mobile)]">
        <h2 className="text-3xl font-semibold">Departments</h2>
      </div>
      <div className="no-scrollbar flex gap-4 overflow-x-auto px-[var(--spacing-margin-mobile)] pb-4">
        {DEPARTMENTS.map((dept) => {
          const Icon = departmentIcons[dept.icon];
          return (
            <a
              key={dept.name}
              href="#jobs"
              className="flex aspect-square w-40 flex-none flex-col justify-end rounded-xl border border-white/10 bg-white/5 p-6 transition-colors hover:bg-white/10"
            >
              <Icon className={`mb-2 h-6 w-6 ${departmentAccent[dept.accent]}`} aria-hidden />
              <span className="text-sm font-medium">{dept.name}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

export function CareersJobsSection() {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<string>('All Departments');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return JOB_LISTINGS.filter((job) => {
      const matchesDepartment =
        department === 'All Departments' || job.department === department;
      const matchesSearch =
        !query ||
        job.title.toLowerCase().includes(query) ||
        job.location.toLowerCase().includes(query) ||
        job.department.toLowerCase().includes(query);
      return matchesDepartment && matchesSearch;
    });
  }, [search, department]);

  const visibleJobs = filteredJobs.slice(0, visibleCount);
  const hasMore = visibleCount < filteredJobs.length;

  return (
    <section id="jobs" className="space-y-6 px-[var(--spacing-margin-mobile)] py-16">
      <div className="space-y-4">
        <h2 className="text-3xl font-semibold text-fleet-slate">Open Positions</h2>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(INITIAL_VISIBLE);
              }}
              placeholder="Search roles..."
              className="w-full rounded-xl border border-outline-variant bg-white py-3 pl-10 pr-4 outline-none focus:border-transparent focus:ring-2 focus:ring-rides-blue"
            />
          </div>
          <select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setVisibleCount(INITIAL_VISIBLE);
            }}
            className="w-full appearance-none rounded-xl border border-outline-variant bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-rides-blue"
          >
            {DEPARTMENT_FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {visibleJobs.length === 0 ? (
          <p className="rounded-xl border border-outline-variant bg-white p-6 text-center text-on-surface-variant">
            No positions match your search. Try adjusting filters.
          </p>
        ) : (
          visibleJobs.map((job) => (
            <a
              key={job.id}
              href={`mailto:${CAREERS_EMAIL}?subject=Application%20-%20${encodeURIComponent(job.title)}`}
              className="group flex items-center justify-between rounded-xl border border-outline-variant/50 bg-white p-5 kinetic-shadow transition-colors hover:border-rides-blue/30"
            >
              <div className="space-y-1">
                <h4 className="text-2xl font-semibold text-fleet-slate">{job.title}</h4>
                <div className="flex gap-3 text-xs text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" aria-hidden />
                    {job.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-4 w-4" aria-hidden />
                    {job.department}
                  </span>
                </div>
              </div>
              <ChevronRight
                className="h-5 w-5 text-outline transition-colors group-hover:text-rides-blue"
                aria-hidden
              />
            </a>
          ))
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}
          className="w-full rounded-xl border-2 border-rides-blue/10 py-4 text-sm font-bold text-rides-blue hover:bg-rides-blue/5"
        >
          Load More Positions
        </button>
      )}
    </section>
  );
}

export function CareersCtaSection() {
  return (
    <section className="space-y-8 bg-surface-container-low px-[var(--spacing-margin-mobile)] py-20 text-center">
      <div className="space-y-2">
        <h2 className="text-3xl font-semibold text-fleet-slate">Ready to accelerate?</h2>
        <p className="text-on-surface-variant">
          We&apos;re always looking for brilliant minds to join our mission.
        </p>
      </div>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <a
          href={`mailto:${CAREERS_EMAIL}?subject=General%20Application`}
          className="w-full rounded-xl bg-fleet-slate py-5 text-base font-bold text-white shadow-xl transition-transform active:scale-95"
        >
          Apply Now
        </a>
        <a
          href={`mailto:${TALENT_NETWORK_EMAIL}?subject=Join%20Talent%20Network`}
          className="w-full rounded-xl border border-outline-variant bg-white py-5 text-base font-bold text-fleet-slate shadow-sm transition-transform active:scale-95"
        >
          Join Our Talent Network
        </a>
      </div>
    </section>
  );
}
