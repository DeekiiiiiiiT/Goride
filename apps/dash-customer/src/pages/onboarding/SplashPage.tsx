import React, { useEffect } from 'react';

const SPLASH_MIN_MS = 2500;

type SplashPageProps = {
  onComplete: () => void;
};

export function SplashPage({ onComplete }: SplashPageProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="app-fullscreen-screen bg-surface-container-lowest selection:bg-primary-container selection:text-on-primary-container">
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-20">
        <div className="w-96 h-96 bg-primary-container rounded-full blur-[100px]" />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center w-full max-w-[1200px] mx-auto px-4">
        <div className="flex flex-col items-center dash-subtle-pulse">
          <img
            alt="Roam Dash"
            className="w-64 md:w-80 object-contain mb-8"
            src="/images/logo.png"
          />
          <h1 className="text-2xl font-semibold text-on-surface-variant tracking-tight text-center">
            Cravings. Delivered.
          </h1>
        </div>
      </main>

      <div className="absolute bottom-16 left-0 right-0 flex justify-center z-20 pb-safe">
        <div className="flex gap-2 items-center bg-surface px-6 py-3 rounded-full shadow-[0px_10px_30px_rgba(0,0,0,0.08)] border border-surface-variant/50">
          <div className="w-2.5 h-2.5 bg-primary-container rounded-full dash-loading-dot" />
          <div className="w-2.5 h-2.5 bg-primary-container rounded-full dash-loading-dot" />
          <div className="w-2.5 h-2.5 bg-primary-container rounded-full dash-loading-dot" />
        </div>
      </div>
    </div>
  );
}
