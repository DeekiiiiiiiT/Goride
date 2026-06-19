import React from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { HaulAtmosphericBg } from './HaulAtmosphericBg';
import { useOnboardingScrollLock } from '../../hooks/useOnboardingSwipe';

const VAN_HERO = './images/haul-van-hero.png';

type Props = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function HaulWelcomeScreen({ onGetStarted, onSignIn }: Props) {
  useOnboardingScrollLock(true);

  return (
    <div className="haul-onboarding haul-onboarding-screen bg-[#0b1326] text-[#dae2fd]">
      <HaulAtmosphericBg variant="default" />

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col items-center justify-center px-4 py-6 md:px-12">
        <div className="relative mb-8 flex aspect-square w-full max-w-[400px] items-center justify-center">
          <div className="absolute inset-0 scale-90 rounded-full bg-[#171f33] opacity-20 blur-3xl" aria-hidden />
          <img
            src={VAN_HERO}
            alt="Roam Haul cargo delivery van"
            className="relative z-10 h-full w-full object-contain drop-shadow-[0_0_40px_rgba(245,158,11,0.15)] transition-transform duration-700"
          />
        </div>

        <div className="max-w-lg space-y-4 text-center">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight text-[#f59e0b] md:text-[32px] md:leading-10">
            Welcome to ROAM HAUL
          </h1>
          <p className="px-4 text-lg leading-7 text-[#d8c3ad] md:px-0">
            Deliver furniture, appliances, and freight on your schedule with professional reliability.
          </p>
        </div>
      </main>

      <footer className="haul-onboarding-screen__footer relative z-10 w-full px-4 pt-4 pb-8 md:px-12">
        <div className="mx-auto max-w-md space-y-4">
          <button
            type="button"
            onClick={onGetStarted}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f59e0b] text-base font-semibold text-[#472a00] shadow-lg transition-all active:scale-95 hover:brightness-110"
          >
            Get Started
            <ArrowRight className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-[#534434] text-sm font-medium text-[#dae2fd] transition-colors hover:bg-[#2d3449]"
          >
            I already have an account
          </button>
          <div className="flex items-center justify-center gap-4 pt-2 opacity-40 grayscale transition-all hover:grayscale-0">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span className="text-[10px] font-bold tracking-widest uppercase">
              Industrial Grade Security
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
