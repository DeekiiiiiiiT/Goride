import { useState } from 'react';
import {
  BadgeCheck,
  MapPin,
  Plug,
  Power,
  Smartphone,
  TrendingUp,
  UserPlus,
  Wallet,
  Zap,
} from 'lucide-react';
import { HOW_IT_WORKS, type HowItWorksTab } from '@/lib/siteContent';

const stepIcons = {
  smartphone: Smartphone,
  verified: BadgeCheck,
  location: MapPin,
  signup: UserPlus,
  online: Power,
  wallet: Wallet,
  integrate: Plug,
  optimize: Zap,
  scale: TrendingUp,
};

const accentStyles = {
  'rides-blue': {
    circle: 'bg-rides-blue text-white shadow-lg shadow-rides-blue/20',
  },
  'secondary-container': {
    circle: 'bg-secondary-container text-on-secondary-container shadow-lg shadow-secondary-container/20',
  },
  'fleet-slate': {
    circle: 'bg-fleet-slate text-white shadow-lg shadow-fleet-slate/20',
  },
};

export function HowItWorksSection() {
  const [activeTab, setActiveTab] = useState<HowItWorksTab>('rider');
  const tabContent = HOW_IT_WORKS[activeTab];
  const styles = accentStyles[tabContent.accent];

  return (
    <section className="border-y border-outline-variant bg-surface-container-lowest py-20 md:py-24">
      <div className="mx-auto max-w-[var(--spacing-container-max)] px-[var(--spacing-margin-mobile)] md:px-[var(--spacing-margin-desktop)]">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-fleet-slate md:text-[2rem]">
            How Roam Works
          </h2>
          <div className="mt-4 inline-flex rounded-full bg-surface-container p-1.5">
            {(Object.keys(HOW_IT_WORKS) as HowItWorksTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-6 py-2.5 text-sm font-medium transition-all md:px-8 ${
                  activeTab === tab
                    ? 'bg-fleet-slate text-white'
                    : 'text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                {HOW_IT_WORKS[tab].label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative grid grid-cols-1 gap-12 md:grid-cols-3">
          <div
            className="absolute left-0 top-1/4 -z-10 hidden h-0.5 w-full border-t-2 border-dashed border-outline-variant md:block"
            aria-hidden
          />
          {tabContent.steps.map((step) => {
            const Icon = stepIcons[step.icon];
            return (
              <div key={step.title} className="flex flex-col items-center text-center">
                <div
                  className={`mb-6 flex h-20 w-20 items-center justify-center rounded-full ${styles.circle}`}
                >
                  <Icon className="h-9 w-9" strokeWidth={1.75} aria-hidden />
                </div>
                <h4 className="mb-2 text-2xl font-semibold text-fleet-slate">{step.title}</h4>
                <p className="max-w-[240px] text-base text-on-surface-variant">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
