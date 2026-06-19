import React from 'react';
import { HaulSubpageHeader } from './HaulSubpageHeader';

type Props = {
  onBack: () => void;
};

export function HaulAboutPage({ onBack }: Props) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="About" onBack={onBack} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-[88px] pb-8">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <h2 className="text-2xl font-black tracking-[0.2em] text-[#ffc174] uppercase">Roam Haul</h2>
          <p className="text-[#d8c3ad]">Version 0.1.0</p>
        </div>
        <div className="space-y-4 rounded-xl border border-[#534434] bg-[#171f33] p-6 text-[#d8c3ad]">
          <p>
            Roam Haul connects independent haulers with freight jobs across Jamaica. Built for reliability,
            compliance, and fair payouts.
          </p>
          <p className="text-sm">© {new Date().getFullYear()} Roam. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
