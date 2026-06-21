import React from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type WelcomePageProps = {
  onGetStarted: () => void;
  onSignIn: () => void;
};

export function WelcomePage({ onGetStarted, onSignIn }: WelcomePageProps) {
  return (
    <div className="app-fullscreen-screen bg-background text-on-background antialiased">
      <div className="relative h-2/3 w-full bg-surface-container-high rounded-b-[2.5rem] overflow-hidden shadow-[0px_10px_30px_rgba(0,0,0,0.08)] shrink-0">
        <img
          alt="Premium food spread"
          className="absolute inset-0 w-full h-full object-cover"
          src="/images/welcome-hero.png"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40" />
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-6 py-2 rounded-full shadow-lg pt-safe">
          <span className="text-xl font-semibold text-primary tracking-tight">Roam Dash</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-between px-4 pt-8 pb-10 -mt-6 relative z-10 min-h-0">
        <div className="text-center space-y-4 pt-4">
          <h1 className="text-[28px] leading-[34px] font-bold text-on-surface tracking-tight md:text-[48px] md:leading-[56px]">
            Welcome to <br className="md:hidden" />
            <span className="text-primary-container">Roam Dash</span>
          </h1>
          <p className="text-lg leading-7 text-on-surface-variant max-w-md mx-auto">
            Your favorite restaurants, delivered to your door with exceptional care.
          </p>
        </div>

        <div className="w-full max-w-sm mx-auto space-y-4 mt-auto">
          <button
            type="button"
            onClick={onGetStarted}
            className="w-full bg-primary-container text-white py-4 px-6 rounded-lg text-sm font-semibold tracking-wide shadow-md hover:bg-primary-container/90 transition-all active:scale-95 flex items-center justify-center gap-2 group"
          >
            Get Started
            <MaterialIcon
              name="arrow_forward"
              className="text-[18px] group-hover:translate-x-1 transition-transform"
            />
          </button>
          <button
            type="button"
            onClick={onSignIn}
            className="w-full bg-transparent text-primary py-4 px-6 rounded-lg text-sm font-semibold tracking-wide border border-primary/20 hover:bg-primary/5 transition-colors active:scale-95"
          >
            I already have an account
          </button>
        </div>
      </div>
    </div>
  );
}
