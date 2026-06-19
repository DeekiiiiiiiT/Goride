import React from 'react';

export function HaulAuthAtmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-[600px] w-[600px] animate-[haul-glow-pulse_8s_ease-in-out_infinite] rounded-full bg-[#ffc174]/5 blur-[120px] mix-blend-screen" />
      </div>
      <div className="absolute top-[-20%] left-[-10%] h-[50%] w-[50%] rounded-full bg-[#ffc174]/5 blur-[120px]" />
      <div className="absolute right-[-10%] bottom-[-10%] h-[40%] w-[40%] rounded-full bg-[#222a3d]/40 blur-[100px]" />
    </div>
  );
}
