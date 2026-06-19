import {
  BarChart3,
  Info,
  LockOpen,
  Megaphone,
  Settings,
  SlidersHorizontal,
} from 'lucide-react';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { COOKIE_CATEGORIES, COOKIE_ROWS, PRIVACY_EMAIL } from '@/lib/legalContent';

const categoryIcons = {
  essential: LockOpen,
  analytics: BarChart3,
  marketing: Megaphone,
  functional: Settings,
};

const typeBadgeClass: Record<string, string> = {
  'haul-indigo': 'bg-haul-indigo/10 text-haul-indigo',
  'dash-cyan': 'bg-dash-cyan/10 text-dash-cyan',
  'rides-blue': 'bg-rides-blue/10 text-rides-blue',
  secondary: 'bg-secondary/10 text-secondary',
};

export function CookiesPage() {
  return (
    <LegalLayout active="cookies">
      <div className="max-w-3xl">
        <header className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 text-xs font-semibold text-haul-indigo">
            Last Updated: May 2024
          </div>
          <h1 className="mb-6 text-5xl font-bold tracking-tight">Cookie Policy</h1>
          <p className="text-lg text-on-surface-variant">
            At Roam Enterprise, we believe in being clear and open about how we collect and use data
            related to you. In the spirit of transparency, this policy provides detailed information
            about how and when we use cookies on our platform.
          </p>
        </header>

        <section className="mb-12 rounded-xl border border-outline-variant bg-white p-8 shadow-sm">
          <h2 className="mb-4 text-2xl font-semibold">1. What are cookies?</h2>
          <p className="leading-relaxed text-on-surface-variant">
            Cookies are small text files sent by us to your computer or mobile device. They are unique
            to your account or your browser. Session-based cookies last only while your browser is open
            and are automatically deleted when you close your browser. Persistent cookies last until you
            or your browser delete them or until they expire.
          </p>
          <div className="mt-6 flex items-start gap-4 rounded-lg border border-outline-variant/30 bg-surface-container-low p-4">
            <Info className="mt-1 h-5 w-5 shrink-0 text-rides-blue" aria-hidden />
            <p className="text-on-surface-variant">
              To learn more about cookies, visit{' '}
              <a href="https://allaboutcookies.org" target="_blank" rel="noopener noreferrer" className="text-rides-blue hover:underline">
                allaboutcookies.org
              </a>.
            </p>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold">2. Categories of Cookies</h2>
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {COOKIE_CATEGORIES.map((cat) => {
              const Icon = categoryIcons[cat.icon];
              const accentBg =
                cat.accent === 'haul-indigo'
                  ? 'bg-haul-indigo/10 text-haul-indigo'
                  : cat.accent === 'dash-cyan'
                    ? 'bg-dash-cyan/10 text-dash-cyan'
                    : cat.accent === 'secondary'
                      ? 'bg-secondary/10 text-secondary'
                      : 'bg-rides-blue/10 text-rides-blue';
              return (
                <div
                  key={cat.title}
                  className="rounded-xl border border-outline-variant bg-white p-6 transition-shadow hover:shadow-md"
                >
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${accentBg}`}>
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="mb-2 text-sm font-bold">{cat.title}</h3>
                  <p className="text-on-surface-variant">{cat.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-semibold">3. Specific Cookies Used</h2>
          <div className="overflow-hidden rounded-xl border border-outline-variant">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-surface-container-high text-on-surface">
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider">Cookie Name</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider">Provider</th>
                  <th className="px-6 py-4 text-xs font-medium uppercase tracking-wider">Type</th>
                  <th className="hidden px-6 py-4 text-xs font-medium uppercase tracking-wider sm:table-cell">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant bg-white">
                {COOKIE_ROWS.map((row, i) => (
                  <tr
                    key={row.name}
                    className={`transition-colors hover:bg-surface-muted ${i % 2 === 1 ? 'bg-surface-muted' : ''}`}
                  >
                    <td className="px-6 py-4 font-mono text-sm">{row.name}</td>
                    <td className="px-6 py-4">{row.provider}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${typeBadgeClass[row.typeClass]}`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="hidden px-6 py-4 sm:table-cell">{row.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="mb-4 text-2xl font-semibold">4. How to manage cookies</h2>
          <p className="mb-6 leading-relaxed text-on-surface-variant">
            Most browsers allow you to control cookies through their settings preferences. However, if
            you limit the ability of websites to set cookies, you may worsen your overall user
            experience, as it will no longer be personalized to you.
          </p>
          <div className="flex flex-col gap-4 md:flex-row">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-lg bg-fleet-slate px-6 py-3 text-sm font-medium text-white transition-all hover:opacity-90"
            >
              <SlidersHorizontal className="h-5 w-5" aria-hidden />
              Configure Preferences
            </button>
            <button
              type="button"
              className="rounded-lg border border-outline px-6 py-3 text-sm font-medium transition-all hover:bg-surface-container-high"
            >
              Reject All Non-Essential
            </button>
          </div>
        </section>

        <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-2xl bg-haul-indigo p-8 text-white shadow-xl md:flex-row">
          <div className="relative z-10">
            <h3 className="mb-2 text-2xl font-semibold">Have questions about your data?</h3>
            <p className="text-surface-variant">
              Our dedicated compliance team is here to assist with any privacy concerns.
            </p>
          </div>
          <a
            href={`mailto:${PRIVACY_EMAIL}`}
            className="relative z-10 rounded-full bg-secondary-container px-8 py-3 text-sm font-medium text-on-secondary-container transition-transform hover:scale-105"
          >
            Contact Privacy Team
          </a>
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5" />
        </div>
      </div>
    </LegalLayout>
  );
}
