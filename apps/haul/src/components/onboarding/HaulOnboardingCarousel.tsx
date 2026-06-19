import React, { useCallback, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  HelpCircle,
  Truck,
  Wallet,
} from 'lucide-react';
import { HaulAtmosphericBg } from './HaulAtmosphericBg';
import { useOnboardingScrollLock, useOnboardingSwipe } from '../../hooks/useOnboardingSwipe';
const ROUTE_PREVIEW = './images/haul-route-preview.png';
const STEP_COUNT = 4;

type Props = {
  onFinish: () => void;
  onSkip: () => void;
};

function StepIndicators({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: STEP_COUNT }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i === activeIndex
              ? 'w-6 bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.5)]'
              : 'w-2 bg-[#2d3449]'
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}

const PREVIEW_TIMER_R = 38;
const PREVIEW_TIMER_CIRCUMFERENCE = 2 * Math.PI * PREVIEW_TIMER_R;
const PREVIEW_SECONDS_LEFT = 28;
const PREVIEW_TOTAL_SECONDS = 45;
const PREVIEW_TIMER_OFFSET =
  PREVIEW_TIMER_CIRCUMFERENCE * (1 - PREVIEW_SECONDS_LEFT / PREVIEW_TOTAL_SECONDS);

function AcceptJobsStep() {
  return (
    <>
      <header className="relative z-10 flex justify-center pt-8">
        <span className="text-xl font-black tracking-[0.2em] text-[#ffc174] uppercase">
          ROAM HAUL
        </span>
      </header>
      <div className="relative mb-5 flex w-full max-w-xs items-center justify-center py-2">
        <div
          className="absolute inset-0 animate-[spin_20s_linear_infinite] rounded-full border border-[#534434]/30 opacity-20"
          aria-hidden
        />
        <div
          className="absolute inset-8 animate-[spin_15s_linear_infinite_reverse] rounded-full border border-[#534434]/20 opacity-20"
          aria-hidden
        />
        <div className="relative">
          <div className="absolute inset-0 scale-125 rounded-full bg-[#ffc174]/20 blur-3xl" aria-hidden />
          <div
            className="relative flex aspect-[9/16] w-44 flex-col overflow-hidden rounded-[2rem] border-2 border-[#534434] bg-[#0b1326] shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_0_20px_rgba(245,158,11,0.05)]"
            aria-hidden
          >
            <div className="flex h-7 shrink-0 items-center justify-center">
              <div className="h-1 w-10 rounded-full bg-[#2d3449]" />
            </div>
            <div className="flex flex-1 flex-col items-center px-3 pb-4">
              <div className="mb-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#f59e0b] text-[#472a00]">
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  local_shipping
                </span>
              </div>
              <p className="text-[9px] font-bold tracking-[0.15em] text-[#ffc174] uppercase">
                New Freight Request
              </p>
              <p className="mt-0.5 text-[8px] text-[#d8c3ad]">High priority haul nearby</p>

              <div className="relative my-2 flex h-[72px] w-[72px] items-center justify-center">
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r={PREVIEW_TIMER_R}
                    fill="transparent"
                    stroke="#2d3449"
                    strokeWidth="5"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={PREVIEW_TIMER_R}
                    fill="transparent"
                    stroke="#ffc174"
                    strokeWidth="5"
                    strokeDasharray={PREVIEW_TIMER_CIRCUMFERENCE}
                    strokeDashoffset={PREVIEW_TIMER_OFFSET}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="flex flex-col items-center">
                  <span className="text-2xl leading-none font-extrabold text-[#dae2fd]">
                    {PREVIEW_SECONDS_LEFT}
                  </span>
                  <span className="text-[7px] font-medium tracking-wide text-[#d8c3ad] uppercase">
                    sec
                  </span>
                </div>
              </div>

              <div className="w-full rounded-lg border border-[#534434] bg-[#171f33] px-2 py-1.5 text-center">
                <p className="text-[7px] font-medium tracking-widest text-[#d8c3ad] uppercase">
                  Estimated Payout
                </p>
                <p className="text-xl leading-tight font-extrabold text-[#ffc174]">$2,450</p>
              </div>

              <div className="mt-2 grid w-full grid-cols-3 gap-1 rounded-lg border border-[#534434] bg-[#171f33] p-1.5 text-center">
                <div>
                  <p className="text-sm font-bold text-[#dae2fd]">4.2</p>
                  <p className="text-[6px] text-[#d8c3ad] uppercase">km</p>
                </div>
                <div className="border-x border-[#534434]">
                  <p className="text-sm font-bold text-[#dae2fd]">~32</p>
                  <p className="text-[6px] text-[#d8c3ad] uppercase">min</p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#dae2fd]">6</p>
                  <p className="text-[6px] text-[#d8c3ad] uppercase">items</p>
                </div>
              </div>

              <div className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-[#ffc174] py-1.5 text-[9px] font-semibold text-[#472a00]">
                <span
                  className="material-symbols-outlined text-xs"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                Accept Request
              </div>
            </div>
          </div>
          <div className="absolute -top-2 -right-2 flex h-8 w-8 animate-bounce items-center justify-center rounded-full border-4 border-[#0b1326] bg-[#ffb4ab]">
            <span className="text-sm font-bold text-white">1</span>
          </div>
          <div className="absolute -top-4 -left-4 flex h-12 w-12 animate-[haul-float_4s_ease-in-out_infinite] items-center justify-center rounded-xl border border-[#534434] bg-[#171f33] shadow-2xl">
            <Truck className="h-5 w-5 text-[#ffc174]" aria-hidden />
          </div>
          <div className="absolute -right-6 -bottom-2 flex h-14 w-14 animate-[haul-float_4s_ease-in-out_infinite_1s] items-center justify-center rounded-xl border border-[#534434] bg-[#171f33] shadow-2xl">
            <Wallet className="h-5 w-5 text-[#7bd0ff]" aria-hidden />
          </div>
        </div>
      </div>
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-[28px] leading-9 font-black tracking-tight text-[#dae2fd]">
          Accept Jobs
        </h1>
        <p className="px-4 text-lg leading-relaxed text-[#d8c3ad]">
          Receive freight requests from customers booking through the Roam app
        </p>
      </div>
    </>
  );
}

function ViewManifestStep() {
  return (
    <>
      <div className="relative mb-5 flex h-48 w-full max-w-[220px] items-center justify-center">
        <div
          className="absolute inset-2 scale-95 rotate-6 rounded-3xl bg-[#1e293b]/70 opacity-50 backdrop-blur-md"
          aria-hidden
        />
        <div
          className="absolute inset-2 -rotate-3 rounded-3xl border border-[#334155] bg-[#1e293b]/80 backdrop-blur-md"
          aria-hidden
        />
        <div className="relative flex h-44 w-44 flex-col items-center justify-center gap-3 rounded-3xl border border-[#334155] bg-[#1e293b] shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
          <span
            className="material-symbols-outlined text-[72px] leading-none text-[#ffc174]"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            assignment
          </span>
          <div className="flex gap-1.5" aria-hidden>
            <div className="h-1.5 w-12 rounded-full bg-[#ffc174]/30" />
            <div className="h-1.5 w-8 rounded-full bg-[#ffc174]/30" />
          </div>
        </div>
        <div className="absolute -right-1 bottom-0 flex animate-bounce items-center gap-2 rounded-xl border border-[#334155] bg-[#171f33] px-3 py-2 shadow-xl">
          <span className="material-symbols-outlined text-[18px] text-[#ffc174]" aria-hidden>
            scale
          </span>
          <span className="text-sm font-medium text-[#dae2fd]">42,000 lbs</span>
        </div>
      </div>
      <div className="mb-4 space-y-3 text-center">
        <h1 className="text-[28px] leading-9 font-bold tracking-tight text-white">View Manifest</h1>
        <p className="mx-auto max-w-[280px] text-lg leading-relaxed text-[#d8c3ad]">
          See exactly what you&apos;re hauling —{' '}
          <span className="text-[#dae2fd]">dimensions</span>,{' '}
          <span className="text-[#dae2fd]">weight</span>, and special handling notes.
        </p>
      </div>
      <div className="relative mb-2 w-full overflow-hidden rounded-2xl border border-[#334155] bg-[rgba(30,41,59,0.7)] p-4 text-left backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-widest text-[#ffc174] uppercase">
            Live Manifest Preview
          </span>
          <div className="h-2 w-2 animate-pulse rounded-full bg-[#56e5a9]" aria-hidden />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between border-b border-[#534434]/30 pb-1">
            <span className="text-sm text-[#d8c3ad]">Cargo Type</span>
            <span className="text-sm text-[#dae2fd]">Precision Machinery</span>
          </div>
          <div className="flex justify-between border-b border-[#534434]/30 pb-1">
            <span className="text-sm text-[#d8c3ad]">Dims</span>
            <span className="text-sm text-[#dae2fd]">48&apos; x 8.5&apos; x 9&apos;</span>
          </div>
          <div className="flex items-start gap-2 pt-1">
            <span className="material-symbols-outlined mt-0.5 shrink-0 text-base text-[#ffc174]" aria-hidden>
              warning
            </span>
            <p className="text-xs text-[#d8c3ad] italic">
              Requires oversized permits for Route 66 crossing.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function NavigateDeliverStep() {
  return (
    <>
      <header className="flex h-11 items-center justify-between border-b border-[#534434]/50 px-4">
        <span className="text-sm font-black tracking-[0.2em] text-[#ffc174] uppercase">
          ROAM HAUL
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#2d3449]">
          <HelpCircle className="h-5 w-5 text-[#ffc174]" aria-hidden />
        </div>
      </header>
      <div className="relative mb-8 flex items-center justify-center pt-4">
        <div className="relative">
          <div className="flex h-48 w-48 animate-[haul-subtle-pulse_3s_ease-in-out_infinite] items-center justify-center rounded-full border border-[#ffc174]/20 bg-[#ffc174]/10">
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-[#ffc174]/20">
              <span className="material-symbols-outlined text-[80px] text-[#ffc174]" style={{ fontVariationSettings: "'FILL' 1" }}>
                route
              </span>
            </div>
          </div>
          <div className="absolute -right-2 -bottom-2 rounded-xl border border-[#f59e0b] bg-[#f59e0b] p-3 shadow-xl">
            <span className="material-symbols-outlined text-4xl text-[#472a00]" style={{ fontVariationSettings: "'FILL' 1" }}>
              location_on
            </span>
          </div>
        </div>
      </div>
      <div className="mb-5 space-y-4 text-center">
        <h2 className="text-[28px] leading-9 font-bold text-white">Navigate &amp; Deliver</h2>
        <p className="mx-auto max-w-xs text-lg text-[#d8c3ad]">
          Turn-by-turn directions to pickup and dropoff locations
        </p>
      </div>
      <div className="mb-2 flex w-full items-center gap-4 rounded-xl border border-[#334155] bg-[rgba(30,41,59,0.7)] p-4 text-left backdrop-blur-md">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#534434] bg-[#0b1326]">
          <img src={ROUTE_PREVIEW} alt="" className="h-full w-full object-cover opacity-80" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold tracking-wider text-[#ffc174] uppercase">Current Route</div>
          <div className="font-semibold text-white">Route 66 • Heavy Load</div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-[#ffc174]" aria-hidden />
      </div>
    </>
  );
}

function GetPaidStep() {
  return (
    <>
      <div className="haul-onboarding-get-paid__hero relative mx-auto mb-8 w-full max-w-[320px]">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className="h-64 w-64 animate-pulse rounded-full border border-[#f59e0b]/20" />
          <div
            className="absolute h-48 w-48 animate-ping rounded-full border border-[#f59e0b]/10"
            style={{ animationDuration: '3s' }}
          />
        </div>
        <div className="haul-onboarding-get-paid__card relative flex aspect-[4/5] w-full flex-col gap-4 overflow-hidden rounded-xl border border-[#334155] bg-[#1E293B] p-6 shadow-2xl">
          <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-[#f59e0b]/20 blur-3xl" aria-hidden />
          <div className="-rotate-6 flex h-16 w-16 items-center justify-center rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/20 shadow-lg">
            <Wallet className="h-10 w-10 text-[#f59e0b]" aria-hidden />
          </div>
          <div className="mt-auto space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[#334155]/30 bg-[#0b1326]/50 p-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#10B981]/20">
                  <span className="material-symbols-outlined text-sm text-[#10B981]">check_circle</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-[#F8FAFC]">Haul #9921</div>
                  <div className="text-[10px] tracking-wider text-[#94A3B8] uppercase">Completed</div>
                </div>
              </div>
              <span className="text-2xl font-bold text-[#f59e0b]">+$2,450</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[#334155]/30 bg-[#0b1326]/50 p-2 opacity-60">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#10B981]/20">
                  <span className="material-symbols-outlined text-sm text-[#10B981]">check_circle</span>
                </div>
                <div>
                  <div className="text-sm font-medium text-[#F8FAFC]">Haul #9918</div>
                  <div className="text-[10px] tracking-wider text-[#94A3B8] uppercase">Deposited</div>
                </div>
              </div>
              <span className="text-2xl font-bold text-[#f59e0b]">+$1,820</span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-2 text-center">
        <h1 className="text-[28px] leading-9 font-bold tracking-tight text-[#F8FAFC]">Get Paid</h1>
        <p className="text-base leading-relaxed text-[#94A3B8]">
          Instant earnings deposited to your account after each delivery. No waiting periods, just
          pure profit.
        </p>
      </div>
    </>
  );
}

const STEPS = [
  { id: 'accept-jobs', render: AcceptJobsStep },
  { id: 'view-manifest', render: ViewManifestStep },
  { id: 'navigate-deliver', render: NavigateDeliverStep },
  { id: 'get-paid', render: GetPaidStep },
] as const;

export function HaulOnboardingCarousel({ onFinish, onSkip }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const isLast = stepIndex === STEP_COUNT - 1;

  useOnboardingScrollLock(true);

  const advanceStep = useCallback(() => {
    setStepIndex((index) => Math.min(STEP_COUNT - 1, index + 1));
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex === STEP_COUNT - 1) {
      onFinish();
      return;
    }
    setStepIndex((index) => index + 1);
  }, [onFinish, stepIndex]);

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
    <div className="haul-onboarding haul-onboarding-screen bg-[#0b1326] text-[#dae2fd]">
      <HaulAtmosphericBg variant={stepIndex === 0 ? 'industrial' : 'default'} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div ref={containerRef} className="haul-onboarding-screen__main">
          <div
            className="haul-onboarding-screen__track"
            style={{
              width: `${STEP_COUNT * 100}%`,
              transform: `translateX(calc(-${(stepIndex * 100) / STEP_COUNT}% + ${dragOffset}px))`,
              transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            {STEPS.map(({ id, render: Step }) => (
              <div
                key={id}
                className={`haul-onboarding-screen__slide${id === 'get-paid' ? ' haul-onboarding-screen__slide--get-paid' : ''}`}
                style={{ flexBasis: `${100 / STEP_COUNT}%` }}
              >
                <div className="haul-onboarding-screen__slide-content">
                  <Step />
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="haul-onboarding-screen__footer space-y-6 px-4 pt-2 pb-8">
          <StepIndicators activeIndex={stepIndex} />

        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          {stepIndex === 2 ? (
            <div className="flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={onSkip}
                className="px-6 text-sm font-medium text-[#d8c3ad] transition-colors hover:text-[#ffc174]"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f59e0b] text-base font-bold text-[#472a00] shadow-lg shadow-[#f59e0b]/20 transition-transform active:scale-95"
              >
                Next
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleNext}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] text-base font-bold text-[#472a00] transition-all active:scale-95 hover:bg-[#f59e0b]/90"
              >
                {isLast ? 'Finish' : 'Next'}
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
              {!isLast ? (
                <button
                  type="button"
                  onClick={onSkip}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-[#534434]/30 text-sm font-medium text-[#d8c3ad] transition-colors hover:border-[#a08e7a] hover:text-[#dae2fd]"
                >
                  {stepIndex === 1 ? 'Skip Intro' : 'Skip'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-center text-sm font-medium tracking-widest text-[#94A3B8] uppercase transition-colors hover:text-[#F8FAFC]"
                >
                  Back to Dashboard
                </button>
              )}
            </>
          )}
        </div>
        </footer>
      </div>
    </div>
  );
}