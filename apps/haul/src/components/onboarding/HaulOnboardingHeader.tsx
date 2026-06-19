import React from 'react';
import { ArrowLeft } from 'lucide-react';

type Props = {
  onBack?: () => void;
  title?: string;
};

export function HaulOnboardingHeader({ onBack, title = 'RoamHaul' }: Props) {
  return (
    <header className="fixed top-0 z-50 flex h-11 w-full items-center justify-between border-b border-[#534434] bg-[#0b1326]/80 px-4 backdrop-blur-md md:px-12">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 text-[#ffc174] transition-colors hover:bg-[#2d3449] active:scale-95"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      ) : (
        <div className="min-w-11" />
      )}
      <span className="text-lg font-bold tracking-wider text-[#ffc174] uppercase">{title}</span>
      <div className="min-w-11" aria-hidden />
    </header>
  );
}
