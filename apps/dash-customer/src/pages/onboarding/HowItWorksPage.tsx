import React, { useCallback, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useOnboardingScrollLock, useOnboardingSwipe } from '@/hooks/useOnboardingSwipe';
import { ONBOARDING_SLIDES } from '@/lib/onboardingContent';

type HowItWorksPageProps = {
  onComplete: () => void;
  onSkip: () => void;
};

const STEP_COUNT = ONBOARDING_SLIDES.length;

export function HowItWorksPage({ onComplete, onSkip }: HowItWorksPageProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const slide = ONBOARDING_SLIDES[stepIndex];
  const isLast = stepIndex === STEP_COUNT - 1;

  useOnboardingScrollLock(true);

  const goToSlide = useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(STEP_COUNT - 1, index)));
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex === STEP_COUNT - 1) {
      onComplete();
      return;
    }
    goToSlide(stepIndex + 1);
  }, [goToSlide, onComplete, stepIndex]);

  const handlePrev = useCallback(() => {
    goToSlide(stepIndex - 1);
  }, [goToSlide, stepIndex]);

  const { containerRef, dragOffset } = useOnboardingSwipe({
    stepIndex,
    stepCount: STEP_COUNT,
    onNext: handleNext,
    onPrev: handlePrev,
  });

  const handleDotClick = useCallback(
    (index: number) => {
      goToSlide(index);
    },
    [goToSlide],
  );

  const slideTransition = dragOffset !== 0 ? '' : 'transition-transform duration-300 ease-out';

  return (
    <div ref={containerRef} className="app-fullscreen-screen bg-background text-on-background touch-pan-y">
      <header className="flex justify-between items-center p-4 z-20 absolute top-0 w-full pt-safe pointer-events-none">
        <div className="text-xl font-bold text-primary pointer-events-auto">Roam Dash</div>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-semibold tracking-wide text-on-surface-variant hover:text-primary transition-colors bg-surface-variant/50 px-4 py-2 rounded-full backdrop-blur-sm pointer-events-auto"
        >
          Skip
        </button>
      </header>

      <main className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
        <div
          key={stepIndex}
          className={`flex-1 flex flex-col min-h-0 w-full overflow-hidden ${slideTransition}`}
          style={dragOffset !== 0 ? { transform: `translateX(${dragOffset}px)` } : undefined}
        >
          <div className="relative w-full h-[min(420px,48dvh)] shrink-0 overflow-hidden bg-surface-container-highest">
            <img
              alt={slide.alt}
              className="absolute inset-0 w-full h-full object-cover"
              src={slide.image}
            />
          </div>

          <div className="flex-1 flex flex-col bg-background px-4 pt-4 pb-4 min-h-0 w-full overflow-hidden">
            <div className="w-16 h-16 rounded-full bg-primary-container/20 flex items-center justify-center mb-6 shrink-0">
              <MaterialIcon name={slide.icon} className="text-4xl text-primary" filled />
            </div>
            <h2 className="text-[28px] leading-[34px] font-bold text-on-background mb-4 shrink-0">
              {slide.title}
            </h2>
            <p className="text-lg leading-7 text-on-surface-variant max-w-full">{slide.description}</p>
          </div>
        </div>

        <div className="shrink-0 w-full px-4 pb-8 pt-2 bg-background">
          <div className="flex justify-center gap-2 px-2 mb-6">
            {ONBOARDING_SLIDES.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => handleDotClick(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index === stepIndex ? 'w-8 bg-primary' : 'w-2 bg-surface-variant'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="w-full bg-primary text-on-primary text-sm font-semibold tracking-wide py-4 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition-transform duration-200 shadow-sm hover:opacity-90"
          >
            <span>{isLast ? 'Get Started' : 'Next'}</span>
            {!isLast && <MaterialIcon name="arrow_forward" className="text-[18px]" />}
          </button>
        </div>
      </main>
    </div>
  );
}
