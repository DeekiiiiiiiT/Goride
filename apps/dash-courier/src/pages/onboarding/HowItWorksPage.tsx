import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type HowItWorksPageProps = {
  onComplete: () => void;
  onSkip: () => void;
};

const STEPS = [
  {
    icon: 'power_settings_new',
    filled: false,
    title: 'Go Online',
    description: "Turn on availability when you're ready to deliver.",
    badge: false,
  },
  {
    icon: 'notifications_active',
    filled: true,
    title: 'Receive Offers',
    description: 'Get delivery requests sent directly to you — accept the ones you want.',
    badge: true,
  },
  {
    icon: 'route',
    filled: false,
    title: 'Pick Up & Deliver',
    description: 'Navigate to the restaurant, grab the order, deliver to the customer.',
    badge: false,
  },
  {
    icon: 'account_balance_wallet',
    filled: true,
    title: 'Get Paid',
    description: 'Earn delivery fees and tips — see your earnings after each delivery.',
    badge: false,
  },
] as const;

export function HowItWorksPage({ onComplete, onSkip }: HowItWorksPageProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((prev) => prev + 1);
  };

  return (
    <div className="bg-background text-on-background min-h-full flex flex-col items-center justify-center relative overflow-hidden">
      <div className="fixed top-0 w-full flex justify-end items-center px-[var(--spacing-edge)] h-14 z-50 pt-safe">
        <button
          type="button"
          onClick={onSkip}
          className="text-muted text-xs font-semibold tracking-wide hover:text-primary transition-colors py-2 px-4 rounded-full active:scale-95 duration-100"
        >
          Skip
        </button>
      </div>

      <div className="w-full max-w-md px-[var(--spacing-edge)] flex flex-col items-center justify-center flex-grow z-10 relative">
        <div className="w-full relative min-h-[400px] flex flex-col items-center justify-center">
          <div key={step} className="flex flex-col items-center text-center w-full courier-slide-in">
            <div className="w-48 h-48 bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full flex items-center justify-center mb-8 relative">
              <MaterialIcon
                name={current.icon}
                className="text-[80px] text-primary"
                filled={current.filled}
              />
              {current.badge && (
                <div className="absolute top-8 right-8 w-6 h-6 bg-tertiary-container rounded-full border-4 border-surface" />
              )}
            </div>
            <h2 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface mb-4">
              {current.title}
            </h2>
            <p className="text-base leading-6 text-muted max-w-xs mx-auto">{current.description}</p>
          </div>
        </div>
      </div>

      <div className="w-full max-w-md px-[var(--spacing-edge)] pb-10 pb-safe flex flex-col items-center z-10">
        <div className="flex gap-2 mb-6">
          {STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === step ? 'w-6 bg-primary' : 'w-2 bg-surface-dim'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="w-full min-h-[56px] bg-primary-container text-on-primary-container font-semibold text-xl rounded-full shadow-[0_6px_12px_rgba(16,185,129,0.1)] active:scale-95 duration-100 flex items-center justify-center hover:bg-primary-container/90 transition-all"
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
