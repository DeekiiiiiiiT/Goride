import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type WelcomePageProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function WelcomePage({ onGetStarted, onSignIn }: WelcomePageProps) {
  return (
    <div className="bg-background text-on-background antialiased h-full w-full overflow-hidden flex flex-col">
      <header className="w-full flex justify-center items-center pt-safe pt-6 px-[var(--spacing-edge)] h-20 shrink-0">
        <div className="flex items-center gap-2">
          <MaterialIcon name="moped" className="text-primary-container text-[32px]" filled />
          <h1 className="text-2xl font-semibold text-on-surface tracking-tight">Roam Dash</h1>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-between px-[var(--spacing-edge)] pb-safe w-full max-w-md mx-auto">
        <div className="w-full flex-1 flex flex-col items-center justify-center min-h-0 relative">
          <div className="absolute inset-0 bg-primary-container/10 rounded-full blur-[80px] -z-10 scale-75" />
          <div className="w-full max-w-[280px] aspect-square relative drop-shadow-xl flex items-center justify-center">
            <img
              src="/images/courier-hero.png"
              alt="Courier on a scooter delivering food"
              className="w-full h-full object-contain rounded-3xl"
            />
          </div>
        </div>

        <div className="w-full flex flex-col items-center text-center gap-6 pb-8 shrink-0 mt-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-[28px] leading-9 font-bold tracking-tight text-on-background">
              Welcome to
              <br />
              Roam Dash Courier
            </h2>
            <p className="text-base leading-6 text-muted px-4">
              Deliver food from local restaurants and earn on your schedule.
            </p>
          </div>

          <div className="w-full flex flex-col gap-4 mt-4">
            <button
              type="button"
              onClick={onGetStarted}
              className="w-full h-14 bg-primary-container hover:bg-primary-container/90 active:scale-95 duration-100 transition-all text-on-primary-container font-semibold text-lg rounded-xl shadow-[0_6px_12px_rgba(16,185,129,0.1)] flex items-center justify-center group"
            >
              <span>Get Started</span>
              <MaterialIcon
                name="arrow_forward"
                className="ml-2 group-hover:translate-x-1 transition-transform"
              />
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="h-12 flex items-center justify-center text-muted text-xs font-semibold tracking-wide hover:text-on-background transition-colors"
            >
              I already have an account
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
