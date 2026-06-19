import React, { useState } from 'react';
import { HaulSubpageHeader } from './HaulSubpageHeader';

const CATEGORIES = [
  { icon: 'rocket_launch', color: 'text-[#ffc174]', title: 'Getting Started', desc: 'Onboarding, app basics, and requirements.' },
  { icon: 'local_shipping', color: 'text-[#7bd0ff]', title: 'Jobs & Deliveries', desc: 'Finding loads, routing, and delivery protocols.' },
  { icon: 'payments', color: 'text-[#56e5a9]', title: 'Earnings & Payments', desc: 'Invoices, payouts, and settlement issues.' },
  { icon: 'manage_accounts', color: 'text-[#ffb95f]', title: 'Account & Profile', desc: 'Manage documents, vehicle details, and settings.' },
  { icon: 'health_and_safety', color: 'text-[#ffb4ab]', title: 'Safety', desc: 'Compliance, reporting incidents, and protocols.' },
];

type Props = {
  onBack: () => void;
};

export function HaulHelpSupportPage({ onBack }: Props) {
  const [query, setQuery] = useState('');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Help & Support" onBack={onBack} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[88px] pb-8">
        <div className="relative mb-6 max-w-2xl">
          <span className="material-symbols-outlined pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#a08e7a]">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="How can we help?"
            className="h-14 w-full rounded-lg border border-[#534434] bg-[#131b2e] pr-4 pl-11 text-lg text-[#dae2fd] placeholder:text-[#d8c3ad] outline-none focus:border-[#ffc174] focus:ring-1 focus:ring-[#ffc174]"
          />
        </div>

        <button
          type="button"
          className="mb-8 flex h-14 w-full items-center justify-center gap-2 rounded-lg border border-[#ffb4ab]/30 bg-[#93000a] text-lg font-semibold text-[#ffdad6] shadow-lg active:scale-95 md:w-auto md:px-8"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            emergency
          </span>
          Call Emergency Dispatch
        </button>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.title}
              type="button"
              className="group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] p-6 text-left transition-colors hover:border-[#ffc174]"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg border border-[#534434] bg-[#2d3449] ${cat.color} transition-colors group-hover:bg-[#ffc174] group-hover:text-[#472a00]`}>
                <span className="material-symbols-outlined text-2xl">{cat.icon}</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[#dae2fd]">{cat.title}</h3>
                <p className="text-sm text-[#d8c3ad]">{cat.desc}</p>
              </div>
            </button>
          ))}
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-[#534434] bg-[#222a3d] p-6">
            <div>
              <h3 className="text-lg font-semibold text-[#dae2fd]">Need more help?</h3>
              <p className="mt-1 text-sm text-[#d8c3ad]">
                Our dispatcher team is available 24/7 for active hauls.
              </p>
            </div>
            <button
              type="button"
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-[#ffc174] text-sm font-medium text-[#472a00]"
            >
              <span className="material-symbols-outlined">chat</span>
              Chat with us
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
