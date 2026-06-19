import React, { useEffect, useState } from 'react';

const STATUS_MESSAGES = [
  'Verifying location...',
  'Checking connection...',
  'Syncing freight data...',
  'Ready for dispatch',
];

export function HaulGoingOnlineScreen() {
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 2500);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="relative flex min-h-[60vh] flex-col items-center justify-center">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
        <div className="h-64 w-64 rounded-full bg-[#ffc174] blur-[100px]" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative mb-8 h-48 w-48">
          <svg className="haul-spinner-outer absolute inset-0 h-full w-full text-[#ffc174]/30" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="10 20"
              strokeLinecap="round"
            />
          </svg>
          <svg className="absolute inset-0 h-full w-full text-[#ffc174]" viewBox="0 0 100 100">
            <circle
              className="animate-[haul-spin_3s_linear_infinite]"
              cx="50"
              cy="50"
              r="35"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="80 150"
              strokeLinecap="round"
            />
          </svg>
          <svg className="haul-spinner-inner absolute inset-0 h-full w-full text-[#ffb95f]" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="25"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="40 80"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="material-symbols-outlined animate-pulse text-4xl text-[#ffc174]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              satellite_alt
            </span>
          </div>
        </div>

        <h2 className="mb-2 text-center text-[48px] leading-[56px] font-extrabold tracking-tight text-[#dae2fd]">
          Going online...
        </h2>
        <div className="haul-fade-text relative h-12 w-full max-w-[200px] text-center text-sm text-[#d8c3ad]">
          {STATUS_MESSAGES[statusIdx]}
        </div>
      </div>
    </div>
  );
}
