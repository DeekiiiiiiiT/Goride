import { Link } from 'react-router-dom';
import { LegalLayout } from '@/components/legal/LegalLayout';
import { LEGAL_EMAIL, PRIVACY_EMAIL } from '@/lib/legalContent';

export function PrivacyPage() {
  return (
    <LegalLayout active="privacy">
      <div className="rounded-xl border border-outline-variant bg-white p-8 shadow-sm md:p-16">
        <header className="mb-12 border-b border-outline-variant pb-8">
          <h1 className="mb-2 text-5xl font-bold text-haul-indigo">Privacy Policy</h1>
          <p className="text-on-surface-variant">Last Updated: May 2024</p>
        </header>

        <section className="mb-12 rounded-lg border border-outline-variant/30 bg-surface-container-low p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-haul-indigo">
            Table of Contents
          </h2>
          <ul className="grid grid-cols-1 gap-y-3 md:grid-cols-2 md:gap-x-8">
            <li><a href="#collect" className="text-rides-blue hover:underline">1. Information We Collect</a></li>
            <li><a href="#use" className="text-rides-blue hover:underline">2. How We Use Data</a></li>
            <li><a href="#sharing" className="text-rides-blue hover:underline">3. Data Sharing</a></li>
            <li><a href="#rights" className="text-rides-blue hover:underline">4. Your Rights</a></li>
          </ul>
        </section>

        <div className="mx-auto max-w-3xl space-y-16">
          <section id="collect" className="scroll-mt-32">
            <h2 className="mb-6 text-2xl font-semibold text-haul-indigo">1. Information We Collect</h2>
            <div className="space-y-4 text-lg leading-relaxed text-fleet-slate">
              <p>
                Roam Enterprise collects information to provide better services to all our users—from
                figuring out basic stuff like which language you speak, to more complex things like
                which logistics route you&apos;ll find most useful or the real-time location of your
                fleet.
              </p>
              <p>We collect information in the following ways:</p>
              <ul className="list-disc space-y-2 pl-6 marker:text-haul-indigo">
                <li>
                  <strong>Information you give us.</strong> For example, many of our services require
                  you to sign up for a Roam Account. When you do, we&apos;ll ask for personal
                  information, like your name, email address, telephone number or credit card to store
                  with your account.
                </li>
                <li>
                  <strong>Information we get from your use of our services.</strong> We collect
                  information about the services that you use and how you use them, like when you
                  watch a training video on our platform or interact with our logistics dashboard.
                </li>
              </ul>
            </div>
          </section>

          <section id="use" className="scroll-mt-32">
            <h2 className="mb-6 text-2xl font-semibold text-haul-indigo">2. How We Use Data</h2>
            <div className="space-y-4 text-lg leading-relaxed text-fleet-slate">
              <p>
                We use the information we collect from all of our services to provide, maintain,
                protect and improve them, to develop new ones, and to protect Roam and our users.
              </p>
              <p>Specifically, we use your data for:</p>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded border border-outline-variant bg-surface-bright p-4">
                  <h4 className="mb-2 text-sm font-medium text-haul-indigo">Service Operations</h4>
                  <p className="text-base">
                    Maintaining fleet tracking, route optimization, and secure communication channels.
                  </p>
                </div>
                <div className="rounded border border-outline-variant bg-surface-bright p-4">
                  <h4 className="mb-2 text-sm font-medium text-haul-indigo">Safety & Security</h4>
                  <p className="text-base">
                    Authenticating accounts and detecting fraudulent activity within enterprise portals.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section id="sharing" className="scroll-mt-32">
            <h2 className="mb-6 text-2xl font-semibold text-haul-indigo">3. Data Sharing</h2>
            <div className="space-y-4 text-lg leading-relaxed text-fleet-slate">
              <p>
                We do not share personal information with companies, organizations and individuals
                outside of Roam unless one of the following circumstances applies:
              </p>
              <ul className="list-disc space-y-2 pl-6 marker:text-haul-indigo">
                <li>
                  <strong>With your consent:</strong> We will share personal information with
                  companies, organizations or individuals outside of Roam when we have your consent to
                  do so.
                </li>
                <li>
                  <strong>With domain administrators:</strong> If your Roam Account is managed for you
                  by a domain administrator, then your domain administrator and resellers who provide
                  user support to your organization will have access to your Account information.
                </li>
                <li>
                  <strong>For external processing:</strong> We provide personal information to our
                  affiliates or other trusted businesses or persons to process it for us, based on our
                  instructions and in compliance with our Privacy Policy and any other appropriate
                  confidentiality and security measures.
                </li>
              </ul>
            </div>
          </section>

          <section id="rights" className="scroll-mt-32 pb-12">
            <h2 className="mb-6 text-2xl font-semibold text-haul-indigo">4. Your Rights</h2>
            <div className="space-y-4 text-lg leading-relaxed text-fleet-slate">
              <p>
                Under the GDPR and other applicable data protection laws, you have specific rights
                regarding your personal data. These include:
              </p>
              <div className="space-y-4 border-l-4 border-dash-cyan bg-surface-container-low/50 py-4 pl-6">
                <p><strong>Right to Access:</strong> You can request a copy of the personal data we hold about you.</p>
                <p><strong>Right to Erasure:</strong> You can request that we delete your data under certain conditions.</p>
                <p><strong>Right to Object:</strong> You have the right to object to our processing of your personal data for direct marketing purposes.</p>
              </div>
              <p className="mt-8">
                To exercise any of these rights, please contact our Data Protection Officer at{' '}
                <code className="rounded bg-surface-variant px-2 py-1 text-haul-indigo">{PRIVACY_EMAIL}</code>.
              </p>
            </div>
          </section>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between gap-6 border-t border-outline-variant pt-8 md:flex-row">
          <p className="text-on-surface-variant">Questions about this policy? Reach out to our legal team.</p>
          <a
            href={`mailto:${LEGAL_EMAIL}?subject=Privacy%20Policy%20Inquiry`}
            className="rounded bg-haul-indigo px-8 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Contact Legal Support
          </a>
        </div>
      </div>
    </LegalLayout>
  );
}
