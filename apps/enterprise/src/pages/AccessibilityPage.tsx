import { CheckCircle2, Contrast, Keyboard, Mail, Type } from 'lucide-react';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { ACCESSIBILITY_EMAIL, ACCESSIBILITY_IMAGE } from '@/lib/legalContent';

const FEATURES = [
  {
    title: 'Adaptive Typography',
    description:
      'Our UI supports dynamic text resizing without loss of functionality or layout integrity, ensuring readability for all visual capacities.',
    icon: Type,
  },
  {
    title: 'Contrast Awareness',
    description:
      'We maintain a minimum contrast ratio of 4.5:1 for text and interactive elements, exceeding the standard for complex data environments.',
    icon: Contrast,
  },
  {
    title: 'Predictable Focus',
    description:
      'Logical tabbing orders and visible focus indicators allow users to navigate our enterprise dashboard entirely via keyboard.',
    icon: Keyboard,
  },
];

const COMPLIANCE_BADGES = [
  'Screen Reader Tested',
  'Keyboard Navigable',
  'High Contrast Options',
];

export function AccessibilityPage() {
  return (
    <LegalLayout active="accessibility">
      <div className="max-w-4xl">
        <section className="mb-16">
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">Accessibility Statement</h1>
          <p className="text-lg leading-relaxed text-on-surface-variant">
            Roam Enterprise is committed to ensuring digital accessibility for people with disabilities.
            We are continually improving the user experience for everyone and applying the relevant
            accessibility standards to our logistics and mobility platforms.
          </p>
        </section>

        <div className="grid grid-cols-1 gap-[var(--spacing-gutter)] md:grid-cols-2 lg:grid-cols-12">
          <div className="bento-card-hover rounded-xl border border-outline-variant bg-white p-8 lg:col-span-8">
            <span className="mb-4 block text-xs font-semibold uppercase tracking-wider text-haul-indigo">
              Conformance Status
            </span>
            <h2 className="mb-4 text-3xl font-semibold">WCAG 2.1 Level AA Compliance</h2>
            <p className="mb-6 text-on-surface-variant">
              The Web Content Accessibility Guidelines (WCAG) defines requirements for designers and
              developers to improve accessibility for people with disabilities. It defines three levels
              of conformance: Level A, Level AA, and Level AAA.{' '}
              <strong>Roam Enterprise is partially conformant with WCAG 2.1 level AA.</strong>
            </p>
            <div className="flex flex-wrap gap-4">
              {COMPLIANCE_BADGES.map((badge) => (
                <div
                  key={badge}
                  className="flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 py-2"
                >
                  <CheckCircle2 className="h-4 w-4 fill-dash-cyan text-dash-cyan" aria-hidden />
                  <span className="text-sm font-medium">{badge}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[300px] overflow-hidden rounded-xl lg:col-span-4">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url('${ACCESSIBILITY_IMAGE}')` }}
              role="img"
              aria-label="Modern glass office building"
            />
            <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-8">
              <p className="text-2xl font-semibold leading-tight text-white">Clarity through precision.</p>
            </div>
          </div>

          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="bento-card-hover rounded-xl border border-outline-variant bg-white p-8 lg:col-span-4"
              >
                <Icon className="mb-4 h-10 w-10 text-haul-indigo" aria-hidden />
                <h3 className="mb-2 text-2xl font-semibold">{feature.title}</h3>
                <p className="text-on-surface-variant">{feature.description}</p>
              </div>
            );
          })}

          <div className="mt-8 flex flex-col items-center justify-between gap-8 rounded-xl bg-fleet-slate p-12 text-white lg:col-span-12 md:flex-row">
            <div className="max-w-2xl text-center md:text-left">
              <h2 className="mb-4 text-3xl font-semibold">Feedback & Support</h2>
              <p className="text-lg opacity-80">
                We welcome your feedback on the accessibility of Roam Enterprise. Please let us know
                if you encounter accessibility barriers. Our dedicated accessibility team responds
                within 2 business days.
              </p>
            </div>
            <div className="flex w-full flex-col gap-4 md:w-auto">
              <a
                href={`mailto:${ACCESSIBILITY_EMAIL}`}
                className="flex items-center justify-center gap-3 rounded-xl bg-secondary-container px-8 py-4 font-bold text-on-secondary-fixed shadow-lg transition-all hover:-translate-y-1"
              >
                <Mail className="h-5 w-5" aria-hidden />
                {ACCESSIBILITY_EMAIL}
              </a>
              <a
                href={`mailto:${ACCESSIBILITY_EMAIL}?subject=Accessibility%20Form`}
                className="rounded-xl border border-white/20 px-8 py-4 text-center font-bold transition-all hover:bg-white/10"
              >
                Open Accessibility Form
              </a>
            </div>
          </div>
        </div>

        <section className="mx-auto mt-20 max-w-4xl border-t border-outline-variant pt-16">
          <div className="space-y-12">
            <div>
              <h3 className="mb-4 text-2xl font-semibold">Compatibility with Browsers</h3>
              <p className="leading-relaxed text-on-surface-variant">
                Roam Enterprise is designed to be compatible with modern assistive technologies.
                Specifically, we test with the latest versions of NVDA, JAWS, and VoiceOver on Chrome,
                Firefox, and Safari. However, some older browsers or operating systems may not support
                all features optimally.
              </p>
            </div>
            <div>
              <h3 className="mb-4 text-2xl font-semibold">Technical Specifications</h3>
              <p className="leading-relaxed text-on-surface-variant">
                Accessibility of Roam Enterprise relies on the following technologies to work with
                the particular combination of web browser and any assistive technologies or plugins
                installed on your computer:
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-4">
                {['HTML5', 'WAI-ARIA', 'CSS', 'JavaScript'].map((tech) => (
                  <li key={tech} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-dash-cyan" />
                    {tech}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-4 text-2xl font-semibold">Formal Approval</h3>
              <p className="italic leading-relaxed text-on-surface-variant">
                This Accessibility Statement is approved by the Roam Enterprise Board of Compliance.
                Last updated: October 2024.
              </p>
            </div>
          </div>
        </section>
      </div>
    </LegalLayout>
  );
}
