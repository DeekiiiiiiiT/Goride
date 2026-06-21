import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { useOnboardingScrollLock } from '@/hooks/useOnboardingSwipe';
import { ONBOARDING_SLIDES } from '@/lib/onboardingContent';

type HowItWorksPageProps = {
  onComplete: () => void;
  onSkip: () => void;
};

const STEP_COUNT = ONBOARDING_SLIDES.length;

export function HowItWorksPage({ onComplete, onSkip }: HowItWorksPageProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const imageCarouselRef = useRef<HTMLDivElement>(null);
  const isLast = stepIndex === STEP_COUNT - 1;

  useOnboardingScrollLock(true);

  const updateCarousel = useCallback((index: number) => {
    setStepIndex(index);
  }, []);

  const scrollToSlide = useCallback((index: number) => {
    const carousel = imageCarouselRef.current;
    if (!carousel) return;
    carousel.scrollTo({
      left: carousel.clientWidth * index,
      behavior: 'smooth',
    });
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex === STEP_COUNT - 1) {
      onComplete();
      return;
    }
    const nextIndex = stepIndex + 1;
    scrollToSlide(nextIndex);
    updateCarousel(nextIndex);
  }, [onComplete, scrollToSlide, stepIndex, updateCarousel]);

  const handleDotClick = useCallback(
    (index: number) => {
      scrollToSlide(index);
      updateCarousel(index);
    },
    [scrollToSlide, updateCarousel],
  );

  useEffect(() => {
    const carousel = imageCarouselRef.current;
    if (!carousel) return;

    let scrollTimer: number | undefined;

    const onScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const width = carousel.clientWidth;
        const newIndex = Math.round(carousel.scrollLeft / width);
        if (newIndex >= 0 && newIndex < STEP_COUNT) {
          setStepIndex(newIndex);
        }
      }, 60);
    };

    carousel.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(scrollTimer);
      carousel.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="app-fullscreen-screen bg-background text-on-background">
      <header className="flex justify-between items-center p-4 z-10 absolute top-0 w-full pt-safe">
        <div className="text-xl font-bold text-primary">Roam Dash</div>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-semibold tracking-wide text-on-surface-variant hover:text-primary transition-colors bg-surface-variant/50 px-4 py-2 rounded-full backdrop-blur-sm"
        >
          Skip
        </button>
      </header>

      <main className="flex-1 flex flex-col md:flex-row h-full min-h-0">
        <div className="relative flex-1 md:flex-[1.5] w-full h-[min(486px,52dvh)] md:h-full bg-surface-container-highest md:rounded-xl overflow-hidden shadow-sm shrink-0">
          <div
            ref={imageCarouselRef}
            className="flex h-full w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
          >
            {ONBOARDING_SLIDES.map((slide) => (
              <div key={slide.title} className="snap-start min-w-full h-full relative">
                <img
                  alt={slide.alt}
                  className="absolute inset-0 w-full h-full object-cover dash-image-mask md:[mask-image:none]"
                  src={slide.image}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent md:hidden" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-between bg-background -mt-6 md:mt-0 relative z-10 rounded-t-3xl md:rounded-none px-4 pb-8 pt-6 md:p-8 shadow-[0px_-10px_30px_rgba(0,0,0,0.05)] md:shadow-none min-h-0">
          <div className="flex-1 overflow-hidden relative min-h-0">
            <div
              className="flex transition-transform duration-500 ease-in-out h-full"
              style={{ transform: `translateX(-${stepIndex * 100}%)` }}
            >
              {ONBOARDING_SLIDES.map((slide) => (
                <div key={slide.title} className="min-w-full flex flex-col items-start justify-center px-2">
                  <div className="w-16 h-16 rounded-full bg-primary-container/20 flex items-center justify-center mb-6">
                    <MaterialIcon name={slide.icon} className="text-4xl text-primary" filled />
                  </div>
                  <h2 className="text-[28px] leading-[34px] md:text-[32px] md:leading-[40px] font-bold text-on-background mb-4">
                    {slide.title}
                  </h2>
                  <p className="text-lg leading-7 text-on-surface-variant">{slide.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-6 mt-auto pt-4 shrink-0">
            <div className="flex justify-center md:justify-start gap-2 px-2">
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
        </div>
      </main>
    </div>
  );
}
