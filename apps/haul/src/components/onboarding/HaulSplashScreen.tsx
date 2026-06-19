import React from 'react';
import { RoamHaulLogo } from '../brand/RoamHaulLogo';
import { HaulAtmosphericBg } from './HaulAtmosphericBg';

export function HaulSplashScreen() {
  return (
    <div
      className="haul-splash flex min-h-[100dvh] flex-col items-center justify-between bg-[#0b1326] text-[#dae2fd]"
      role="status"
      aria-label="Loading Roam Haul"
    >
      <HaulAtmosphericBg variant="minimal" />

      <div className="h-16 w-full" aria-hidden />

      <main className="flex flex-1 flex-col items-center justify-center px-4">
        <div className="haul-splash__logo animate-[haul-logo-pulse_3s_ease-in-out_infinite]">
          <RoamHaulLogo className="h-16 w-48 md:h-20 md:w-64" />
        </div>
      </main>

      <footer className="safe-area-bottom flex w-full flex-col items-center pb-8">
        <div className="mb-6">
          <div className="haul-splash__loader" aria-hidden />
        </div>
        <div className="text-center">
          <p className="text-lg tracking-widest text-[#dae2fd] uppercase opacity-80">
            Freight. Delivered.
          </p>
        </div>
        <div className="mt-1">
          <span className="text-[10px] font-medium tracking-[0.3em] text-[#d8c3ad]/40 uppercase">
            Enterprise Logistics Engine
          </span>
        </div>
      </footer>
    </div>
  );
}
