import { useCallback, useState } from 'react';
import { useOnboardingScrollLock, useOnboardingSwipe } from '../hooks/useOnboardingSwipe';

interface OnboardingCarouselPageProps {
  onComplete: () => void;
}

interface Slide {
  title: string;
  description: string;
  mainIcon: string;
  mainIconClass: string;
  badge: {
    icon: string;
    className: string;
    iconClass: string;
  };
}

const SLIDES: Slide[] = [
  {
    title: 'Receive Orders',
    description: 'Get instant alerts when customers order from your restaurant.',
    mainIcon: 'storefront',
    mainIconClass: 'text-secondary',
    badge: {
      icon: 'notifications_active',
      className: 'absolute -top-2 -right-2 h-12 w-12 bg-primary-container',
      iconClass: 'text-on-primary-container',
    },
  },
  {
    title: 'Prepare & Confirm',
    description: 'Accept orders, mark as preparing, and notify when ready.',
    mainIcon: 'restaurant',
    mainIconClass: 'text-primary',
    badge: {
      icon: 'check_circle',
      className: 'absolute -right-2 bottom-4 h-12 w-12 bg-secondary-container',
      iconClass: 'text-on-secondary-container',
    },
  },
  {
    title: 'Track Performance',
    description: 'See your sales, ratings, and customer insights.',
    mainIcon: 'insights',
    mainIconClass: 'text-secondary',
    badge: {
      icon: 'trending_up',
      className: 'absolute -left-4 top-8 h-12 w-12 bg-tertiary-container',
      iconClass: 'text-on-tertiary-container',
    },
  },
  {
    title: 'Get Paid',
    description: 'Automatic payouts deposited to your account.',
    mainIcon: 'account_balance',
    mainIconClass: 'text-primary',
    badge: {
      icon: 'payments',
      className:
        'absolute -bottom-2 left-1/2 h-12 w-16 -translate-x-1/2 rounded-xl bg-primary-container',
      iconClass: 'text-on-primary-container',
    },
  },
];

function MaterialIcon({
  name,
  filled = false,
  className = '',
  size = 80,
}: {
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}`,
      }}
    >
      {name}
    </span>
  );
}

export default function OnboardingCarouselPage({ onComplete }: OnboardingCarouselPageProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const isLastSlide = currentIndex === SLIDES.length - 1;

  useOnboardingScrollLock(true);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(SLIDES.length - 1, index)));
  }, []);

  const advanceStep = useCallback(() => {
    setCurrentIndex((index) => Math.min(SLIDES.length - 1, index + 1));
  }, []);

  const handlePrev = useCallback(() => {
    goToSlide(currentIndex - 1);
  }, [currentIndex, goToSlide]);

  const { containerRef, dragOffset } = useOnboardingSwipe({
    stepIndex: currentIndex,
    stepCount: SLIDES.length,
    onNext: advanceStep,
    onPrev: handlePrev,
  });

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      goToSlide(currentIndex + 1);
      return;
    }

    setIsCompleting(true);
    window.setTimeout(() => {
      onComplete();
    }, 300);
  };

  const handleSkip = () => {
    goToSlide(SLIDES.length - 1);
  };

  const slideTransition = dragOffset !== 0 ? '' : 'transition-transform duration-300 ease-out';

  return (
    <div
      ref={containerRef}
      className="flex min-h-dvh touch-pan-y flex-col overflow-hidden bg-background font-body-sm text-on-background selection:bg-primary-container selection:text-on-primary-container"
    >
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-full items-center justify-between px-margin-mobile">
        <div className="text-headline-md font-semibold text-primary">Roam Dash Partner</div>
        <button
          type="button"
          onClick={handleSkip}
          className={`rounded-full px-4 py-2 text-label-md font-semibold text-on-surface-variant transition-all duration-150 hover:bg-surface-container-low active:scale-95 ${
            isLastSlide ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          Skip
        </button>
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-grow flex-col px-margin-mobile pb-inset-xl pt-inset-lg">
        <div
          key={currentIndex}
          className={`relative mb-inset-lg flex w-full flex-grow items-center justify-center ${slideTransition}`}
          style={dragOffset !== 0 ? { transform: `translateX(${dragOffset}px)` } : undefined}
        >
          {SLIDES.map((slide, index) => (
            <div
              key={slide.title}
              className={`partner-carousel-slide flex flex-col items-center px-inset-md text-center ${
                index === currentIndex ? 'active' : ''
              }`}
            >
              <div className="relative mb-inset-xl flex h-48 w-48 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest shadow-sm">
                <div
                  className={`flex items-center justify-center rounded-full border-2 border-surface-container-lowest shadow-sm ${slide.badge.className}`}
                >
                  <MaterialIcon
                    name={slide.badge.icon}
                    filled
                    size={24}
                    className={slide.badge.iconClass}
                  />
                </div>
                <MaterialIcon name={slide.mainIcon} className={slide.mainIconClass} />
              </div>

              <h2 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-surface">
                {slide.title}
              </h2>
              <p className="max-w-[280px] text-body-lg text-on-surface-variant">
                {slide.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex w-full flex-col items-center gap-inset-md">
          <div className="mb-inset-sm flex items-center gap-2">
            {SLIDES.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                onClick={() => goToSlide(index)}
                className={`partner-carousel-indicator h-2 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'active bg-primary-container'
                    : 'w-2 bg-outline-variant'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={isCompleting}
            className="flex min-h-[48px] w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary-container shadow-sm transition-all duration-150 hover:opacity-90 active:scale-95 disabled:cursor-wait disabled:opacity-50"
          >
            {isLastSlide ? 'Get Started' : 'Next'}
          </button>
        </div>
      </main>
    </div>
  );
}
