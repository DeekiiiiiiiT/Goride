import React, { useEffect, useState } from 'react';
import { RoamDashLogo } from '@/components/brand/RoamDashLogo';

const SPLASH_MIN_MS = 2000;

type SplashPageProps = {
  onComplete: () => void;
};

export function SplashPage({ onComplete }: SplashPageProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const revealTimer = window.setTimeout(() => setVisible(true), 100);
    const completeTimer = window.setTimeout(onComplete, SPLASH_MIN_MS);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="bg-background min-h-full w-full flex flex-col items-center justify-between overflow-hidden antialiased pt-safe pb-safe selection:bg-primary-container selection:text-on-primary-container">
      <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center -z-10 opacity-30">
        <div className="w-[80vw] h-[80vw] md:w-[600px] md:h-[600px] bg-primary-container rounded-full blur-[80px] courier-ambient-pulse mix-blend-multiply opacity-20" />
      </div>

      <div className="h-16 w-full shrink-0" />

      <main className="flex-1 w-full flex flex-col items-center justify-center px-[var(--spacing-edge)] relative z-10">
        <div
          className={`relative flex flex-col items-center justify-center mb-8 transform transition-all duration-1000 ease-out ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <div className="w-48 h-24 md:w-64 md:h-28 mb-6 relative">
            <div className="absolute inset-0 bg-primary-container blur-[40px] opacity-20 rounded-full" />
            <RoamDashLogo className="w-full h-full relative z-10 drop-shadow-sm" />
          </div>

          <div className="mt-2 bg-secondary/10 text-secondary px-4 py-1.5 rounded-full border border-secondary/20 text-xs font-semibold tracking-widest uppercase flex items-center gap-2 backdrop-blur-sm shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            Courier
          </div>
        </div>
      </main>

      <footer className="w-full flex flex-col items-center justify-end pb-12 px-[var(--spacing-edge)] relative z-10 shrink-0">
        <p className="text-[#1C1917] text-sm mb-8 tracking-wide font-medium opacity-80">
          Deliver. Earn. Repeat.
        </p>
        <div className="w-48 md:w-64 h-1 bg-surface-container-high rounded-full overflow-hidden relative shadow-sm">
          <div className="absolute top-0 left-0 h-full bg-primary-container rounded-full courier-loading-bar" />
        </div>
      </footer>
    </div>
  );
}
