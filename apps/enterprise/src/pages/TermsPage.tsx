import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { LEGAL_EMAIL, TERMS_TOC } from '@/lib/legalContent';

export function TermsPage() {
  return (
    <LegalLayout active="terms">
      <article className="max-w-3xl">
        <header className="mb-12">
          <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">Terms of Service</h1>
          <div className="flex items-center gap-4 text-sm text-on-surface-variant">
            <span className="rounded-full bg-secondary-container px-3 py-1 text-on-secondary-container">
              Active
            </span>
            <p>Last Updated: May 2024</p>
          </div>
        </header>

        <div className="hidden lg:mb-8 lg:block">
          <nav className="flex flex-col gap-1 rounded-xl border border-outline-variant bg-surface-muted p-4">
            {TERMS_TOC.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="rounded-full px-4 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <section className="space-y-6 text-on-surface-variant [&_h2]:mt-12 [&_h2]:border-b [&_h2]:border-outline-variant [&_h2]:pb-2 [&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:text-on-surface [&_p]:leading-relaxed">
          <p className="text-lg italic text-on-surface">
            Please read these terms carefully before using the Roam Enterprise platform. By accessing
            or using our services, you agree to be bound by these terms and all terms incorporated by
            reference.
          </p>

          <div id="acceptance" className="scroll-mt-32">
            <h2>1. Acceptance of Terms</h2>
            <p>
              Roam Enterprise (&quot;the Company&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;)
              provides its logistics and fleet management services to you subject to the following
              Terms of Service (&quot;TOS&quot;). These terms constitute a legally binding agreement
              between you and Roam Enterprise.
            </p>
            <p>
              By creating an account, accessing our dashboard, or utilizing any of our automated hauling
              interfaces, you acknowledge that you have read, understood, and agree to be bound by these
              terms. If you are entering into this agreement on behalf of a company or other legal
              entity, you represent that you have the authority to bind such entity to these terms.
            </p>
          </div>

          <div id="service" className="scroll-mt-32">
            <h2>2. Service Description</h2>
            <p>
              Roam Enterprise operates a high-precision kinetic logistics platform designed for
              enterprise mobility. Our services include, but are not limited to, real-time fleet
              tracking, automated routing optimization, predictive maintenance scheduling, and global
              supply chain visibility (collectively, the &quot;Service&quot;).
            </p>
            <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container-low p-6">
              <h4 className="mb-3 text-sm font-medium uppercase tracking-wider text-haul-indigo">
                Service Availability
              </h4>
              <p className="m-0">
                We strive for 99.9% uptime, however, service may be temporarily unavailable for
                scheduled maintenance or due to unforeseen global logistics disruptions. We reserve the
                right to modify or discontinue any part of the Service with reasonable notice.
              </p>
            </div>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot;. Roam Enterprise
              reserves the right to update the technical specifications of the platform to maintain
              kinetic precision and security standards.
            </p>
          </div>

          <div id="responsibilities" className="scroll-mt-32">
            <h2>3. User Responsibilities</h2>
            <p>
              As a user of Roam Enterprise, you are responsible for maintaining the confidentiality of
              your account credentials and for all activities that occur under your account. You agree
              to:
            </p>
            <ul className="mb-6 list-disc space-y-3 pl-6">
              <li>Provide accurate, current, and complete information during the registration process.</li>
              <li>Ensure all telemetric data provided to the platform from your fleet is accurate and un-tampered.</li>
              <li>Comply with all local, state, and international shipping and logistics regulations.</li>
              <li>Prohibit unauthorized access to the Roam API keys assigned to your organization.</li>
            </ul>
            <p>
              Failure to adhere to these responsibilities may result in immediate suspension of service
              and potential legal action if kinetic safety protocols are breached.
            </p>
          </div>

          <div id="liability" className="scroll-mt-32">
            <h2>4. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Roam Enterprise shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages, including without
              limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting
              from:
            </p>
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded border border-outline-variant bg-white p-4">
                <span className="mb-1 block text-sm font-medium">Logistics Delays</span>
                <span className="text-sm opacity-70">
                  Losses due to traffic, weather, or port congestion beyond our predictive model&apos;s control.
                </span>
              </div>
              <div className="rounded border border-outline-variant bg-white p-4">
                <span className="mb-1 block text-sm font-medium">Data Accuracy</span>
                <span className="text-sm opacity-70">
                  Decisions made based on user-inputted fleet data that is found to be incorrect.
                </span>
              </div>
            </div>
            <p>
              In no event shall Roam Enterprise&apos;s total liability for all claims related to the
              service exceed the amount paid by you to Roam Enterprise for the service in the 12 months
              preceding the event giving rise to the claim.
            </p>
          </div>

          <div className="mt-16 rounded-2xl bg-fleet-slate p-8 text-white">
            <h3 className="mb-4 text-2xl font-semibold">Questions about these terms?</h3>
            <p className="mb-6 text-surface-variant">
              Our legal and compliance team is available to clarify any sections of this document for
              our enterprise partners.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                className="flex items-center gap-2 rounded-full bg-secondary-container px-6 py-3 text-sm font-medium text-on-secondary-container transition-transform hover:scale-105"
              >
                <Mail className="h-4 w-4" aria-hidden />
                {LEGAL_EMAIL}
              </a>
              <Link
                to="/help"
                className="rounded-full border border-outline px-6 py-3 text-sm font-medium transition-colors hover:bg-white/10"
              >
                Help Center
              </Link>
            </div>
          </div>
        </section>
      </article>
    </LegalLayout>
  );
}
