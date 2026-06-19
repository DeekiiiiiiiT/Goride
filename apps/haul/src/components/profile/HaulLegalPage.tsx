import React from 'react';
import { HaulSubpageHeader } from './HaulSubpageHeader';

type Props = {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
};

export function HaulLegalPage({ title, onBack, children }: Props) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title={title} onBack={onBack} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-[88px] pb-8">
        <div className="space-y-4 rounded-xl border border-[#534434] bg-[#171f33] p-6 text-[#d8c3ad]">{children}</div>
      </main>
    </div>
  );
}

export function HaulTermsPage({ onBack }: { onBack: () => void }) {
  return (
    <HaulLegalPage title="Terms of Service" onBack={onBack}>
      <p>
        By using Roam Haul you agree to transport assigned freight safely, maintain valid documentation, and comply
        with local road and commercial vehicle regulations.
      </p>
      <p>
        Cancellations within two hours of a scheduled dispatch may incur a penalty fee. Roam reserves the right to
        suspend accounts that repeatedly miss commitments or violate platform policies.
      </p>
      <p className="text-sm">Last updated: June 2026</p>
    </HaulLegalPage>
  );
}

export function HaulPrivacyPage({ onBack }: { onBack: () => void }) {
  return (
    <HaulLegalPage title="Privacy Policy" onBack={onBack}>
      <p>
        Roam Haul collects location data while you are online or on an active job to coordinate pickups, provide ETAs,
        and improve route matching.
      </p>
      <p>
        Profile information, vehicle details, and uploaded documents are stored securely and used only for compliance
        verification and job assignment.
      </p>
      <p className="text-sm">Contact support@roamhaul.com for data requests.</p>
    </HaulLegalPage>
  );
}
