import React, { useCallback, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useOnboardingScrollLock, useOnboardingSwipe } from '@/hooks/useOnboardingSwipe';

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

const STEP_COUNT = STEPS.length;
const ICON_CIRCLE_SIZE = 192;
const ICON_SIZE = ICON_CIRCLE_SIZE * 0.55;

export function HowItWorksPage({ onComplete, onSkip }: HowItWorksPageProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const isLast = stepIndex === STEP_COUNT - 1;

  useOnboardingScrollLock(true);

  const advanceStep = useCallback(() => {
    setStepIndex((index) => Math.min(STEP_COUNT - 1, index + 1));
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex === STEP_COUNT - 1) {
      onComplete();
      return;
    }
    setStepIndex((index) => index + 1);
  }, [onComplete, stepIndex]);

  const handlePrev = useCallback(() => {
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const { containerRef, dragOffset, isDragging } = useOnboardingSwipe({
    stepIndex,
    stepCount: STEP_COUNT,
    onNext: advanceStep,
    onPrev: handlePrev,
  });

  return (
    <div className="bg-background text-on-background h-full flex flex-col relative overflow-x-hidden">
      <div className="fixed top-0 w-full flex justify-end items-center px-[var(--spacing-edge)] h-14 z-50 pt-safe">
        <button
          type="button"
          onClick={onSkip}
          className="text-muted text-xs font-semibold tracking-wide hover:text-primary transition-colors py-2 px-4 rounded-full active:scale-95 duration-100"
        >
          Skip
        </button>
      </div>

      <main className="flex-1 w-full max-w-md mx-auto px-[var(--spacing-edge)] flex flex-col pt-[calc(3.5rem+env(safe-area-inset-top,0px)+2rem)] pb-10 pb-safe z-10 min-h-0">
        <div
          ref={containerRef}
          className="w-full shrink-0 overflow-x-hidden touch-pan-y"
        >
          <div
            className="flex will-change-transform"
            style={{
              width: `${STEP_COUNT * 100}%`,
              transform: `translateX(calc(-${(stepIndex * 100) / STEP_COUNT}% + ${dragOffset}px))`,
              transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            {STEPS.map((step) => (
              <div
                key={step.title}
                className="flex flex-col items-center text-center min-w-0 px-2"
                style={{ flex: `0 0 ${100 / STEP_COUNT}%` }}
              >
                <div
                  className="bg-surface shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-full flex items-center justify-center mb-8 relative"
                  style={{ width: ICON_CIRCLE_SIZE, height: ICON_CIRCLE_SIZE }}
                >
                  <MaterialIcon
                    name={step.icon}
                    size={ICON_SIZE}
                    className="leading-none text-primary"
                    filled={step.filled}
                  />
                  {step.badge && (
                    <div className="absolute top-8 right-8 w-6 h-6 bg-tertiary-container rounded-full border-4 border-surface" />
                  )}
                </div>
                <h2 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface mb-4">
                  {step.title}
                </h2>
                <p className="text-base leading-6 text-muted max-w-xs mx-auto">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto w-full flex flex-col items-center shrink-0 pt-8">
          <div className="flex gap-2 mb-6">
            {STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === stepIndex ? 'w-6 bg-primary' : 'w-2 bg-surface-dim'
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
      </main>
    </div>
  );
}
